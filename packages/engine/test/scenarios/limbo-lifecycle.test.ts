import { describe, test, expect, beforeEach } from "bun:test"
import { applyMove } from "../../src/engine.ts"
import { initGame } from "../../src/init.ts"
import { _resetInstanceCounter } from "../../src/utils.ts"
import type { GameState } from "../../src/types.ts"
import { DEFAULT_CONFIG } from "../fixtures.ts"
import { inst, makeChampion, makeMagicalItem } from "../scenario-builders.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

function advanceToPool(state: GameState, playerId: string): { state: GameState; events: any[] } {
  // START_OF_TURN → PLAY_REALM (draws cards)
  let s = applyMove(state, playerId, { type: "PASS" }).newState
  // PLAY_REALM → POOL (triggers limbo returns)
  const result = applyMove(s, playerId, { type: "PASS" })
  return { state: result.newState, events: result.events }
}

// ─── Single champion returning from limbo ────────────────────────────────────

describe("limbo: single champion returns", () => {
  test("champion returns to pool when currentTurn >= returnsOnTurn", () => {
    let state = initGame(DEFAULT_CONFIG)
    const champion = inst("limbo-champ", makeChampion({ name: "Limbo Hero" }))

    // Place champion in limbo returning on turn 1 (current turn)
    state = {
      ...state,
      players: {
        ...state.players,
        p1: {
          ...state.players["p1"]!,
          limbo: [{ champion, attachments: [], returnsOnTurn: state.currentTurn }],
          pool: [],
        },
      },
    }

    const { state: newState, events } = advanceToPool(state, "p1")

    expect(newState.players["p1"]!.limbo).toHaveLength(0)
    expect(newState.players["p1"]!.pool.some((e) => e.champion.instanceId === "limbo-champ")).toBe(
      true,
    )
    expect(
      events.some((e: any) => e.type === "CHAMPION_FROM_LIMBO" && e.instanceId === "limbo-champ"),
    ).toBe(true)
  })

  test("champion stays in limbo when currentTurn < returnsOnTurn", () => {
    let state = initGame(DEFAULT_CONFIG)
    const champion = inst("limbo-champ", makeChampion({ name: "Limbo Hero" }))

    state = {
      ...state,
      players: {
        ...state.players,
        p1: {
          ...state.players["p1"]!,
          limbo: [{ champion, attachments: [], returnsOnTurn: state.currentTurn + 5 }],
          pool: [],
        },
      },
    }

    const { state: newState } = advanceToPool(state, "p1")

    expect(newState.players["p1"]!.limbo).toHaveLength(1)
    expect(newState.players["p1"]!.pool.some((e) => e.champion.instanceId === "limbo-champ")).toBe(
      false,
    )
  })

  test("champion returning from limbo brings attachments", () => {
    let state = initGame(DEFAULT_CONFIG)
    const champion = inst("limbo-champ", makeChampion({ name: "Limbo Hero" }))
    const item = inst("limbo-item", makeMagicalItem({ level: "+2" }))

    state = {
      ...state,
      players: {
        ...state.players,
        p1: {
          ...state.players["p1"]!,
          limbo: [{ champion, attachments: [item], returnsOnTurn: state.currentTurn }],
          pool: [],
        },
      },
    }

    const { state: newState } = advanceToPool(state, "p1")

    const poolEntry = newState.players["p1"]!.pool.find(
      (e) => e.champion.instanceId === "limbo-champ",
    )
    expect(poolEntry).toBeDefined()
    expect(poolEntry!.attachments.some((a) => a.instanceId === "limbo-item")).toBe(true)
  })
})

// ─── Multiple champions returning same turn ──────────────────────────────────

describe("limbo: multiple champions return same turn", () => {
  test("two champions both return when both have returnsOnTurn <= currentTurn", () => {
    let state = initGame(DEFAULT_CONFIG)
    const champ1 = inst("lc1", makeChampion({ name: "Hero A", cardNumber: 9001 }))
    const champ2 = inst("lc2", makeChampion({ name: "Hero B", cardNumber: 9002 }))

    state = {
      ...state,
      players: {
        ...state.players,
        p1: {
          ...state.players["p1"]!,
          limbo: [
            { champion: champ1, attachments: [], returnsOnTurn: state.currentTurn },
            { champion: champ2, attachments: [], returnsOnTurn: state.currentTurn },
          ],
          pool: [],
        },
      },
    }

    const { state: newState, events } = advanceToPool(state, "p1")

    expect(newState.players["p1"]!.limbo).toHaveLength(0)
    expect(newState.players["p1"]!.pool).toHaveLength(2)
    const limboEvents = events.filter((e: any) => e.type === "CHAMPION_FROM_LIMBO")
    expect(limboEvents).toHaveLength(2)
  })

  test("staggered returns: one returns now, one stays", () => {
    let state = initGame(DEFAULT_CONFIG)
    const champ1 = inst("lc1", makeChampion({ name: "Hero A", cardNumber: 9001 }))
    const champ2 = inst("lc2", makeChampion({ name: "Hero B", cardNumber: 9002 }))

    state = {
      ...state,
      players: {
        ...state.players,
        p1: {
          ...state.players["p1"]!,
          limbo: [
            { champion: champ1, attachments: [], returnsOnTurn: state.currentTurn },
            { champion: champ2, attachments: [], returnsOnTurn: state.currentTurn + 3 },
          ],
          pool: [],
        },
      },
    }

    const { state: newState } = advanceToPool(state, "p1")

    expect(newState.players["p1"]!.limbo).toHaveLength(1)
    expect(newState.players["p1"]!.limbo[0]!.champion.instanceId).toBe("lc2")
    expect(newState.players["p1"]!.pool).toHaveLength(1)
    expect(newState.players["p1"]!.pool[0]!.champion.instanceId).toBe("lc1")
  })
})

// ─── Cosmos conflict on limbo return ─────────────────────────────────────────

describe("limbo: duplicate champion conflict on return", () => {
  test("returning champion discarded if identical champion already in pool", () => {
    let state = initGame(DEFAULT_CONFIG)
    const poolChamp = inst("pool-champ", makeChampion({ name: "Same Hero", typeId: 7 }))
    const limboChamp = inst("limbo-champ", makeChampion({ name: "Same Hero", typeId: 7 }))

    state = {
      ...state,
      players: {
        ...state.players,
        p1: {
          ...state.players["p1"]!,
          pool: [{ champion: poolChamp, attachments: [] }],
          limbo: [{ champion: limboChamp, attachments: [], returnsOnTurn: state.currentTurn }],
          discardPile: [],
        },
      },
    }

    const { state: newState } = advanceToPool(state, "p1")

    // Only original pool champion remains
    expect(newState.players["p1"]!.pool).toHaveLength(1)
    expect(newState.players["p1"]!.pool[0]!.champion.instanceId).toBe("pool-champ")

    // Limbo champion discarded
    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "limbo-champ")).toBe(
      true,
    )
    expect(newState.players["p1"]!.limbo).toHaveLength(0)
  })

  test("returning champion discarded along with its attachments on conflict", () => {
    let state = initGame(DEFAULT_CONFIG)
    const poolChamp = inst("pool-champ", makeChampion({ name: "Same Hero", typeId: 7 }))
    const limboChamp = inst("limbo-champ", makeChampion({ name: "Same Hero", typeId: 7 }))
    const limboItem = inst("limbo-item", makeMagicalItem({ level: "+3" }))

    state = {
      ...state,
      players: {
        ...state.players,
        p1: {
          ...state.players["p1"]!,
          pool: [{ champion: poolChamp, attachments: [] }],
          limbo: [
            { champion: limboChamp, attachments: [limboItem], returnsOnTurn: state.currentTurn },
          ],
          discardPile: [],
        },
      },
    }

    const { state: newState } = advanceToPool(state, "p1")

    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "limbo-champ")).toBe(
      true,
    )
    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "limbo-item")).toBe(
      true,
    )
  })

  test("different name/typeId: no conflict, both stay in pool", () => {
    let state = initGame(DEFAULT_CONFIG)
    const poolChamp = inst(
      "pool-champ",
      makeChampion({ name: "Hero A", typeId: 7, cardNumber: 9001 }),
    )
    const limboChamp = inst(
      "limbo-champ",
      makeChampion({ name: "Hero B", typeId: 7, cardNumber: 9002 }),
    )

    state = {
      ...state,
      players: {
        ...state.players,
        p1: {
          ...state.players["p1"]!,
          pool: [{ champion: poolChamp, attachments: [] }],
          limbo: [{ champion: limboChamp, attachments: [], returnsOnTurn: state.currentTurn }],
        },
      },
    }

    const { state: newState } = advanceToPool(state, "p1")

    expect(newState.players["p1"]!.pool).toHaveLength(2)
    expect(newState.players["p1"]!.limbo).toHaveLength(0)
  })
})
