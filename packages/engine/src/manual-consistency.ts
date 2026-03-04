import type { CardInstance, GameState } from "./types.ts"
import { CardTypeId, COSMOS_TYPE_IDS } from "./constants.ts"
import { isChampionType } from "./utils.ts"

export interface ManualConsistencyIssue {
  code: string
  message: string
}

const WORLD_WILDCARD = new Set([0, 9])

function worldsCompatible(a: number, b: number): boolean {
  return WORLD_WILDCARD.has(a) || WORLD_WILDCARD.has(b) || a === b
}

function pushDuplicateIdIssue(
  issues: ManualConsistencyIssue[],
  id: string,
  firstLocation: string,
  secondLocation: string,
): void {
  issues.push({
    code: "STRUCTURAL_DUPLICATE_INSTANCE_ID",
    message: `Card instance ${id} appears in multiple zones (${firstLocation}, ${secondLocation}).`,
  })
}

export function validateManualStateForSemiAuto(state: GameState): ManualConsistencyIssue[] {
  const issues: ManualConsistencyIssue[] = []

  if (state.combatState) {
    issues.push({
      code: "STRUCTURAL_COMBAT_ACTIVE",
      message: "Cannot switch to semi_auto while combat is active.",
    })
  }

  const seenInstanceLocation = new Map<string, string>()
  const cosmosKeys = new Map<string, Array<{ ownerId: string; card: CardInstance; zone: string }>>()

  function markInstance(ownerId: string, card: CardInstance, zone: string): void {
    const prev = seenInstanceLocation.get(card.instanceId)
    const current = `${ownerId}:${zone}`
    if (prev) {
      pushDuplicateIdIssue(issues, card.instanceId, prev, current)
      return
    }
    seenInstanceLocation.set(card.instanceId, current)
  }

  function trackCosmos(ownerId: string, card: CardInstance, zone: string): void {
    if (!COSMOS_TYPE_IDS.has(card.card.typeId)) return
    const key = `${card.card.typeId}:${card.card.name}`
    const arr = cosmosKeys.get(key) ?? []
    arr.push({ ownerId, card, zone })
    cosmosKeys.set(key, arr)
  }

  for (const [ownerId, player] of Object.entries(state.players)) {
    for (const card of player.hand) markInstance(ownerId, card, "hand")
    for (const card of player.drawPile) markInstance(ownerId, card, "draw")
    for (const card of player.discardPile) markInstance(ownerId, card, "discard")
    for (const card of player.abyss) markInstance(ownerId, card, "abyss")
    if (player.dungeon) markInstance(ownerId, player.dungeon, "dungeon")

    for (const entry of player.limbo) {
      markInstance(ownerId, entry.champion, "limbo.champion")
      for (const attachment of entry.attachments) {
        markInstance(ownerId, attachment, "limbo.attachment")
      }
    }

    for (const entry of player.pool) {
      markInstance(ownerId, entry.champion, "pool.champion")
      trackCosmos(ownerId, entry.champion, "pool.champion")
      if (!isChampionType(entry.champion.card.typeId)) {
        issues.push({
          code: "STRUCTURAL_POOL_CHAMPION_TYPE",
          message: `Pool entry ${entry.champion.card.name} is not a champion type.`,
        })
      }

      for (const attachment of entry.attachments) {
        markInstance(ownerId, attachment, "pool.attachment")
        trackCosmos(ownerId, attachment, "pool.attachment")
        if (
          attachment.card.typeId !== CardTypeId.Artifact &&
          attachment.card.typeId !== CardTypeId.MagicalItem
        ) {
          issues.push({
            code: "STRUCTURAL_POOL_ATTACHMENT_TYPE",
            message: `Attachment ${attachment.card.name} is not an artifact/magical item.`,
          })
        }
        if (
          attachment.card.typeId === CardTypeId.MagicalItem &&
          !worldsCompatible(attachment.card.worldId, entry.champion.card.worldId)
        ) {
          issues.push({
            code: "WORLD_MISMATCH_MAGICAL_ITEM",
            message: `Magical item ${attachment.card.name} world mismatches champion ${entry.champion.card.name}.`,
          })
        }
      }
    }

    for (const [slot, realmSlot] of Object.entries(player.formation.slots)) {
      if (!realmSlot) continue
      markInstance(ownerId, realmSlot.realm, `formation.${slot}.realm`)
      trackCosmos(ownerId, realmSlot.realm, `formation.${slot}.realm`)
      if (realmSlot.realm.card.typeId !== CardTypeId.Realm) {
        issues.push({
          code: "STRUCTURAL_REALM_TYPE",
          message: `Formation slot ${slot} contains non-realm card ${realmSlot.realm.card.name}.`,
        })
      }

      if (realmSlot.isRazed && realmSlot.holdings.length > 0) {
        issues.push({
          code: "STRUCTURAL_RAZED_REALM_HAS_HOLDINGS",
          message: `Razed realm slot ${slot} still has holdings attached.`,
        })
      }

      for (const holding of realmSlot.holdings) {
        markInstance(ownerId, holding, `formation.${slot}.holding`)
        trackCosmos(ownerId, holding, `formation.${slot}.holding`)
        if (holding.card.typeId !== CardTypeId.Holding) {
          issues.push({
            code: "STRUCTURAL_HOLDING_TYPE",
            message: `Formation slot ${slot} includes non-holding ${holding.card.name}.`,
          })
        }
        if (!worldsCompatible(holding.card.worldId, realmSlot.realm.card.worldId)) {
          issues.push({
            code: "WORLD_MISMATCH_HOLDING",
            message: `Holding ${holding.card.name} world mismatches realm ${realmSlot.realm.card.name} (slot ${slot}).`,
          })
        }
      }
    }
  }

  for (const [key, entries] of cosmosKeys.entries()) {
    if (entries.length <= 1) continue
    const [typeId, cardName] = key.split(":")
    const labels = entries.map((entry) => `${entry.ownerId}:${entry.zone}`).join(", ")
    issues.push({
      code: "COSMOS_DUPLICATE_IN_PLAY",
      message: `Duplicate in-play cosmos card ${cardName} (type ${typeId}) at ${labels}.`,
    })
  }

  return issues
}
