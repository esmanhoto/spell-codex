import type { CardInstance, CardEffectSpec, CombatState, PlayerId } from "./types.ts"
import { CardTypeId, WORLD_BONUS } from "./constants.ts"
import { parseLevel, parseMagicalItemBonus, findEffectSpec, conditionMet } from "./utils.ts"

/**
 * Calculates the adjusted combat level for a champion, applying:
 *   1. World bonus (+3 if champion's world matches target realm's world)
 *   2. SET_LEVEL effects (override base level)
 *   3. NEGATE_ALLY_BONUS effects (from opponent's cards)
 *   4. Ally bonuses (type 1 cards)
 *   5. Magical item bonuses (type 9 cards)
 *   6. LEVEL_BONUS and LEVEL_BONUS_VS from Tier 1 effect specs
 *
 * Cards without a matching effect spec are handled purely by level math.
 * Cards that need special handling beyond level math should have been
 * flagged for manual resolution before this is called.
 */
export function calculateCombatLevel(
  champion: CardInstance,
  combatCards: CardInstance[],
  worldMatch: boolean,
  effectSpecs: CardEffectSpec[],
  side: "offensive" | "defensive",
): number {
  let level = parseLevel(champion.card.level)

  // World bonus
  if (worldMatch) level += WORLD_BONUS

  // Check for SET_LEVEL on the champion (overrides base level, keeps world bonus)
  const championSpec = findEffectSpec(champion, effectSpecs)
  if (championSpec) {
    for (const effect of championSpec.effects) {
      if (effect.type === "SET_LEVEL") {
        level = effect.value + (worldMatch ? WORLD_BONUS : 0)
        break
      }
    }
  }

  // Pre-pass: detect NEGATE_ALLY_BONUS before applying any ally contributions
  const negateAllyBonus = combatCards.some(card => {
    const spec = findEffectSpec(card, effectSpecs)
    return spec?.effects.some(e => e.type === "NEGATE_ALLY_BONUS") ?? false
  })

  for (const card of combatCards) {
    const spec = findEffectSpec(card, effectSpecs)

    if (spec) {
      for (const effect of spec.effects) {
        switch (effect.type) {
          case "NEGATE_ALLY_BONUS":
            break  // already handled in pre-pass
          case "LEVEL_BONUS":
            if (conditionMet(effect.condition, champion, side)) {
              level += effect.value
            }
            break
          case "LEVEL_BONUS_VS":
            if (champion.card.attributes.includes(effect.targetAttribute)) {
              level += effect.value
            }
            break
        }
      }
    } else {
      // No spec — apply type-based level math
      if (card.card.typeId === CardTypeId.Ally) {
        if (!negateAllyBonus) {
          level += parseLevel(card.card.level, side)
        }
      } else if (card.card.typeId === CardTypeId.MagicalItem) {
        const bonus = parseMagicalItemBonus(card.card.description)
        level += side === "offensive" ? bonus.offensive : bonus.defensive
      }
    }
  }

  return Math.max(0, level)
}

/**
 * Determines which player is currently LOSING a combat round.
 * The losing player may freely play combat cards.
 * Ties go to the defender — so the attacker is "losing" on a tie.
 */
export function getLosingPlayer(
  attackerLevel: number,
  defenderLevel: number,
  combat: CombatState,
): PlayerId {
  // Attacker wins only if strictly greater — on a tie the defender wins
  return attackerLevel > defenderLevel
    ? combat.defendingPlayer
    : combat.attackingPlayer
}

/**
 * Compares final levels and returns the combat round outcome.
 * Attacker must STRICTLY beat the defender (ties go to defender).
 * WALL is detected upstream by card effects — this function only handles ATTACKER/DEFENDER outcomes.
 */
export function resolveCombatRound(
  attackerLevel: number,
  defenderLevel: number,
): "ATTACKER_WINS" | "DEFENDER_WINS" {
  return attackerLevel > defenderLevel ? "ATTACKER_WINS" : "DEFENDER_WINS"
}

/**
 * Returns true if the champion's world matches the target realm's world.
 * World-agnostic champions (worldId=0) never get the world bonus.
 */
export function hasWorldMatch(
  champion: CardInstance,
  realmWorldId: number,
): boolean {
  return champion.card.worldId !== 0 &&
    realmWorldId !== 0 &&
    champion.card.worldId === realmWorldId
}
