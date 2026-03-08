import type { CardInfo, Move, PlayerBoard, CombatInfo } from "../api.ts"

const SPELL_TYPE_IDS = new Set([4, 19]) // Cleric Spell, Wizard Spell

export function isSpellCard(card: CardInfo): boolean {
  return SPELL_TYPE_IDS.has(card.typeId)
}

function getSpellNature(card: CardInfo): "offensive" | "defensive" | null {
  return card.spellNature ?? null
}

export function getCastPhases(card: CardInfo): Array<3 | 4 | 5> {
  if (card.castPhases.length > 0) return [...new Set(card.castPhases)]
  return [4]
}

/**
 * Collects the union of supportIds from a card and all context sources.
 * Mirrors the engine's getEffectiveSupportIds — kept in sync manually.
 *
 * @param card - The champion card
 * @param attachments - Magical items / artifacts attached to the champion
 * @param defendingRealm - The realm being defended in combat (defender context only)
 * @param holdings - Holdings on the defending realm
 */
function effectiveSupportIds(
  card: CardInfo,
  attachments: CardInfo[] = [],
  defendingRealm?: CardInfo,
  holdings?: CardInfo[],
): Array<number | string> {
  const ids = new Set<number | string>()
  for (const id of card.supportIds) ids.add(id)
  for (const att of attachments) for (const id of att.supportIds) ids.add(id)
  if (defendingRealm) for (const id of defendingRealm.supportIds) ids.add(id)
  for (const h of holdings ?? []) for (const id of h.supportIds) ids.add(id)
  return [...ids]
}

/**
 * Core spell-casting check against a pre-built support set.
 */
function canCastWithSupport(spell: CardInfo, supportIds: Array<number | string>): boolean {
  if (!isSpellCard(spell)) return false
  const typeRef = spell.typeId
  if (supportIds.includes(typeRef)) return true
  const nature = getSpellNature(spell)
  if (nature === "offensive") return supportIds.includes(`o${typeRef}`)
  if (nature === "defensive") return supportIds.includes(`d${typeRef}`)
  return supportIds.includes(`o${typeRef}`) || supportIds.includes(`d${typeRef}`)
}

export function phaseToCastPhase(phase: string): 3 | 4 | 5 | null {
  if (phase === "PLAY_REALM" || phase === "POOL") return 3
  if (phase === "COMBAT") return 4
  if (phase === "PHASE_FIVE") return 5
  return null
}

export function resolveSpellMove(legalMoves: Move[], spellInstanceId: string): Move | null {
  return (
    legalMoves.find(
      (m) =>
        m.type === "PLAY_COMBAT_CARD" &&
        (m as { cardInstanceId: string }).cardInstanceId === spellInstanceId,
    ) ??
    legalMoves.find(
      (m) =>
        m.type === "PLAY_PHASE3_CARD" &&
        (m as { cardInstanceId: string }).cardInstanceId === spellInstanceId,
    ) ??
    legalMoves.find(
      (m) =>
        m.type === "PLAY_PHASE5_CARD" &&
        (m as { cardInstanceId: string }).cardInstanceId === spellInstanceId,
    ) ??
    null
  )
}

/**
 * Returns pool champions that can cast the given spell,
 * considering each champion's own supportIds plus their attachments.
 */
export function spellCastersInPool(spell: CardInfo, board: PlayerBoard): CardInfo[] {
  return board.pool
    .filter((entry) =>
      canCastWithSupport(spell, effectiveSupportIds(entry.champion, entry.attachments)),
    )
    .map((entry) => entry.champion)
}

/**
 * Returns the active combat champion if they can cast the given spell.
 * For the defender, also considers their defending realm and holdings.
 *
 * @param allBoards - Full board state for all players (used to look up the defending realm)
 */
export function spellCasterInCombat(
  spell: CardInfo,
  combat: CombatInfo | null,
  myPlayerId: string,
  board: PlayerBoard,
  allBoards: Record<string, PlayerBoard>,
): CardInfo[] {
  if (!combat || combat.roundPhase !== "CARD_PLAY") return []

  const isAttacker = combat.attackingPlayer === myPlayerId
  const activeChampion = isAttacker ? combat.attacker : combat.defender
  if (!activeChampion) return []

  const poolEntry = board.pool.find((e) => e.champion.instanceId === activeChampion.instanceId)
  const attachments = poolEntry?.attachments ?? []

  // Defender gets bonus supportIds from the realm they're defending and its holdings
  let defendingRealm: CardInfo | undefined
  let holdings: CardInfo[] | undefined
  if (!isAttacker) {
    const defenderBoard = allBoards[combat.defendingPlayer]
    const slot = defenderBoard?.formation[combat.targetSlot]
    if (slot) {
      defendingRealm = slot.realm
      holdings = slot.holdings
    }
  }

  const supportIds = effectiveSupportIds(activeChampion, attachments, defendingRealm, holdings)
  if (!canCastWithSupport(spell, supportIds)) return []

  return [activeChampion]
}
