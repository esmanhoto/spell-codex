/**
 * Shared serialization helpers used by both API (server-side) and web (client-side).
 * Transforms engine internal types into the wire-format shape.
 */
import type { CardInstance, Formation, GameState, PoolEntry } from "./types.ts"
import { getCombatLevels } from "./combat.ts"

export function serializeCard(inst: CardInstance) {
  return {
    instanceId: inst.instanceId,
    name: inst.card.name,
    typeId: inst.card.typeId,
    worldId: inst.card.worldId,
    level: inst.card.level,
    setId: inst.card.setId,
    cardNumber: inst.card.cardNumber,
    description: inst.card.description,
    supportIds: inst.card.supportIds,
    spellNature: inst.card.spellNature ?? null,
    castPhases: inst.card.castPhases ?? [],
  }
}

export function serializeFormation(f: Formation, ownerPlayerId: string, viewerPlayerId?: string) {
  const isOwnerView = viewerPlayerId != null && viewerPlayerId === ownerPlayerId
  const SLOTS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].slice(0, f.size)
  return Object.fromEntries(
    SLOTS.map((s) => {
      const slot = f.slots[s as keyof typeof f.slots]
      if (!slot) return [s, null]
      const revealedToAll = slot.holdingRevealedToAll ?? false
      const canSeeHoldings = isOwnerView || revealedToAll
      return [
        s,
        {
          realm: serializeCard(slot.realm),
          holdings: canSeeHoldings ? slot.holdings.map(serializeCard) : [],
          holdingCount: slot.holdings.length,
          isRazed: slot.isRazed,
          holdingRevealedToAll: revealedToAll,
        },
      ]
    }),
  )
}

export function serializePool(pool: PoolEntry[]) {
  return pool.map((e) => ({
    champion: serializeCard(e.champion),
    attachments: e.attachments.map(serializeCard),
  }))
}

export function serializeCombat(state: GameState) {
  const c = state.combatState!
  const { attackerLevel, defenderLevel } = getCombatLevels(state, c)

  return {
    attackingPlayer: c.attackingPlayer,
    defendingPlayer: c.defendingPlayer,
    targetSlot: c.targetRealmSlot,
    roundPhase: c.roundPhase,
    attacker: c.attacker ? serializeCard(c.attacker) : null,
    defender: c.defender ? serializeCard(c.defender) : null,
    attackerCards: c.attackerCards.map(serializeCard),
    defenderCards: c.defenderCards.map(serializeCard),
    attackerLevel,
    defenderLevel,
    attackerManualLevel: c.attackerManualLevel,
    defenderManualLevel: c.defenderManualLevel,
    championsUsedThisBattle: c.championsUsedThisBattle,
    borrowedChampions: c.borrowedChampions,
  }
}
