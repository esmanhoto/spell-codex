/**
 * Scenario builders for engine scenario tests.
 *
 * Provides minimal, override-friendly factories for cards and game states so that
 * scenario tests can declare only what matters for the rule under test and ignore
 * everything else.
 *
 * Usage pattern:
 *   const attacker = inst("att", makeChampion({ level: 8 }))
 *   const defender = inst("def", makeChampion({ level: 4 }))
 *   const realm    = inst("realm", makeRealm({ supportIds: ["d19", "o19"] }))
 *   const spell    = inst("spell", makeWizardSpell())
 *   const state    = buildCombatCardPlayState({ attacker, defender, targetRealm: realm, defenderHand: [spell] })
 *   const moves    = getLegalMoves(state, "p2")
 */

import { initGame } from "../src/init.ts"
import { Phase } from "../src/types.ts"
import type { CardData, CardInstance, GameState } from "../src/types.ts"
import { DEFAULT_CONFIG } from "./fixtures.ts"

// ─── Card instance sugar ──────────────────────────────────────────────────────

/** Wraps a CardData with a stable instance ID for use in tests. */
export function inst(instanceId: string, card: CardData): CardInstance {
  return { instanceId, card }
}

// ─── Card data builders ───────────────────────────────────────────────────────
// All builders use sensible defaults and accept a Partial override.
// cardNumber defaults are arbitrary — the engine never uses them for logic
// (uniqueness is name + typeId). Override via `overrides` if two cards of the
// same type appear in one test and you want distinct numbers.

const DEFAULTS = {
  setId: "test",
  isAvatar: false,
  worldId: 0 as const,
  attributes: [],
  supportIds: [],
  effects: [],
}

/**
 * Generic champion (Hero, typeId 7) with no spell-casting support.
 * Set `level` to control combat outcomes; set `supportIds` to grant spell access.
 */
export function makeChampion(overrides: Partial<CardData> = {}): CardData {
  return {
    ...DEFAULTS,
    cardNumber: 8001,
    name: "Test Champion",
    typeId: 7, // Hero
    level: 5,
    description: "",
    ...overrides,
  }
}

/**
 * Realm with no inherent spell grants.
 * Set `supportIds: ["d19", "o19"]` to replicate realms like Waterdeep/Iuz.
 */
export function makeRealm(overrides: Partial<CardData> = {}): CardData {
  return {
    ...DEFAULTS,
    cardNumber: 8002,
    name: "Test Realm",
    typeId: 13, // Realm
    level: null,
    description: "",
    ...overrides,
  }
}

/**
 * Wizard spell (typeId 19) with no direction tag, castable in Phase 4 (combat).
 * No tag → engine defaults cast phases to [4] and accepts either d19 or o19 support.
 * Pass `description: "Spell. (Off/4)"` or `"(Def/4)"` to add a directional tag.
 */
export function makeWizardSpell(overrides: Partial<CardData> = {}): CardData {
  return {
    ...DEFAULTS,
    cardNumber: 8003,
    name: "Test Wizard Spell",
    typeId: 19, // Wizard Spell
    level: null,
    description: "",
    ...overrides,
  }
}

/**
 * Wizard spell (typeId 19) with a directional tag, castable in Phase 4 (combat).
 * Use `makeWizardSpell` for the undirected variant.
 */
export function makeClericSpell(overrides: Partial<CardData> = {}): CardData {
  return {
    ...DEFAULTS,
    cardNumber: 8006,
    name: "Test Cleric Spell",
    typeId: 4, // Cleric Spell
    level: null,
    description: "",
    ...overrides,
  }
}

/**
 * Magical item with no bonuses or spell grants.
 * Set `supportIds` to replicate items like Tome of Magic.
 */
export function makeMagicalItem(overrides: Partial<CardData> = {}): CardData {
  return {
    ...DEFAULTS,
    cardNumber: 8004,
    name: "Test Magical Item",
    typeId: 9, // Magical Item
    level: null,
    description: "",
    ...overrides,
  }
}

/**
 * Holding with no special properties.
 * Set `supportIds` to replicate holdings that grant spell access to their realm.
 */
export function makeHolding(overrides: Partial<CardData> = {}): CardData {
  return {
    ...DEFAULTS,
    cardNumber: 8005,
    name: "Test Holding",
    typeId: 8, // Holding
    level: null,
    description: "",
    ...overrides,
  }
}

// ─── State builders ───────────────────────────────────────────────────────────

export interface CombatCardPlayParams {
  /** Champion in the attacking player's pool. */
  attacker: CardInstance
  /** Magical items / artifacts attached to the attacker. */
  attackerAttachments?: CardInstance[]
  /** Cards in the attacking player's hand. */
  attackerHand?: CardInstance[]
  /** Champion in the defending player's pool. */
  defender: CardInstance
  /** Magical items / artifacts attached to the defender. */
  defenderAttachments?: CardInstance[]
  /** Cards in the defending player's hand. */
  defenderHand?: CardInstance[]
  /** Realm placed in the defending player's formation slot A. */
  targetRealm: CardInstance
  /** Holdings attached to the target realm. */
  targetRealmHoldings?: CardInstance[]
  /**
   * Which player is attacking. Defaults to "p1".
   * The other player is automatically the defender.
   */
  attackingPlayer?: "p1" | "p2"
}

/**
 * Builds a GameState already in the CARD_PLAY phase of combat.
 *
 * - p1 attacks p2 by default (override with `attackingPlayer: "p2"`)
 * - The target realm lands in slot A of the defending player's formation
 * - Both champions start in their owner's pool with the provided attachments
 * - Who gets to play cards is determined by the engine (the losing player),
 *   which depends on the champions' levels
 */
export function buildCombatCardPlayState(params: CombatCardPlayParams): GameState {
  const base = initGame(DEFAULT_CONFIG)
  const {
    attacker,
    attackerAttachments = [],
    attackerHand = [],
    defender,
    defenderAttachments = [],
    defenderHand = [],
    targetRealm,
    targetRealmHoldings = [],
    attackingPlayer = "p1",
  } = params

  const defendingPlayer: "p1" | "p2" = attackingPlayer === "p1" ? "p2" : "p1"

  return {
    ...base,
    phase: Phase.Combat,
    activePlayer: attackingPlayer,
    players: {
      ...base.players,
      [attackingPlayer]: {
        ...base.players[attackingPlayer]!,
        hand: attackerHand,
        pool: [{ champion: attacker, attachments: attackerAttachments }],
        formation: { size: 6, slots: {} },
      },
      [defendingPlayer]: {
        ...base.players[defendingPlayer]!,
        hand: defenderHand,
        pool: [{ champion: defender, attachments: defenderAttachments }],
        formation: {
          size: 6,
          slots: {
            A: { realm: targetRealm, isRazed: false, holdings: targetRealmHoldings },
          },
        },
      },
    },
    combatState: {
      attackingPlayer,
      defendingPlayer,
      targetRealmSlot: "A",
      roundPhase: "CARD_PLAY",
      attacker,
      defender,
      attackerCards: [],
      defenderCards: [],
      championsUsedThisBattle: [attacker.instanceId, defender.instanceId],
      attackerManualLevel: null,
      defenderManualLevel: null,
    },
  }
}
