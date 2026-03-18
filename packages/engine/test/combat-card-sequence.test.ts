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
import { ALLY_PLUS4, ALLY_SLASH, MAGICAL_ITEM_PLUS2_PLUS1 } from "./fixtures.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

// ─── Combat card sequencing: both players play cards, verify levels + resolution ─

describe("combat card sequence — interleaved plays and level calculation", () => {
  const attacker = inst("att", makeChampion({ level: 6, name: "Attacker" }))
  const defender = inst("def", makeChampion({ level: 4, name: "Defender" }))
  const realm = inst("realm", makeRealm())

  test("both players play allies, cards accumulate in combat state", () => {
    const attAlly = inst("att-ally", ALLY_PLUS4)
    const defAlly = inst("def-ally", { ...ALLY_PLUS4, name: "Def Ally", cardNumber: 102 })
    const state = buildCombatCardPlayState({
      attacker,
      defender,
      targetRealm: realm,
      attackerHand: [attAlly],
      defenderHand: [defAlly],
    })

    // attacker plays ally
    const s1 = applyMove(state, "p1", { type: "PLAY_COMBAT_CARD", cardInstanceId: "att-ally" }).newState
    expect(s1.combatState!.attackerCards).toHaveLength(1)
    expect(s1.combatState!.defenderCards).toHaveLength(0)

    // defender plays ally
    const s2 = applyMove(s1, "p2", { type: "PLAY_COMBAT_CARD", cardInstanceId: "def-ally" }).newState
    expect(s2.combatState!.attackerCards).toHaveLength(1)
    expect(s2.combatState!.defenderCards).toHaveLength(1)
  })

  test("playing a card un-stops the player", () => {
    const ally = inst("ally", ALLY_PLUS4)
    const state = buildCombatCardPlayState({
      attacker,
      defender,
      targetRealm: realm,
      attackerHand: [ally],
    })

    // p1 stops
    const s1 = applyMove(state, "p1", { type: "STOP_PLAYING" }).newState
    expect(s1.combatState!.stoppedPlayers).toContain("p1")

    // p1 plays card — un-stops
    const s2 = applyMove(s1, "p1", { type: "PLAY_COMBAT_CARD", cardInstanceId: "ally" }).newState
    expect(s2.combatState!.stoppedPlayers).not.toContain("p1")
  })

  test("attacker wins round when total attack level exceeds defense", () => {
    // attacker: 6 + ally(+4) = 10, defender: 4 → attacker wins round
    const ally = inst("att-ally", ALLY_PLUS4)
    const state = buildCombatCardPlayState({
      attacker,
      defender,
      targetRealm: realm,
      attackerHand: [ally],
    })

    const s1 = applyMove(state, "p1", { type: "PLAY_COMBAT_CARD", cardInstanceId: "att-ally" }).newState
    // both stop
    const s2 = applyMove(s1, "p1", { type: "STOP_PLAYING" }).newState
    const s3 = applyMove(s2, "p2", { type: "STOP_PLAYING" }).newState

    // attacker wins round — goes to AWAITING_ATTACKER for next round
    expect(s3.combatState).not.toBeNull()
    expect(s3.combatState!.attackerWins).toBe(1)
    expect(s3.combatState!.roundPhase).toBe("AWAITING_ATTACKER")
  })

  test("defender wins on tie (attacker 6 + ally 4 = 10, defender 4 + ally 4 + slash +2 def = 10)", () => {
    const attAlly = inst("att-ally", ALLY_PLUS4)
    // Defender: 4 + 4(ally) + 2(slash def) = 10 vs attacker 6 + 4 = 10 → tie → defender wins
    const defAlly = inst("def-ally", { ...ALLY_PLUS4, name: "Def Ally", cardNumber: 102 })
    const defSlash = inst("def-slash", ALLY_SLASH) // +3/+2 → defending = +2

    const state = buildCombatCardPlayState({
      attacker,
      defender,
      targetRealm: realm,
      attackerHand: [attAlly],
      defenderHand: [defAlly, defSlash],
    })

    let s = applyMove(state, "p1", { type: "PLAY_COMBAT_CARD", cardInstanceId: "att-ally" }).newState
    s = applyMove(s, "p2", { type: "PLAY_COMBAT_CARD", cardInstanceId: "def-ally" }).newState
    s = applyMove(s, "p2", { type: "PLAY_COMBAT_CARD", cardInstanceId: "def-slash" }).newState
    s = applyMove(s, "p1", { type: "STOP_PLAYING" }).newState
    s = applyMove(s, "p2", { type: "STOP_PLAYING" }).newState

    // tie → defender wins, realm not razed
    expect(s.combatState).toBeNull()
    expect(s.players["p2"]!.formation.slots["A"]!.isRazed).toBe(false)
  })

  test("magical item bonus contributes to combat level", () => {
    // attacker: 6 champion, has Sword of Valor (+2/+1) attached → attacking = +2 → total 8
    const item = inst("item", MAGICAL_ITEM_PLUS2_PLUS1)
    const state = buildCombatCardPlayState({
      attacker,
      defender,
      targetRealm: realm,
      attackerAttachments: [item],
    })

    // Both stop immediately — attacker 8 vs defender 4 → attacker wins round
    let s = applyMove(state, "p1", { type: "STOP_PLAYING" }).newState
    s = applyMove(s, "p2", { type: "STOP_PLAYING" }).newState

    expect(s.combatState).not.toBeNull()
    expect(s.combatState!.attackerWins).toBe(1)
    expect(s.combatState!.roundPhase).toBe("AWAITING_ATTACKER")
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
