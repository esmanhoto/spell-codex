import { describe, test, expect, beforeEach } from "bun:test"
import { getLegalMoves } from "../src/legal-moves.ts"
import { applyMove } from "../src/engine.ts"
import { _resetInstanceCounter } from "../src/utils.ts"
import {
  inst,
  makeChampion,
  makeRealm,
  makeMagicalItem,
  buildCombatCardPlayState,
} from "./scenario-builders.ts"
import { ALLY_PLUS4, WIZARD_SPELL } from "./fixtures.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

// ─── Both players can play combat cards ──────────────────────────────────────

describe("combat CARD_PLAY — both players can play support cards", () => {
  const attacker = inst("att", makeChampion({ level: 8, name: "Strong Attacker" }))
  const defender = inst("def", makeChampion({ level: 4, name: "Weak Defender" }))
  const realm = inst("realm", makeRealm())

  test("winning player gets PLAY_COMBAT_CARD moves for eligible hand cards", () => {
    const ally = inst("ally", ALLY_PLUS4)
    const state = buildCombatCardPlayState({
      attacker,
      defender,
      targetRealm: realm,
      attackerHand: [ally], // p1 is winning (level 8 > 4)
    })

    const moves = getLegalMoves(state, "p1")
    const playCombat = moves.filter((m) => m.type === "PLAY_COMBAT_CARD")
    expect(playCombat).toContainEqual({ type: "PLAY_COMBAT_CARD", cardInstanceId: "ally" })
  })

  test("winning player can applyMove PLAY_COMBAT_CARD without error", () => {
    const ally = inst("ally", ALLY_PLUS4)
    const state = buildCombatCardPlayState({
      attacker,
      defender,
      targetRealm: realm,
      attackerHand: [ally],
    })

    const { newState } = applyMove(state, "p1", {
      type: "PLAY_COMBAT_CARD",
      cardInstanceId: "ally",
    })
    expect(newState.combatState!.attackerCards).toContainEqual(
      expect.objectContaining({ instanceId: "ally" }),
    )
  })

  test("both players get PLAY_COMBAT_CARD simultaneously during CARD_PLAY", () => {
    const attackerAlly = inst("att-ally", ALLY_PLUS4)
    const defenderAlly = inst("def-ally", { ...ALLY_PLUS4, name: "Defender Ally", cardNumber: 102 })
    const state = buildCombatCardPlayState({
      attacker,
      defender,
      targetRealm: realm,
      attackerHand: [attackerAlly],
      defenderHand: [defenderAlly],
    })

    const p1Moves = getLegalMoves(state, "p1")
    const p2Moves = getLegalMoves(state, "p2")

    expect(p1Moves.filter((m) => m.type === "PLAY_COMBAT_CARD")).toContainEqual({
      type: "PLAY_COMBAT_CARD",
      cardInstanceId: "att-ally",
    })
    expect(p2Moves.filter((m) => m.type === "PLAY_COMBAT_CARD")).toContainEqual({
      type: "PLAY_COMBAT_CARD",
      cardInstanceId: "def-ally",
    })
  })

  test("STOP_PLAYING available to both participants", () => {
    const state = buildCombatCardPlayState({
      attacker,
      defender,
      targetRealm: realm,
    })

    const p1Moves = getLegalMoves(state, "p1")
    const p2Moves = getLegalMoves(state, "p2")

    expect(p1Moves).toContainEqual({ type: "STOP_PLAYING" })
    expect(p2Moves).toContainEqual({ type: "STOP_PLAYING" })
  })

  test("winning player can play magical item in combat", () => {
    const item = inst("item", makeMagicalItem({ level: "+2", name: "Combat Sword" }))
    const state = buildCombatCardPlayState({
      attacker,
      defender,
      targetRealm: realm,
      attackerHand: [item],
    })

    const moves = getLegalMoves(state, "p1")
    expect(moves).toContainEqual({ type: "PLAY_COMBAT_CARD", cardInstanceId: "item" })
  })

  test("winning player can play wizard spell if champion supports it", () => {
    const wizChampion = inst(
      "wiz-att",
      makeChampion({ level: 8, name: "Wizard", supportIds: [1, 9, "d19", "o19"] }),
    )
    const spell = inst("spell", WIZARD_SPELL)
    const state = buildCombatCardPlayState({
      attacker: wizChampion,
      defender,
      targetRealm: realm,
      attackerHand: [spell],
    })

    const moves = getLegalMoves(state, "p1")
    expect(moves).toContainEqual({ type: "PLAY_COMBAT_CARD", cardInstanceId: "spell" })
  })

  test("existing combat flow still works — both stop, then combat resolves", () => {
    const ally = inst("def-ally", ALLY_PLUS4)
    const state = buildCombatCardPlayState({
      attacker,
      defender,
      targetRealm: realm,
      defenderHand: [ally], // p2 is losing
    })

    // p2 (losing) plays ally
    const s2 = applyMove(state, "p2", {
      type: "PLAY_COMBAT_CARD",
      cardInstanceId: "def-ally",
    }).newState
    expect(s2.combatState!.defenderCards.length).toBe(1)

    // p1 stops playing — combat not yet resolved (only one stopped)
    const s3 = applyMove(s2, "p1", { type: "STOP_PLAYING" }).newState
    expect(s3.combatState).not.toBeNull()
    expect(s3.combatState!.stoppedPlayers).toEqual(["p1"])

    // p2 stops playing — now both stopped, combat resolves
    const s4 = applyMove(s3, "p2", { type: "STOP_PLAYING" }).newState

    // combat should resolve (attacker 8 vs defender 4+4=8 → tie → defender wins)
    expect(s4.combatState).toBeNull()
  })
})
