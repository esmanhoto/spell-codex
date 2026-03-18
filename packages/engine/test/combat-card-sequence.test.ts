import { describe, test, expect, beforeEach } from "bun:test"
import { getLegalMoves } from "../src/legal-moves.ts"
import { applyMove } from "../src/engine.ts"
import { _resetInstanceCounter } from "../src/utils.ts"
import { inst, makeChampion, makeRealm, buildCombatCardPlayState } from "./scenario-builders.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

describe("STOP_PLAYING ends combat immediately", () => {
  const attacker = inst("att", makeChampion({ level: 6, name: "Attacker" }))
  const defender = inst("def", makeChampion({ level: 4, name: "Defender" }))
  const realm = inst("realm", makeRealm())

  test("attacker STOP_PLAYING means defender wins", () => {
    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const { newState } = applyMove(state, "p1", { type: "STOP_PLAYING" })
    // Attacker champion discarded
    expect(newState.players["p1"]!.pool.some((e) => e.champion.instanceId === "att")).toBe(false)
    expect(newState.combatState).toBeNull()
  })

  test("defender STOP_PLAYING means attacker wins", () => {
    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const { newState } = applyMove(state, "p2", { type: "STOP_PLAYING" })
    // Defender champion discarded
    expect(newState.players["p2"]!.pool.some((e) => e.champion.instanceId === "def")).toBe(false)
    expect(newState.combatState!.roundPhase).toBe("AWAITING_ATTACKER")
  })

  test("STOP_PLAYING available to both players during CARD_PLAY", () => {
    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    expect(getLegalMoves(state, "p1").some((m) => m.type === "STOP_PLAYING")).toBe(true)
    expect(getLegalMoves(state, "p2").some((m) => m.type === "STOP_PLAYING")).toBe(true)
  })
})
