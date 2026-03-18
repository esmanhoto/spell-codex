import { describe, test, expect, beforeEach } from "bun:test"
import { getLegalMoves } from "../src/legal-moves.ts"
import { applyMove } from "../src/engine.ts"
import { _resetInstanceCounter } from "../src/utils.ts"
import {
  inst,
  makeChampion,
  makeRealm,
  buildCombatCardPlayState,
} from "./scenario-builders.ts"
import { ALLY_PLUS4 } from "./fixtures.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

describe("stoppedPlayers combat mechanics", () => {
  const attacker = inst("att", makeChampion({ level: 6, name: "Attacker" }))
  const defender = inst("def", makeChampion({ level: 4, name: "Defender" }))
  const realm = inst("realm", makeRealm())

  test("playing a card un-stops the player", () => {
    const ally = inst("ally", ALLY_PLUS4)
    const state = buildCombatCardPlayState({
      attacker,
      defender,
      targetRealm: realm,
      attackerHand: [ally],
    })

    const s1 = applyMove(state, "p1", { type: "STOP_PLAYING" }).newState
    expect(s1.combatState!.stoppedPlayers).toContain("p1")

    const s2 = applyMove(s1, "p1", { type: "PLAY_COMBAT_CARD", cardInstanceId: "ally" }).newState
    expect(s2.combatState!.stoppedPlayers).not.toContain("p1")
  })

  test("STOP_PLAYING hidden after player already stopped", () => {
    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })

    const s1 = applyMove(state, "p1", { type: "STOP_PLAYING" }).newState
    const p1Moves = getLegalMoves(s1, "p1")
    expect(p1Moves.filter((m) => m.type === "STOP_PLAYING")).toHaveLength(0)
    // p2 still has it
    const p2Moves = getLegalMoves(s1, "p2")
    expect(p2Moves.filter((m) => m.type === "STOP_PLAYING")).toHaveLength(1)
  })
})
