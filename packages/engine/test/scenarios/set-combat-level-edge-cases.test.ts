import { describe, test, expect, beforeEach } from "bun:test"
import { applyMove } from "../../src/engine.ts"
import { initGame } from "../../src/init.ts"
import { _resetInstanceCounter } from "../../src/utils.ts"
import { DEFAULT_CONFIG, EVENT_CARD } from "../fixtures.ts"
import { inst, makeChampion, makeRealm, buildCombatCardPlayState } from "../scenario-builders.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

// ─── SET_COMBAT_LEVEL edge cases ─────────────────────────────────────────────

describe("SET_COMBAT_LEVEL", () => {
  test("setting attacker manual level overrides calculated level", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 8, cardNumber: 9001 }))
    const realm = inst("realm", makeRealm())

    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })

    const { newState } = applyMove(state, "p1", {
      type: "SET_COMBAT_LEVEL",
      playerId: "p1",
      level: 20,
    })

    expect(newState.combatState!.attackerManualLevel).toBe(20)
    // Now attacker (20) > defender (8), so defender is losing → activePlayer = p2
    expect(newState.activePlayer).toBe("p2")
  })

  test("setting defender manual level overrides calculated level", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 8, cardNumber: 9001 }))
    const realm = inst("realm", makeRealm())

    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })

    const { newState } = applyMove(state, "p1", {
      type: "SET_COMBAT_LEVEL",
      playerId: "p2",
      level: 1,
    })

    expect(newState.combatState!.defenderManualLevel).toBe(1)
    // Now attacker (5) > defender (1), so defender is losing → activePlayer = p2
    expect(newState.activePlayer).toBe("p2")
  })

  test("negative manual level is accepted (no floor enforcement)", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 8, cardNumber: 9001 }))
    const realm = inst("realm", makeRealm())

    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })

    const { newState } = applyMove(state, "p1", {
      type: "SET_COMBAT_LEVEL",
      playerId: "p1",
      level: -5,
    })

    // Manual level stored as-is
    expect(newState.combatState!.attackerManualLevel).toBe(-5)
  })

  test("zero manual level is accepted", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 8, cardNumber: 9001 }))
    const realm = inst("realm", makeRealm())

    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })

    const { newState } = applyMove(state, "p1", {
      type: "SET_COMBAT_LEVEL",
      playerId: "p1",
      level: 0,
    })

    expect(newState.combatState!.attackerManualLevel).toBe(0)
  })

  test("non-participant throws INVALID_PLAYER", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 8, cardNumber: 9001 }))
    const realm = inst("realm", makeRealm())

    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })

    expect(() =>
      applyMove(state, "p1", {
        type: "SET_COMBAT_LEVEL",
        playerId: "p3",
        level: 10,
      }),
    ).toThrow("Player is not a combat participant")
  })

  test("SET_COMBAT_LEVEL outside combat throws NOT_IN_COMBAT", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 8, cardNumber: 9001 }))
    const realm = inst("realm", makeRealm())

    const base = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const state = { ...base, combatState: null }

    expect(() =>
      applyMove(state, "p1", {
        type: "SET_COMBAT_LEVEL",
        playerId: "p1",
        level: 10,
      }),
    ).toThrow("SET_COMBAT_LEVEL requires active combat")
  })
})

// ─── DISCARD_COMBAT_CARD edge cases ──────────────────────────────────────────

describe("DISCARD_COMBAT_CARD", () => {
  test("discard attacker combat card: removed from attackerCards, added to discard", () => {
    const attacker = inst("att", makeChampion({ level: 3 }))
    const defender = inst("def", makeChampion({ level: 10, cardNumber: 9001 }))
    const realm = inst("realm", makeRealm())
    const ally = inst("ally", makeChampion({ level: 4, typeId: 1, cardNumber: 9999, name: "Ally" }))

    const base = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const state = {
      ...base,
      combatState: { ...base.combatState!, attackerCards: [ally] },
    }

    const { newState } = applyMove(state, "p1", {
      type: "DISCARD_COMBAT_CARD",
      cardInstanceId: "ally",
    })

    expect(newState.combatState!.attackerCards).toHaveLength(0)
    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "ally")).toBe(true)
  })

  test("discard defender combat card: removed from defenderCards, added to discard", () => {
    const attacker = inst("att", makeChampion({ level: 10 }))
    const defender = inst("def", makeChampion({ level: 3, cardNumber: 9001 }))
    const realm = inst("realm", makeRealm())
    const ally = inst("ally", makeChampion({ level: 4, typeId: 1, cardNumber: 9999, name: "Ally" }))

    const base = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const state = {
      ...base,
      activePlayer: "p2" as const,
      combatState: { ...base.combatState!, defenderCards: [ally] },
    }

    const { newState } = applyMove(state, "p2", {
      type: "DISCARD_COMBAT_CARD",
      cardInstanceId: "ally",
    })

    expect(newState.combatState!.defenderCards).toHaveLength(0)
    expect(newState.players["p2"]!.discardPile.some((c) => c.instanceId === "ally")).toBe(true)
  })

  test("discard card not in combat throws TARGET_NOT_FOUND", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 5, cardNumber: 9001 }))
    const realm = inst("realm", makeRealm())

    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })

    expect(() =>
      applyMove(state, "p1", {
        type: "DISCARD_COMBAT_CARD",
        cardInstanceId: "nonexistent",
      }),
    ).toThrow("Card is not in active combat")
  })

  test("DISCARD_COMBAT_CARD outside combat throws NOT_IN_COMBAT", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 5, cardNumber: 9001 }))
    const realm = inst("realm", makeRealm())

    const base = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const state = { ...base, combatState: null }

    expect(() =>
      applyMove(state, "p1", {
        type: "DISCARD_COMBAT_CARD",
        cardInstanceId: "att",
      }),
    ).toThrow("DISCARD_COMBAT_CARD requires active combat")
  })
})

// ─── PLAY_RULE_CARD ──────────────────────────────────────────────────────────

describe("PLAY_RULE_CARD", () => {
  test("rule card played in START_OF_TURN goes to discard", () => {
    const base = initGame(DEFAULT_CONFIG)
    const ruleCard = inst("rule1", {
      setId: "test", cardNumber: 700, name: "Test Rule", typeId: 15,
      worldId: 0, isAvatar: false, level: null, description: "",
      attributes: [], supportIds: [], effects: [],
    })

    const state = {
      ...base,
      players: {
        ...base.players,
        p1: { ...base.players["p1"]!, hand: [ruleCard, ...base.players["p1"]!.hand] },
      },
    }

    const { newState, events } = applyMove(state, "p1", {
      type: "PLAY_RULE_CARD",
      cardInstanceId: "rule1",
    })

    expect(newState.players["p1"]!.hand.every((c: any) => c.instanceId !== "rule1")).toBe(true)
    expect(newState.players["p1"]!.discardPile.some((c: any) => c.instanceId === "rule1")).toBe(true)
    expect(events.some((e: any) => e.type === "CARDS_DISCARDED")).toBe(true)
  })

  test("non-rule card throws NOT_A_RULE_CARD", () => {
    const base = initGame(DEFAULT_CONFIG)
    const eventCard = inst("ev1", EVENT_CARD)

    const state = {
      ...base,
      players: {
        ...base.players,
        p1: { ...base.players["p1"]!, hand: [eventCard] },
      },
    }

    expect(() =>
      applyMove(state, "p1", { type: "PLAY_RULE_CARD", cardInstanceId: "ev1" }),
    ).toThrow("NOT_A_RULE_CARD")
  })
})
