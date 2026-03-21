/**
 * Tests for ALLOW_CHAMPION_REUSE, REQUIRE_NEW_CHAMPION,
 * and cross-player DECLARE_DEFENSE / CONTINUE_ATTACK.
 */
import { describe, test, expect } from "bun:test"
import { applyMove } from "../../src/engine.ts"
import { getLegalMoves } from "../../src/legal-moves.ts"
import {
  buildCombatCardPlayState,
  inst,
  makeChampion,
  makeRealm,
} from "../scenario-builders.ts"
import type { GameState, Move } from "../../src/types.ts"

function hasMove(moves: Move[], type: string, fields: Record<string, unknown> = {}): boolean {
  return moves.some((m) => {
    if (m.type !== type) return false
    for (const [k, v] of Object.entries(fields)) {
      if ((m as Record<string, unknown>)[k] !== v) return false
    }
    return true
  })
}

describe("ALLOW_CHAMPION_REUSE", () => {
  const attacker = inst("att", makeChampion({ level: 8, name: "Attacker" }))
  const defender = inst("def", makeChampion({ level: 4, name: "Defender" }))
  const realm = inst("realm", makeRealm())

  test("removes champion from championsUsedThisBattle", () => {
    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    expect(state.combatState!.championsUsedThisBattle).toContain("att")

    const result = applyMove(state, "p1", {
      type: "ALLOW_CHAMPION_REUSE",
      cardInstanceId: "att",
    })

    expect(result.newState.combatState!.championsUsedThisBattle).not.toContain("att")
    expect(result.events.some((e) => e.type === "CHAMPION_REUSE_ALLOWED")).toBe(true)
  })

  test("throws if champion not in championsUsedThisBattle", () => {
    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })

    expect(() =>
      applyMove(state, "p1", {
        type: "ALLOW_CHAMPION_REUSE",
        cardInstanceId: "nonexistent",
      }),
    ).toThrow()
  })

  test("ALLOW_CHAMPION_REUSE not generated during CARD_PLAY (reuse flows through CONTINUE_ATTACK/DECLARE_DEFENSE)", () => {
    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const moves = getLegalMoves(state, "p1")

    // Not in CARD_PLAY legal moves — champion reuse is handled implicitly via More Actions
    expect(hasMove(moves, "ALLOW_CHAMPION_REUSE", { cardInstanceId: "att" })).toBe(false)
  })
})

describe("REQUIRE_NEW_CHAMPION", () => {
  const attacker = inst("att", makeChampion({ level: 8, name: "Attacker" }))
  const defender = inst("def", makeChampion({ level: 4, name: "Defender" }))
  const realm = inst("realm", makeRealm())

  test("transitions to AWAITING phase when side has no champion", () => {
    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    // Remove attacker champion first
    const s: GameState = {
      ...state,
      combatState: { ...state.combatState!, attacker: null },
    }

    const result = applyMove(s, "p1", {
      type: "REQUIRE_NEW_CHAMPION",
      side: "attacker",
    })

    expect(result.newState.combatState!.roundPhase).toBe("AWAITING_ATTACKER")
    expect(result.newState.activePlayer).toBe("p1")
    expect(result.newState.combatState!.stoppedPlayers).toEqual([])
    expect(result.events.some((e) => e.type === "COMBAT_CHAMPION_REQUIRED")).toBe(true)
  })

  test("transitions to AWAITING_DEFENDER when defender is null", () => {
    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const s: GameState = {
      ...state,
      combatState: { ...state.combatState!, defender: null },
    }

    const result = applyMove(s, "p2", {
      type: "REQUIRE_NEW_CHAMPION",
      side: "defender",
    })

    expect(result.newState.combatState!.roundPhase).toBe("AWAITING_DEFENDER")
    expect(result.newState.activePlayer).toBe("p2")
  })

  test("throws if champion is still present", () => {
    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })

    expect(() =>
      applyMove(state, "p1", {
        type: "REQUIRE_NEW_CHAMPION",
        side: "attacker",
      }),
    ).toThrow("Cannot require new champion")
  })

  test("legal moves include REQUIRE_NEW_CHAMPION when champion is null", () => {
    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const s: GameState = {
      ...state,
      combatState: { ...state.combatState!, attacker: null },
    }
    const moves = getLegalMoves(s, "p1")
    expect(hasMove(moves, "REQUIRE_NEW_CHAMPION", { side: "attacker" })).toBe(true)
    expect(hasMove(moves, "REQUIRE_NEW_CHAMPION", { side: "defender" })).toBe(false)
  })
})

describe("Cross-player DECLARE_DEFENSE", () => {
  const attacker = inst("att", makeChampion({ level: 8, name: "Attacker" }))
  const realm = inst("realm", makeRealm())
  const opponentChamp = inst("opp-champ", makeChampion({ level: 6, name: "Opponent Champion" }))

  test("defender can use opponent's champion from pool", () => {
    const base = buildCombatCardPlayState({
      attacker,
      defender: inst("def-placeholder", makeChampion({ level: 1 })),
      targetRealm: realm,
    })
    // Set up AWAITING_DEFENDER phase with opponent champion in attacker's pool
    const state: GameState = {
      ...base,
      activePlayer: "p2",
      combatState: {
        ...base.combatState!,
        roundPhase: "AWAITING_DEFENDER",
        defender: null,
      },
      players: {
        ...base.players,
        p1: {
          ...base.players.p1!,
          pool: [
            { champion: attacker, attachments: [] },
            { champion: opponentChamp, attachments: [] },
          ],
        },
        p2: {
          ...base.players.p2!,
          pool: [],
        },
      },
    }

    // Legal moves should include cross-player defense
    const moves = getLegalMoves(state, "p2")
    expect(hasMove(moves, "DECLARE_DEFENSE", { championId: "opp-champ", fromPlayerId: "p1" })).toBe(
      true,
    )

    // Execute the move
    const result = applyMove(state, "p2", {
      type: "DECLARE_DEFENSE",
      championId: "opp-champ",
      fromPlayerId: "p1",
    })

    expect(result.newState.combatState!.defender!.instanceId).toBe("opp-champ")
    // Champion should be moved from p1's pool to p2's pool
    expect(result.newState.players.p1!.pool.some((e) => e.champion.instanceId === "opp-champ")).toBe(
      false,
    )
    expect(result.newState.players.p2!.pool.some((e) => e.champion.instanceId === "opp-champ")).toBe(
      true,
    )
  })
})

describe("Cross-player CONTINUE_ATTACK", () => {
  const realm = inst("realm", makeRealm())
  const opponentChamp = inst("opp-att", makeChampion({ level: 7, name: "Opponent Attacker" }))

  test("attacker can use opponent's champion for next round", () => {
    const base = buildCombatCardPlayState({
      attacker: inst("att", makeChampion({ level: 8 })),
      defender: inst("def", makeChampion({ level: 4 })),
      targetRealm: realm,
    })
    // Set up AWAITING_ATTACKER with opponent champion in p2's pool
    const state: GameState = {
      ...base,
      activePlayer: "p1",
      combatState: {
        ...base.combatState!,
        roundPhase: "AWAITING_ATTACKER",
        attacker: null,
        defender: null,
        attackerWins: 1,
      },
      players: {
        ...base.players,
        p2: {
          ...base.players.p2!,
          pool: [{ champion: opponentChamp, attachments: [] }],
        },
      },
    }

    const moves = getLegalMoves(state, "p1")
    expect(
      hasMove(moves, "CONTINUE_ATTACK", { championId: "opp-att", fromPlayerId: "p2" }),
    ).toBe(true)

    const result = applyMove(state, "p1", {
      type: "CONTINUE_ATTACK",
      championId: "opp-att",
      fromPlayerId: "p2",
    })

    expect(result.newState.combatState!.attacker!.instanceId).toBe("opp-att")
    expect(result.newState.combatState!.roundPhase).toBe("AWAITING_DEFENDER")
    // Champion moved from p2 pool to p1 pool
    expect(result.newState.players.p2!.pool.some((e) => e.champion.instanceId === "opp-att")).toBe(
      false,
    )
    expect(result.newState.players.p1!.pool.some((e) => e.champion.instanceId === "opp-att")).toBe(
      true,
    )
  })
})
