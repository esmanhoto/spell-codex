import { describe, test, expect, beforeEach } from "bun:test"
import { applyMove } from "../../src/engine.ts"
import { calculateCombatLevel } from "../../src/combat.ts"
import { _resetInstanceCounter, parseLevel } from "../../src/utils.ts"
import { inst, makeChampion, makeRealm, buildRealmSelfDefenseState } from "../scenario-builders.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

describe("realm defender at level 0 (null level)", () => {
  test("parseLevel(null) returns 0", () => {
    expect(parseLevel(null)).toBe(0)
  })

  test("realm card has null level → combat level is 0", () => {
    const realm = inst("realm", makeRealm()) // level: null
    const level = calculateCombatLevel(realm, [], false, "defensive")
    expect(level).toBe(0)
  })

  test("realm self-defense at level 0 loses to any positive champion", () => {
    const attacker = inst("att", makeChampion({ level: 1 })) // even level 1
    const realm = inst("realm", makeRealm())

    const state = buildRealmSelfDefenseState({ attacker, targetRealm: realm })
    // Realm (level 0) is losing, p2 is active
    const tweaked = { ...state, activePlayer: "p2" as const }

    const { newState, events } = applyMove(tweaked, "p2", { type: "STOP_PLAYING" })

    // Attacker wins
    expect(events.some((e) => e.type === "COMBAT_RESOLVED" && e.outcome === "ATTACKER_WINS")).toBe(
      true,
    )
    // Combat continues (realm not razed on first win)
    expect(newState.combatState).not.toBeNull()
    expect(newState.combatState!.attackerWins).toBe(1)
  })

  test("realm self-defense at level 0 with world-agnostic attacker: attacker still wins", () => {
    const attacker = inst("att", makeChampion({ level: 1, worldId: 0 }))
    const realm = inst("realm", makeRealm({ worldId: 1 })) // FR realm, but realm doesn't get self-bonus

    const state = buildRealmSelfDefenseState({ attacker, targetRealm: realm })
    const tweaked = { ...state, activePlayer: "p2" as const }

    const { events } = applyMove(tweaked, "p2", { type: "STOP_PLAYING" })
    expect(events.some((e) => e.type === "COMBAT_RESOLVED" && e.outcome === "ATTACKER_WINS")).toBe(
      true,
    )
  })

  test("realm level 0 vs champion level 0: defender wins (tie goes to defender)", () => {
    const attacker = inst("att", makeChampion({ level: 0, worldId: 0 }))
    const realm = inst("realm", makeRealm())

    const state = buildRealmSelfDefenseState({ attacker, targetRealm: realm })
    // At level 0 vs 0, attacker is losing (ties → defender wins)
    // So p1 (attacker) is active (they're the losing side)
    const { newState, events } = applyMove(state, "p1", { type: "STOP_PLAYING" })

    expect(events.some((e) => e.type === "COMBAT_RESOLVED" && e.outcome === "DEFENDER_WINS")).toBe(
      true,
    )
    // Attacker champion discarded, combat ends
    expect(newState.combatState).toBeNull()
    expect(newState.players["p1"]!.pool).toHaveLength(0)
  })
})
