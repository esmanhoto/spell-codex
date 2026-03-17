import type { CardInstance, CombatState, GameState, PlayerId } from "./types.ts"
import { CardTypeId, SPELL_TYPE_IDS, WORLD_BONUS } from "./constants.ts"
import { parseLevel } from "./utils.ts"

/**
 * Calculates the adjusted combat level for a champion, applying:
 *   1. World bonus (+3 if champion's world matches target realm's world)
 *   2. Pool attachment bonuses (allies, items already on the champion)
 *   3. Combat card bonuses (allies, items, spells played during combat)
 */
export function calculateCombatLevel(
  champion: CardInstance,
  combatCards: CardInstance[],
  worldMatch: boolean,
  side: "offensive" | "defensive",
  poolAttachments: CardInstance[] = [],
): number {
  let level = parseLevel(champion.card.level)

  // World bonus
  if (worldMatch) level += WORLD_BONUS

  for (const card of [...poolAttachments, ...combatCards]) {
    const t = card.card.typeId
    if (
      t === CardTypeId.Ally ||
      t === CardTypeId.MagicalItem ||
      t === CardTypeId.Artifact ||
      SPELL_TYPE_IDS.has(t)
    ) {
      level += parseLevel(card.card.level, side)
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
  return attackerLevel > defenderLevel ? combat.defendingPlayer : combat.attackingPlayer
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
export function hasWorldMatch(champion: CardInstance, realmWorldId: number): boolean {
  return champion.card.worldId !== 0 && realmWorldId !== 0 && champion.card.worldId === realmWorldId
}

/** Look up a champion's pool attachments from game state. */
export function getPoolAttachments(
  state: GameState,
  playerId: PlayerId,
  championId: string,
): CardInstance[] {
  const entry = state.players[playerId]?.pool.find((e) => e.champion.instanceId === championId)
  return entry?.attachments ?? []
}

/** Extracts realmWorldId and defenderIsRealm from combat context. */
export function getCombatRealmContext(
  state: GameState,
  combat: CombatState,
): { realmWorldId: number; defenderIsRealm: boolean } {
  const realmSlot = state.players[combat.defendingPlayer]!.formation.slots[combat.targetRealmSlot]
  const realmWorldId = realmSlot?.realm.card.worldId ?? 0
  const defenderIsRealm = realmSlot?.realm.instanceId === combat.defender?.instanceId
  return { realmWorldId, defenderIsRealm }
}

/** Computes attacker + defender levels, respecting manual overrides. */
export function getCombatLevels(
  state: GameState,
  combat: CombatState,
): { attackerLevel: number; defenderLevel: number } {
  const { realmWorldId, defenderIsRealm } = getCombatRealmContext(state, combat)
  const attackerLevel =
    combat.attackerManualLevel ??
    (combat.attacker
      ? calculateCombatLevel(
          combat.attacker,
          combat.attackerCards,
          hasWorldMatch(combat.attacker, realmWorldId),
          "offensive",
          getPoolAttachments(state, combat.attackingPlayer, combat.attacker.instanceId),
        )
      : 0)
  const defenderLevel =
    combat.defenderManualLevel ??
    (combat.defender
      ? calculateCombatLevel(
          combat.defender,
          combat.defenderCards,
          !defenderIsRealm && hasWorldMatch(combat.defender, realmWorldId),
          "defensive",
          getPoolAttachments(state, combat.defendingPlayer, combat.defender.instanceId),
        )
      : 0)
  return { attackerLevel, defenderLevel }
}
