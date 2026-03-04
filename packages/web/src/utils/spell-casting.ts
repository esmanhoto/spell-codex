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

export function canCasterUseSpell(spell: CardInfo, caster: CardInfo): boolean {
  if (!isSpellCard(spell)) return false
  if (caster.supportIds.includes(spell.typeId)) return true

  const nature = getSpellNature(spell)
  if (nature === "offensive") return caster.supportIds.includes(`o${spell.typeId}`)
  if (nature === "defensive") return caster.supportIds.includes(`d${spell.typeId}`)

  return (
    caster.supportIds.includes(`o${spell.typeId}`) || caster.supportIds.includes(`d${spell.typeId}`)
  )
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

export function spellCastersInPool(spell: CardInfo, board: PlayerBoard): CardInfo[] {
  return board.pool
    .map((entry) => entry.champion)
    .filter((champ) => canCasterUseSpell(spell, champ))
}

export function spellCasterInCombat(
  spell: CardInfo,
  combat: CombatInfo | null,
  myPlayerId: string,
): CardInfo[] {
  if (!combat || combat.roundPhase !== "CARD_PLAY") return []

  const isAttacker = combat.attackingPlayer === myPlayerId
  const activeChampion = isAttacker ? combat.attacker : combat.defender
  if (!activeChampion) return []
  if (!canCasterUseSpell(spell, activeChampion)) return []

  return [activeChampion]
}
