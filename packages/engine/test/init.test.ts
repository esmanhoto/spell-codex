import { describe, test, expect, beforeEach } from "bun:test"
import { initGame } from "../src/init.ts"
import { Phase } from "../src/types.ts"
import { _resetInstanceCounter } from "../src/utils.ts"
import { DEFAULT_CONFIG } from "./fixtures.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

describe("initGame", () => {
  test("creates game with correct id", () => {
    const state = initGame(DEFAULT_CONFIG)
    expect(state.id).toBe("test-game-1")
  })

  test("starts at phase START_OF_TURN", () => {
    const state = initGame(DEFAULT_CONFIG)
    expect(state.phase).toBe(Phase.StartOfTurn)
  })

  test("first player is active", () => {
    const state = initGame(DEFAULT_CONFIG)
    expect(state.activePlayer).toBe("p1")
  })

  test("player order matches config", () => {
    const state = initGame(DEFAULT_CONFIG)
    expect(state.playerOrder).toEqual(["p1", "p2"])
  })

  test("both players are present in state", () => {
    const state = initGame(DEFAULT_CONFIG)
    expect(Object.keys(state.players)).toContain("p1")
    expect(Object.keys(state.players)).toContain("p2")
  })

  test("all other zones start empty", () => {
    const state = initGame(DEFAULT_CONFIG)
    for (const player of Object.values(state.players)) {
      expect(player.discardPile).toHaveLength(0)
      expect(player.limbo).toHaveLength(0)
      expect(player.abyss).toHaveLength(0)
      expect(player.pool).toHaveLength(0)
      expect(Object.keys(player.formation.slots)).toHaveLength(0)
      expect(player.dungeon).toBeNull()
    }
  })

  test("no combat at start", () => {
    const state = initGame(DEFAULT_CONFIG)
    expect(state.combatState).toBeNull()
    expect(state.winner).toBeNull()
  })

  test("emits GAME_STARTED event", () => {
    const state = initGame(DEFAULT_CONFIG)
    expect(state.events).toHaveLength(1)
    expect(state.events[0]).toMatchObject({ type: "GAME_STARTED", players: ["p1", "p2"] })
  })

  test("shuffle is deterministic — same seed produces same hand", () => {
    const s1 = initGame(DEFAULT_CONFIG)
    _resetInstanceCounter()
    const s2 = initGame(DEFAULT_CONFIG)
    const ids1 = s1.players["p1"]!.hand.map((c) => `${c.card.setId}-${c.card.cardNumber}`)
    const ids2 = s2.players["p1"]!.hand.map((c) => `${c.card.setId}-${c.card.cardNumber}`)
    expect(ids1).toEqual(ids2)
  })

  test("different seed produces different hand order", () => {
    const s1 = initGame(DEFAULT_CONFIG)
    _resetInstanceCounter()
    const s2 = initGame({ ...DEFAULT_CONFIG, seed: 9999 })
    const names1 = s1.players["p1"]!.hand.map((c) => c.card.name).join(",")
    const names2 = s2.players["p1"]!.hand.map((c) => c.card.name).join(",")
    // With different seeds, the hands should differ (very high probability)
    expect(names1).not.toBe(names2)
  })

  test("p1 and p2 get different shuffles from the same seed", () => {
    const state = initGame(DEFAULT_CONFIG)
    const p1Names = state.players["p1"]!.hand.map((c) => c.card.name).join(",")
    const p2Names = state.players["p2"]!.hand.map((c) => c.card.name).join(",")
    expect(p1Names).not.toBe(p2Names)
  })

  test("each card instance has a unique instanceId", () => {
    const state = initGame(DEFAULT_CONFIG)
    const allIds = [
      ...state.players["p1"]!.hand.map((c) => c.instanceId),
      ...state.players["p1"]!.drawPile.map((c) => c.instanceId),
      ...state.players["p2"]!.hand.map((c) => c.instanceId),
      ...state.players["p2"]!.drawPile.map((c) => c.instanceId),
    ]
    const unique = new Set(allIds)
    expect(unique.size).toBe(allIds.length)
  })

  test("custom formation size is applied", () => {
    const state = initGame({ ...DEFAULT_CONFIG, formationSize: 10 })
    expect(state.players["p1"]!.formation.size).toBe(10)
  })
})
