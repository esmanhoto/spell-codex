import { describe, test, expect } from "bun:test"
import { findOrPromoteChampion } from "../src/utils.ts"
import { EngineError } from "../src/errors.ts"
import { initGame } from "../src/init.ts"
import type { GameState, CardInstance } from "../src/types.ts"
import {
  DEFAULT_CONFIG,
  CHAMPION_CLERIC_FR,
  CHAMPION_HERO_GENERIC,
  REALM_GENERIC,
} from "./fixtures.ts"

function baseState(): GameState {
  return initGame(DEFAULT_CONFIG)
}

describe("findOrPromoteChampion", () => {
  test("returns champion already in pool without state change", () => {
    let state = baseState()
    const champ: CardInstance = { instanceId: "pool-champ", card: CHAMPION_CLERIC_FR }
    state = {
      ...state,
      players: {
        ...state.players,
        p1: {
          ...state.players["p1"]!,
          pool: [{ champion: champ, attachments: [] }],
        },
      },
    }

    const [found, newState] = findOrPromoteChampion(state, "p1", "pool-champ", "test")
    expect(found.instanceId).toBe("pool-champ")
    // State unchanged — same pool
    expect(newState.players["p1"]!.pool.length).toBe(state.players["p1"]!.pool.length)
  })

  test("promotes champion from hand to pool", () => {
    let state = baseState()
    const champ: CardInstance = { instanceId: "hand-champ", card: CHAMPION_HERO_GENERIC }
    state = {
      ...state,
      players: {
        ...state.players,
        p1: {
          ...state.players["p1"]!,
          hand: [champ, ...state.players["p1"]!.hand],
          pool: [],
        },
      },
    }

    const handBefore = state.players["p1"]!.hand.length
    const [found, newState] = findOrPromoteChampion(state, "p1", "hand-champ", "test")

    expect(found.instanceId).toBe("hand-champ")
    expect(newState.players["p1"]!.hand.length).toBe(handBefore - 1)
    expect(newState.players["p1"]!.pool.some((e) => e.champion.instanceId === "hand-champ")).toBe(
      true,
    )
  })

  test("throws NOT_A_CHAMPION when hand card is not a champion type", () => {
    let state = baseState()
    const realm: CardInstance = { instanceId: "realm-in-hand", card: REALM_GENERIC }
    state = {
      ...state,
      players: {
        ...state.players,
        p1: {
          ...state.players["p1"]!,
          hand: [realm],
          pool: [],
        },
      },
    }

    expect(() => findOrPromoteChampion(state, "p1", "realm-in-hand", "test")).toThrow(EngineError)
  })

  test("throws CHAMPION_NOT_FOUND when id is nowhere", () => {
    const state = baseState()
    expect(() => findOrPromoteChampion(state, "p1", "nonexistent-id", "test context")).toThrow(
      EngineError,
    )
  })
})
