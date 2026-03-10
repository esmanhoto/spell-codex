/**
 * Scenario: Realm self-defense (e.g. Jungles of Chult)
 *
 * Realms with a level field can declare themselves as their own defender.
 * Two rules under test:
 *
 *   1. No world bonus — the realm is the target realm, so comparing its worldId
 *      to itself would trivially match; the engine must skip the bonus.
 *
 *   2. Combat outcome — attacker with a higher adjusted level wins and razes the
 *      realm; attacker with equal or lower level loses (ties go to the defender).
 */

import { describe, expect, test } from "bun:test"
import { getLegalMoves } from "../../src/legal-moves.ts"
import { applyMove } from "../../src/engine.ts"
import { inst, makeChampion, makeRealm, buildRealmSelfDefenseState } from "../scenario-builders.ts"

const CHULT = makeRealm({ name: "Jungles of Chult", level: 5, worldId: 1 })

describe("realm self-defense: no world bonus on realm defender", () => {
  test("same-world attacker gets +3 but self-defending realm does NOT", () => {
    // Attacker: FR champion level 5 → adjusted 5+3=8 (world bonus vs Chult realm)
    // Defender: Chult realm level 5 → adjusted 5 (no self-bonus)
    const state = buildRealmSelfDefenseState({
      attacker: inst("att", makeChampion({ level: 5, worldId: 1 })),
      targetRealm: inst("chult", CHULT),
    })

    const attackerMoves = getLegalMoves(state, "p1")
    const defenderMoves = getLegalMoves(state, "p2")

    const attackerLevel = attackerMoves.find((m) => m.type === "SET_COMBAT_LEVEL")
    const defenderLevel = defenderMoves.find((m) => m.type === "SET_COMBAT_LEVEL")

    expect((attackerLevel as { level: number }).level).toBe(8) // 5 + 3 world bonus
    expect((defenderLevel as { level: number }).level).toBe(5) // no bonus
  })
})

describe("realm self-defense: combat outcomes", () => {
  test("attacker wins round — realm stays, battle continues to AWAITING_ATTACKER", () => {
    // Attacker level 6, no world match → 6 vs Chult 5 → attacker wins the round
    // but the realm is NOT razed yet; battle continues so the defender can present
    // another champion (or decline, which would raze it)
    const state = buildRealmSelfDefenseState({
      attacker: inst("att", makeChampion({ level: 6, worldId: 0 })),
      targetRealm: inst("chult", CHULT),
    })

    const result = applyMove(state, "p1", { type: "STOP_PLAYING" })

    const resolved = result.events.find((e) => e.type === "COMBAT_RESOLVED")
    expect(resolved).toBeDefined()
    expect((resolved as { outcome: string }).outcome).toBe("ATTACKER_WINS")

    // Realm must NOT be razed yet
    const razed = result.events.find((e) => e.type === "REALM_RAZED")
    expect(razed).toBeUndefined()

    // Battle should continue — defender must pick a new champion or decline
    expect(result.newState.combatState?.roundPhase).toBe("AWAITING_ATTACKER")
  })

  test("attacker wins round then defender declines → realm is razed", () => {
    const state = buildRealmSelfDefenseState({
      attacker: inst("att", makeChampion({ level: 6, worldId: 0 })),
      targetRealm: inst("chult", CHULT),
    })

    // Round 1: realm self-defends and loses
    const afterRound1 = applyMove(state, "p1", { type: "STOP_PLAYING" })
    expect(afterRound1.newState.combatState?.roundPhase).toBe("AWAITING_ATTACKER")

    // Add a second attacker to the pool so the attacker can continue
    const att2 = inst("att2", makeChampion({ level: 6, worldId: 0 }))
    const stateWithAtt2 = {
      ...afterRound1.newState,
      players: {
        ...afterRound1.newState.players,
        p1: {
          ...afterRound1.newState.players["p1"]!,
          pool: [...afterRound1.newState.players["p1"]!.pool, { champion: att2, attachments: [] }],
        },
      },
    }

    const afterContinue = applyMove(stateWithAtt2, "p1", {
      type: "CONTINUE_ATTACK",
      championId: "att2",
    })
    expect(afterContinue.newState.combatState?.roundPhase).toBe("AWAITING_DEFENDER")

    // Defender has no other champion — must decline
    const afterDecline = applyMove(afterContinue.newState, "p2", { type: "DECLINE_DEFENSE" })

    const razed = afterDecline.events.find((e) => e.type === "REALM_RAZED")
    expect(razed).toBeDefined()
  })

  test("attacker ties realm level → defender wins (ties go to defender)", () => {
    // Attacker level 5, no world match → 5 vs Chult 5 → defender wins
    const state = buildRealmSelfDefenseState({
      attacker: inst("att", makeChampion({ level: 5, worldId: 0 })),
      targetRealm: inst("chult", CHULT),
    })

    const result = applyMove(state, "p1", { type: "STOP_PLAYING" })

    const resolved = result.events.find((e) => e.type === "COMBAT_RESOLVED")
    expect(resolved).toBeDefined()
    expect((resolved as { outcome: string }).outcome).toBe("DEFENDER_WINS")

    const razed = result.events.find((e) => e.type === "REALM_RAZED")
    expect(razed).toBeUndefined()
  })
})
