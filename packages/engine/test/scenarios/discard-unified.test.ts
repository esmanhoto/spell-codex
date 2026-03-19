import { describe, test, expect, beforeEach } from "bun:test"
import { applyMove } from "../../src/engine.ts"
import { getLegalMoves } from "../../src/legal-moves.ts"
import { initGame } from "../../src/init.ts"
import { Phase } from "../../src/types.ts"
import { _resetInstanceCounter } from "../../src/utils.ts"
import { DEFAULT_CONFIG } from "../fixtures.ts"
import {
  inst,
  makeChampion,
  makeRealm,
  makeMagicalItem,
  buildCombatCardPlayState,
} from "../scenario-builders.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

// ─── Pool champion discard ──────────────────────────────────────────────────

describe("discard pool champion", () => {
  test("discarding pool champion also discards all attachments", () => {
    const base = initGame(DEFAULT_CONFIG)
    const champ = inst("champ", makeChampion({ level: 5 }))
    const item1 = inst("item1", makeMagicalItem())
    const item2 = inst("item2", makeMagicalItem({ cardNumber: 9002, name: "Item 2" }))

    const state: typeof base = {
      ...base,
      phase: Phase.Pool,
      players: {
        ...base.players,
        p1: {
          ...base.players["p1"]!,
          pool: [{ champion: champ, attachments: [item1, item2] }],
        },
      },
    }

    const { newState } = applyMove(state, "p1", {
      type: "DISCARD_CARD",
      cardInstanceId: "champ",
    })

    expect(newState.players["p1"]!.pool).toHaveLength(0)
    const discardIds = newState.players["p1"]!.discardPile.map((c) => c.instanceId)
    expect(discardIds).toContain("champ")
    expect(discardIds).toContain("item1")
    expect(discardIds).toContain("item2")
  })

  test("discarding pool champion with no attachments works", () => {
    const base = initGame(DEFAULT_CONFIG)
    const champ = inst("champ", makeChampion({ level: 5 }))

    const state: typeof base = {
      ...base,
      phase: Phase.Pool,
      players: {
        ...base.players,
        p1: {
          ...base.players["p1"]!,
          pool: [{ champion: champ, attachments: [] }],
        },
      },
    }

    const { newState } = applyMove(state, "p1", {
      type: "DISCARD_CARD",
      cardInstanceId: "champ",
    })

    expect(newState.players["p1"]!.pool).toHaveLength(0)
    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "champ")).toBe(true)
  })
})

// ─── Pool attachment discard (outside combat) ───────────────────────────────

describe("discard pool attachment outside combat", () => {
  test("discarding attachment removes it from champion, champion stays", () => {
    const base = initGame(DEFAULT_CONFIG)
    const champ = inst("champ", makeChampion({ level: 5 }))
    const item = inst("item", makeMagicalItem())

    const state: typeof base = {
      ...base,
      phase: Phase.Pool,
      players: {
        ...base.players,
        p1: {
          ...base.players["p1"]!,
          pool: [{ champion: champ, attachments: [item] }],
        },
      },
    }

    const { newState } = applyMove(state, "p1", {
      type: "DISCARD_CARD",
      cardInstanceId: "item",
    })

    expect(newState.players["p1"]!.pool).toHaveLength(1)
    expect(newState.players["p1"]!.pool[0]!.champion.instanceId).toBe("champ")
    expect(newState.players["p1"]!.pool[0]!.attachments).toHaveLength(0)
    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "item")).toBe(true)
  })
})

// ─── Razed realm discard via DISCARD_CARD ───────────────────────────────────

describe("discard razed realm", () => {
  test("discarding razed realm removes it from formation", () => {
    const base = initGame(DEFAULT_CONFIG)
    const realm = inst("realm1", makeRealm())

    const state: typeof base = {
      ...base,
      phase: Phase.Pool,
      players: {
        ...base.players,
        p1: {
          ...base.players["p1"]!,
          formation: {
            size: 6,
            slots: { A: { realm, isRazed: true, holdings: [] } },
          },
        },
      },
    }

    const { newState } = applyMove(state, "p1", {
      type: "DISCARD_CARD",
      cardInstanceId: "realm1",
    })

    expect(newState.players["p1"]!.formation.slots["A"]).toBeUndefined()
    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "realm1")).toBe(true)
  })

  test("discarding unrazed realm throws NOT_RAZED", () => {
    const base = initGame(DEFAULT_CONFIG)
    const realm = inst("realm1", makeRealm())

    const state: typeof base = {
      ...base,
      phase: Phase.Pool,
      players: {
        ...base.players,
        p1: {
          ...base.players["p1"]!,
          formation: {
            size: 6,
            slots: { A: { realm, isRazed: false, holdings: [] } },
          },
        },
      },
    }

    expect(() =>
      applyMove(state, "p1", { type: "DISCARD_CARD", cardInstanceId: "realm1" }),
    ).toThrow("not razed")
  })
})

// ─── Non-active player discard ──────────────────────────────────────────────

describe("non-active player discard", () => {
  test("non-active player can discard from hand without phase advance", () => {
    const base = initGame(DEFAULT_CONFIG)
    const card = base.players["p2"]!.hand[0]!

    const { newState } = applyMove(base, "p2", {
      type: "DISCARD_CARD",
      cardInstanceId: card.instanceId,
    })

    // Phase should NOT advance — p1 is active player
    expect(newState.phase).toBe(base.phase)
    expect(newState.activePlayer).toBe("p1")
    expect(newState.players["p2"]!.hand).not.toContainEqual(card)
  })

  test("non-active player can discard from pool", () => {
    const base = initGame(DEFAULT_CONFIG)
    const champ = inst("p2champ", makeChampion({ level: 3, cardNumber: 9999 }))

    const state: typeof base = {
      ...base,
      players: {
        ...base.players,
        p2: {
          ...base.players["p2"]!,
          pool: [{ champion: champ, attachments: [] }],
        },
      },
    }

    const { newState } = applyMove(state, "p2", {
      type: "DISCARD_CARD",
      cardInstanceId: "p2champ",
    })

    expect(newState.players["p2"]!.pool).toHaveLength(0)
    expect(newState.players["p2"]!.discardPile.some((c) => c.instanceId === "p2champ")).toBe(true)
  })

  test("non-active player gets discard moves in legal moves", () => {
    const base = initGame(DEFAULT_CONFIG)
    const moves = getLegalMoves(base, "p2")
    const discardMoves = moves.filter((m) => m.type === "DISCARD_CARD")

    expect(discardMoves.length).toBeGreaterThan(0)
    // Should have one discard per hand card
    expect(discardMoves.length).toBe(base.players["p2"]!.hand.length)
  })
})

// ─── Discard from hand during combat ────────────────────────────────────────

describe("discard from hand during combat", () => {
  test("active player can discard hand card mid-combat without phase advance", () => {
    const attacker = inst("att", makeChampion({ level: 3 }))
    const defender = inst("def", makeChampion({ level: 10, cardNumber: 9001 }))
    const realm = inst("realm", makeRealm())
    const handCard = inst("hcard", makeChampion({ level: 1, cardNumber: 9002, name: "Fodder" }))

    const base = buildCombatCardPlayState({
      attacker,
      defender,
      targetRealm: realm,
      attackerHand: [handCard],
    })

    const { newState } = applyMove(base, "p1", {
      type: "DISCARD_CARD",
      cardInstanceId: "hcard",
    })

    // Combat should still be active
    expect(newState.combatState).not.toBeNull()
    expect(newState.phase).toBe(Phase.Combat)
    expect(newState.players["p1"]!.hand).toHaveLength(0)
    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "hcard")).toBe(true)
  })

  test("non-active player can discard hand card during combat", () => {
    const attacker = inst("att", makeChampion({ level: 3 }))
    const defender = inst("def", makeChampion({ level: 10, cardNumber: 9001 }))
    const realm = inst("realm", makeRealm())
    const handCard = inst("hcard", makeChampion({ level: 1, cardNumber: 9002, name: "Fodder" }))

    const base = buildCombatCardPlayState({
      attacker,
      defender,
      targetRealm: realm,
      defenderHand: [handCard],
    })

    // p2 is not active player (p1 is attacker/active)
    const { newState } = applyMove(base, "p2", {
      type: "DISCARD_CARD",
      cardInstanceId: "hcard",
    })

    expect(newState.combatState).not.toBeNull()
    expect(newState.players["p2"]!.hand).toHaveLength(0)
    expect(newState.players["p2"]!.discardPile.some((c) => c.instanceId === "hcard")).toBe(true)
  })
})

// ─── Cannot discard opponent's cards ────────────────────────────────────────

describe("cannot discard opponent cards", () => {
  test("legal moves do not include opponent combat cards for discard", () => {
    const attacker = inst("att", makeChampion({ level: 3 }))
    const defender = inst("def", makeChampion({ level: 10, cardNumber: 9001 }))
    const realm = inst("realm", makeRealm())
    const defAlly = inst("def-ally", makeChampion({ level: 2, typeId: 1, cardNumber: 9999, name: "Def Ally" }))

    const base = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const state = {
      ...base,
      combatState: { ...base.combatState!, defenderCards: [defAlly] },
    }

    // p1 (attacker) should NOT get DISCARD_CARD for defender's ally
    const p1Moves = getLegalMoves(state, "p1")
    const p1Discards = p1Moves.filter(
      (m) => m.type === "DISCARD_CARD" && (m as { cardInstanceId: string }).cardInstanceId === "def-ally",
    )
    expect(p1Discards).toHaveLength(0)

    // p1 should still get SWITCH_COMBAT_SIDE for it
    const p1Switches = p1Moves.filter(
      (m) => m.type === "SWITCH_COMBAT_SIDE" && (m as { cardInstanceId: string }).cardInstanceId === "def-ally",
    )
    expect(p1Switches).toHaveLength(1)
  })

  test("legal moves do not include opponent pool cards for discard", () => {
    const base = initGame(DEFAULT_CONFIG)
    const oppChamp = inst("opp-champ", makeChampion({ level: 5, cardNumber: 9999 }))

    const state: typeof base = {
      ...base,
      players: {
        ...base.players,
        p2: {
          ...base.players["p2"]!,
          pool: [{ champion: oppChamp, attachments: [] }],
        },
      },
    }

    const p1Moves = getLegalMoves(state, "p1")
    const p1Discards = p1Moves.filter(
      (m) => m.type === "DISCARD_CARD" && (m as { cardInstanceId: string }).cardInstanceId === "opp-champ",
    )
    expect(p1Discards).toHaveLength(0)
  })
})

// ─── Non-active player raze realm ───────────────────────────────────────────

describe("non-active player raze realm", () => {
  test("non-active player can raze own realm", () => {
    const base = initGame(DEFAULT_CONFIG)
    const realm = inst("p2realm", makeRealm({ cardNumber: 9999 }))

    const state: typeof base = {
      ...base,
      players: {
        ...base.players,
        p2: {
          ...base.players["p2"]!,
          formation: {
            size: 6,
            slots: { A: { realm, isRazed: false, holdings: [] } },
          },
        },
      },
    }

    const moves = getLegalMoves(state, "p2")
    expect(moves.some((m) => m.type === "RAZE_OWN_REALM")).toBe(true)

    const { newState } = applyMove(state, "p2", {
      type: "RAZE_OWN_REALM",
      slot: "A",
    })

    expect(newState.players["p2"]!.formation.slots["A"]!.isRazed).toBe(true)
  })
})
