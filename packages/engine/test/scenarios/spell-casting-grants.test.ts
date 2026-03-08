/**
 * Scenario: Spell-casting grants from realms, holdings, and magical items
 *
 * Some cards grant spell-casting ability to champions that would otherwise
 * lack it. Three sources exist:
 *
 *   Realm      — grants only to the champion actively defending that realm
 *   Holding    — grants only to the champion actively defending the realm it is attached to
 *   Magical item — grants to the bearer in any role (attacker or defender)
 *
 * All grants are type-specific: a card with supportIds ["d19", "o19"] grants
 * wizard spells (typeId 19), not cleric spells (typeId 4) or any other type.
 */

import { describe, expect, test } from "bun:test"
import { getLegalMoves } from "../../src/legal-moves.ts"
import {
  inst,
  makeChampion,
  makeRealm,
  makeWizardSpell,
  makeClericSpell,
  makeHolding,
  makeMagicalItem,
  buildCombatCardPlayState,
} from "../scenario-builders.ts"

// ─── Shared fixtures ──────────────────────────────────────────────────────────

/** Outpowers the defender so the defender is losing and gets to play cards */
const STRONG = makeChampion({ name: "Strong", level: 8 })
/** Underpowered; no spell-casting support of its own */
const WEAK_NON_CASTER = makeChampion({ name: "Weak Non-Caster", level: 4 })

// ─── Realm grants ─────────────────────────────────────────────────────────────

describe("realm grants spell casting to the defender", () => {
  test("non-caster can cast wizard spell when defending a spell-granting realm", () => {
    const state = buildCombatCardPlayState({
      attacker: inst("att", STRONG),
      defender: inst("def", WEAK_NON_CASTER),
      defenderHand: [inst("spell", makeWizardSpell())],
      targetRealm: inst("realm", makeRealm({ supportIds: ["d19", "o19"] })),
    })

    const moves = getLegalMoves(state, "p2")
    expect(moves.some((m) => m.type === "PLAY_COMBAT_CARD" && m.cardInstanceId === "spell")).toBe(
      true,
    )
  })

  test("non-caster cannot cast wizard spell when defending a generic realm", () => {
    const state = buildCombatCardPlayState({
      attacker: inst("att", STRONG),
      defender: inst("def", WEAK_NON_CASTER),
      defenderHand: [inst("spell", makeWizardSpell())],
      targetRealm: inst("realm", makeRealm()),
    })

    const moves = getLegalMoves(state, "p2")
    expect(moves.some((m) => m.type === "PLAY_COMBAT_CARD" && m.cardInstanceId === "spell")).toBe(
      false,
    )
  })

  test("realm wizard grant does NOT apply to the attacker — only the active defender", () => {
    // Swap levels so the attacker (p1) is losing and gets to play cards
    const state = buildCombatCardPlayState({
      attacker: inst("att", WEAK_NON_CASTER),
      attackerHand: [inst("spell", makeWizardSpell())],
      defender: inst("def", STRONG),
      targetRealm: inst("realm", makeRealm({ supportIds: ["d19", "o19"] })),
    })

    const moves = getLegalMoves(state, "p1")
    expect(moves.some((m) => m.type === "PLAY_COMBAT_CARD" && m.cardInstanceId === "spell")).toBe(
      false,
    )
  })

  test("realm granting wizard spells does NOT grant cleric spells", () => {
    // Realm only has wizard supportIds — a cleric spell should remain uncastable
    const state = buildCombatCardPlayState({
      attacker: inst("att", STRONG),
      defender: inst("def", WEAK_NON_CASTER),
      defenderHand: [inst("cleric-spell", makeClericSpell())],
      targetRealm: inst("realm", makeRealm({ supportIds: ["d19", "o19"] })),
    })

    const moves = getLegalMoves(state, "p2")
    expect(
      moves.some((m) => m.type === "PLAY_COMBAT_CARD" && m.cardInstanceId === "cleric-spell"),
    ).toBe(false)
  })
})

// ─── Holding grants ───────────────────────────────────────────────────────────

describe("holding grants spell casting to the defender", () => {
  test("holding on the target realm grants wizard spells to the defender", () => {
    const state = buildCombatCardPlayState({
      attacker: inst("att", STRONG),
      defender: inst("def", WEAK_NON_CASTER),
      defenderHand: [inst("spell", makeWizardSpell())],
      targetRealm: inst("realm", makeRealm()),
      targetRealmHoldings: [inst("holding", makeHolding({ supportIds: ["d19", "o19"] }))],
    })

    const moves = getLegalMoves(state, "p2")
    expect(moves.some((m) => m.type === "PLAY_COMBAT_CARD" && m.cardInstanceId === "spell")).toBe(
      true,
    )
  })

  test("holding wizard grant does NOT apply to the attacker", () => {
    const state = buildCombatCardPlayState({
      attacker: inst("att", WEAK_NON_CASTER),
      attackerHand: [inst("spell", makeWizardSpell())],
      defender: inst("def", STRONG),
      targetRealm: inst("realm", makeRealm()),
      targetRealmHoldings: [inst("holding", makeHolding({ supportIds: ["d19", "o19"] }))],
    })

    const moves = getLegalMoves(state, "p1")
    expect(moves.some((m) => m.type === "PLAY_COMBAT_CARD" && m.cardInstanceId === "spell")).toBe(
      false,
    )
  })

  test("holding granting wizard spells does NOT grant cleric spells", () => {
    const state = buildCombatCardPlayState({
      attacker: inst("att", STRONG),
      defender: inst("def", WEAK_NON_CASTER),
      defenderHand: [inst("cleric-spell", makeClericSpell())],
      targetRealm: inst("realm", makeRealm()),
      targetRealmHoldings: [inst("holding", makeHolding({ supportIds: ["d19", "o19"] }))],
    })

    const moves = getLegalMoves(state, "p2")
    expect(
      moves.some((m) => m.type === "PLAY_COMBAT_CARD" && m.cardInstanceId === "cleric-spell"),
    ).toBe(false)
  })
})

// ─── Magical item grants ──────────────────────────────────────────────────────

describe("magical item grants spell casting to the bearer", () => {
  test("non-caster defender with a spell-granting item can cast wizard spells", () => {
    const state = buildCombatCardPlayState({
      attacker: inst("att", STRONG),
      defender: inst("def", WEAK_NON_CASTER),
      defenderAttachments: [inst("item", makeMagicalItem({ supportIds: ["d19", "o19"] }))],
      defenderHand: [inst("spell", makeWizardSpell())],
      targetRealm: inst("realm", makeRealm()),
    })

    const moves = getLegalMoves(state, "p2")
    expect(moves.some((m) => m.type === "PLAY_COMBAT_CARD" && m.cardInstanceId === "spell")).toBe(
      true,
    )
  })

  test("non-caster attacker with a spell-granting item can cast wizard spells", () => {
    // Unlike realm/holding grants, magical items apply to the bearer in any role
    const state = buildCombatCardPlayState({
      attacker: inst("att", WEAK_NON_CASTER),
      attackerAttachments: [inst("item", makeMagicalItem({ supportIds: ["d19", "o19"] }))],
      attackerHand: [inst("spell", makeWizardSpell())],
      defender: inst("def", STRONG),
      targetRealm: inst("realm", makeRealm()),
    })

    const moves = getLegalMoves(state, "p1")
    expect(moves.some((m) => m.type === "PLAY_COMBAT_CARD" && m.cardInstanceId === "spell")).toBe(
      true,
    )
  })

  test("magical item granting wizard spells does NOT grant cleric spells", () => {
    const state = buildCombatCardPlayState({
      attacker: inst("att", STRONG),
      defender: inst("def", WEAK_NON_CASTER),
      defenderAttachments: [inst("item", makeMagicalItem({ supportIds: ["d19", "o19"] }))],
      defenderHand: [inst("cleric-spell", makeClericSpell())],
      targetRealm: inst("realm", makeRealm()),
    })

    const moves = getLegalMoves(state, "p2")
    expect(
      moves.some((m) => m.type === "PLAY_COMBAT_CARD" && m.cardInstanceId === "cleric-spell"),
    ).toBe(false)
  })
})
