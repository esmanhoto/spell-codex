// ─── Card Type IDs ────────────────────────────────────────────────────────────

export const CardTypeId = {
  All: 0,
  Ally: 1,
  Artifact: 2,
  BloodAbility: 3,
  ClericSpell: 4,
  Cleric: 5, // Champion subtype
  Event: 6,
  Hero: 7, // Champion subtype
  Holding: 8,
  MagicalItem: 9,
  Monster: 10, // Champion subtype
  PsionicPower: 11,
  Psionicist: 12, // Champion subtype
  Realm: 13,
  Regent: 14, // Champion subtype
  Rule: 15,
  Thief: 16, // Champion subtype
  ThiefAbility: 17,
  UnarmedCombat: 18,
  WizardSpell: 19,
  Wizard: 20, // Champion subtype
  Dungeon: 21,
} as const

export type CardTypeIdValue = (typeof CardTypeId)[keyof typeof CardTypeId]

/** Champion subtypes: Cleric, Hero, Monster, Psionicist, Regent, Thief, Wizard */
export const CHAMPION_TYPE_IDS = new Set([5, 7, 10, 12, 14, 16, 20])

/**
 * Spell and ability types that use the d/o direction system in supportIds.
 * ClericSpell, PsionicPower, ThiefAbility, UnarmedCombat, WizardSpell.
 */
export const SPELL_TYPE_IDS = new Set([4, 11, 17, 18, 19])

/**
 * Support card types (can be played during combat by the losing player).
 * Allies, Artifacts, plus all spell/ability types.
 */
export const COMBAT_SUPPORT_TYPE_IDS = new Set([1, 2, 4, 9, 11, 17, 18, 19])

/**
 * Card types subject to the Rule of the Cosmos (unique globally across all players).
 * Champions (all subtypes), Realms, Artifacts, Holdings.
 */
export const COSMOS_TYPE_IDS = new Set([2, 5, 7, 8, 10, 12, 13, 14, 16, 20])

/**
 * Formation slot protection relationships.
 * Slot X → list of slots that X protects (blocks from being attacked directly).
 *
 *       [A]        ← front (exposed)
 *     [B] [C]
 *   [D] [E] [F]   ← back row
 *
 * A protects B,C. B protects D,E. C protects E,F. (E is doubly protected.)
 */
export const PROTECTS: Readonly<Record<string, readonly string[]>> = {
  A: ["B", "C"],
  B: ["D", "E"],
  C: ["E", "F"],
  D: [],
  E: [],
  F: [],
  G: [],
  H: [],
  I: [],
  J: [],
}

/**
 * Inverse of PROTECTS — which slots must be razed/empty for a given slot to be attackable.
 */
export const PROTECTED_BY: Readonly<Record<string, readonly string[]>> = {
  A: [],
  B: ["A"],
  C: ["A"],
  D: ["B"],
  E: ["B", "C"],
  F: ["C"],
  G: [],
  H: [],
  I: [],
  J: [],
}

/** Hand sizes by deck size */
export const HAND_SIZES: Readonly<
  Record<number, { starting: number; drawPerTurn: number; maxEnd: number }>
> = {
  55: { starting: 5, drawPerTurn: 3, maxEnd: 8 },
  75: { starting: 6, drawPerTurn: 4, maxEnd: 10 },
  110: { starting: 7, drawPerTurn: 5, maxEnd: 12 },
}

/** World bonus applied when champion's world matches target realm's world */
export const WORLD_BONUS = 3
