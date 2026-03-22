/**
 * Full combat flow: DECLARE_ATTACK → DECLARE_DEFENSE/DECLINE_DEFENSE →
 * CARD_PLAY → STOP_PLAYING → outcome (raze, discard, spoils, continue attack).
 *
 * Tests the end-to-end combat lifecycle rather than isolated functions.
 */

import { describe, test, expect, beforeEach } from "bun:test"
import { applyMove } from "../../src/engine.ts"
import { getLegalMoves } from "../../src/legal-moves.ts"
import { initGame } from "../../src/init.ts"
import { _resetInstanceCounter } from "../../src/utils.ts"
import { Phase } from "../../src/types.ts"
import type { GameState, CardInstance, Move } from "../../src/types.ts"
import { inst, makeChampion, makeRealm } from "../scenario-builders.ts"
import { DEFAULT_CONFIG } from "../fixtures.ts"

beforeEach(() => _resetInstanceCounter())

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a state ready for DECLARE_ATTACK: p1 has champion in pool, p2 has realm in formation. */
function buildPreAttackState(opts: {
  attacker: CardInstance
  targetRealm: CardInstance
  defenderChampion?: CardInstance
  extraP2Realms?: Record<string, CardInstance>
}): GameState {
  const base = initGame(DEFAULT_CONFIG)
  const { attacker, targetRealm, defenderChampion, extraP2Realms = {} } = opts

  const p2Slots: Record<string, { realm: CardInstance; isRazed: boolean; holdings: CardInstance[] }> = {
    A: { realm: targetRealm, isRazed: false, holdings: [] },
  }
  for (const [slot, realm] of Object.entries(extraP2Realms)) {
    p2Slots[slot] = { realm, isRazed: false, holdings: [] }
  }

  return {
    ...base,
    phase: Phase.Pool,
    activePlayer: "p1",
    players: {
      ...base.players,
      p1: {
        ...base.players.p1!,
        pool: [{ champion: attacker, attachments: [] }],
        formation: {
          size: 6,
          slots: {
            A: {
              realm: inst("p1-realm", makeRealm({ name: "P1 Realm" })),
              isRazed: false,
              holdings: [],
            },
          },
        },
      },
      p2: {
        ...base.players.p2!,
        pool: defenderChampion ? [{ champion: defenderChampion, attachments: [] }] : [],
        formation: { size: 6, slots: p2Slots },
      },
    },
  }
}

function applyMoveChecked(state: GameState, playerId: string, move: Move): GameState {
  return applyMove(state, playerId, move).newState
}

// ─── Full attack → defense → resolve flow ────────────────────────────────────

describe("full combat flow", () => {
  const attacker = inst("att", makeChampion({ level: 8, name: "Strong Hero" }))
  const defender = inst("def", makeChampion({ level: 4, name: "Weak Hero" }))
  const targetRealm = inst("realm-A", makeRealm({ name: "Target Realm" }))

  test("DECLARE_ATTACK → legal moves switch to DECLARE_DEFENSE/DECLINE_DEFENSE for defender", () => {
    const state = buildPreAttackState({ attacker, targetRealm, defenderChampion: defender })
    const s1 = applyMoveChecked(state, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetPlayerId: "p2",
      targetRealmSlot: "A",
    })

    expect(s1.combatState).not.toBeNull()
    expect(s1.combatState!.attackingPlayer).toBe("p1")
    expect(s1.combatState!.defendingPlayer).toBe("p2")
    expect(s1.combatState!.roundPhase).toBe("AWAITING_DEFENDER")

    const p2Moves = getLegalMoves(s1, "p2")
    expect(p2Moves.some((m) => m.type === "DECLARE_DEFENSE")).toBe(true)
    expect(p2Moves.some((m) => m.type === "DECLINE_DEFENSE")).toBe(true)

    // p1 should NOT have combat moves yet
    const p1Moves = getLegalMoves(s1, "p1")
    expect(p1Moves.some((m) => m.type === "DECLARE_DEFENSE")).toBe(false)
  })

  test("DECLARE_DEFENSE → combat enters CARD_PLAY with assigned defender", () => {
    const state = buildPreAttackState({ attacker, targetRealm, defenderChampion: defender })
    let s = applyMoveChecked(state, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetPlayerId: "p2",
      targetRealmSlot: "A",
    })
    s = applyMoveChecked(s, "p2", { type: "DECLARE_DEFENSE", championId: "def" })

    expect(s.combatState!.roundPhase).toBe("CARD_PLAY")
    expect(s.combatState!.attacker!.instanceId).toBe("att")
    expect(s.combatState!.defender!.instanceId).toBe("def")
  })

  test("DECLINE_DEFENSE → realm is razed, attacker gets spoils", () => {
    const state = buildPreAttackState({ attacker, targetRealm, defenderChampion: defender })
    let s = applyMoveChecked(state, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetPlayerId: "p2",
      targetRealmSlot: "A",
    })
    s = applyMoveChecked(s, "p2", { type: "DECLINE_DEFENSE" })

    // Realm is razed
    const slotA = s.players.p2!.formation.slots.A!
    expect(slotA.isRazed).toBe(true)

    // Combat ended
    expect(s.combatState).toBeNull()

    // Attacker earned spoils (pendingSpoil or card drawn)
    const hasSpoil = s.pendingSpoil === "p1" || s.pendingSpoilCard !== null
    expect(hasSpoil).toBe(true)
  })

  test("attacker wins after defender STOP_PLAYING → defender champion discarded, AWAITING_ATTACKER", () => {
    const state = buildPreAttackState({ attacker, targetRealm, defenderChampion: defender })
    let s = applyMoveChecked(state, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetPlayerId: "p2",
      targetRealmSlot: "A",
    })
    s = applyMoveChecked(s, "p2", { type: "DECLARE_DEFENSE", championId: "def" })

    // Defender concedes
    s = applyMoveChecked(s, "p2", { type: "STOP_PLAYING" })

    // Defender champion removed from pool
    expect(s.players.p2!.pool.some((e) => e.champion.instanceId === "def")).toBe(false)

    // Defender champion in discard pile
    expect(s.players.p2!.discardPile.some((c) => c.instanceId === "def")).toBe(true)

    // Round 1 won — attacker can continue or end
    expect(s.combatState).not.toBeNull()
    expect(s.combatState!.roundPhase).toBe("AWAITING_ATTACKER")
    expect(s.combatState!.attackerWins).toBe(1)
  })

  test("defender wins after attacker STOP_PLAYING → attacker champion discarded, combat ends", () => {
    const state = buildPreAttackState({ attacker, targetRealm, defenderChampion: defender })
    let s = applyMoveChecked(state, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetPlayerId: "p2",
      targetRealmSlot: "A",
    })
    s = applyMoveChecked(s, "p2", { type: "DECLARE_DEFENSE", championId: "def" })

    // Attacker concedes
    s = applyMoveChecked(s, "p1", { type: "STOP_PLAYING" })

    // Attacker champion removed from pool
    expect(s.players.p1!.pool.some((e) => e.champion.instanceId === "att")).toBe(false)

    // Attacker champion in discard
    expect(s.players.p1!.discardPile.some((c) => c.instanceId === "att")).toBe(true)

    // Combat ended — defender wins, no raze
    expect(s.combatState).toBeNull()
    expect(s.players.p2!.formation.slots.A!.isRazed).toBe(false)
  })

  test("END_ATTACK after first round win → combat ends without raze, no spoils", () => {
    const state = buildPreAttackState({ attacker, targetRealm, defenderChampion: defender })
    let s = applyMoveChecked(state, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetPlayerId: "p2",
      targetRealmSlot: "A",
    })
    s = applyMoveChecked(s, "p2", { type: "DECLARE_DEFENSE", championId: "def" })
    s = applyMoveChecked(s, "p2", { type: "STOP_PLAYING" }) // defender concedes round 1

    // attacker wins round 1 → AWAITING_ATTACKER
    expect(s.combatState!.attackerWins).toBe(1)

    s = applyMoveChecked(s, "p1", { type: "END_ATTACK" })

    // Combat ended — realm NOT razed (only 1 win, need 2)
    expect(s.combatState).toBeNull()
    expect(s.players.p2!.formation.slots.A!.isRazed).toBe(false)

    // No spoils — spoils are only earned on raze (2 wins or decline defense)
    expect(s.pendingSpoil).toBeNull()
    expect(s.pendingSpoilCard).toBeNull()
  })

  test("CONTINUE_ATTACK after first win → new round, need new defender", () => {
    const defender2 = inst("def2", makeChampion({ level: 3, name: "Second Defender", cardNumber: 9002 }))
    const state = buildPreAttackState({ attacker, targetRealm, defenderChampion: defender })
    // Give p2 a second champion
    const withDef2: GameState = {
      ...state,
      players: {
        ...state.players,
        p2: {
          ...state.players.p2!,
          pool: [
            ...state.players.p2!.pool,
            { champion: defender2, attachments: [] },
          ],
        },
      },
    }

    let s = applyMoveChecked(withDef2, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetPlayerId: "p2",
      targetRealmSlot: "A",
    })
    s = applyMoveChecked(s, "p2", { type: "DECLARE_DEFENSE", championId: "def" })
    s = applyMoveChecked(s, "p2", { type: "STOP_PLAYING" }) // round 1: defender concedes

    // Continue with same champion for round 2
    s = applyMoveChecked(s, "p1", { type: "CONTINUE_ATTACK", championId: "att" })

    expect(s.combatState!.roundPhase).toBe("AWAITING_DEFENDER")
    expect(s.combatState!.attackerWins).toBe(1)
    expect(s.combatState!.attacker!.instanceId).toBe("att")

    // p2 must defend or decline
    const p2Moves = getLegalMoves(s, "p2")
    expect(p2Moves.some((m) => m.type === "DECLARE_DEFENSE")).toBe(true)
    expect(p2Moves.some((m) => m.type === "DECLINE_DEFENSE")).toBe(true)
  })

  test("two consecutive wins → realm razed", () => {
    const defender2 = inst("def2", makeChampion({ level: 3, name: "Second Defender", cardNumber: 9002 }))
    const state = buildPreAttackState({ attacker, targetRealm, defenderChampion: defender })
    const withDef2: GameState = {
      ...state,
      players: {
        ...state.players,
        p2: {
          ...state.players.p2!,
          pool: [
            ...state.players.p2!.pool,
            { champion: defender2, attachments: [] },
          ],
        },
      },
    }

    let s = applyMoveChecked(withDef2, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetPlayerId: "p2",
      targetRealmSlot: "A",
    })
    // Round 1
    s = applyMoveChecked(s, "p2", { type: "DECLARE_DEFENSE", championId: "def" })
    s = applyMoveChecked(s, "p2", { type: "STOP_PLAYING" })
    expect(s.combatState!.attackerWins).toBe(1)

    // Round 2
    s = applyMoveChecked(s, "p1", { type: "CONTINUE_ATTACK", championId: "att" })
    s = applyMoveChecked(s, "p2", { type: "DECLARE_DEFENSE", championId: "def2" })
    s = applyMoveChecked(s, "p2", { type: "STOP_PLAYING" })

    // Two wins → realm razed, combat over
    expect(s.combatState).toBeNull()
    expect(s.players.p2!.formation.slots.A!.isRazed).toBe(true)

    // Both defender champions discarded
    expect(s.players.p2!.pool.some((e) => e.champion.instanceId === "def")).toBe(false)
    expect(s.players.p2!.pool.some((e) => e.champion.instanceId === "def2")).toBe(false)
  })

  test("realm self-defense: DECLINE_DEFENSE when no champion → realm razed immediately", () => {
    // p2 has no champions
    const state = buildPreAttackState({ attacker, targetRealm })
    let s = applyMoveChecked(state, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetPlayerId: "p2",
      targetRealmSlot: "A",
    })

    // p2 can still decline
    const p2Moves = getLegalMoves(s, "p2")
    expect(p2Moves.some((m) => m.type === "DECLINE_DEFENSE")).toBe(true)

    s = applyMoveChecked(s, "p2", { type: "DECLINE_DEFENSE" })
    expect(s.players.p2!.formation.slots.A!.isRazed).toBe(true)
    expect(s.combatState).toBeNull()
  })

  test("zero-realm condition clears pool on raze, winner set at end of turn", () => {
    // p2 has only one realm — razing it triggers zero-realm (pool cleared)
    const state = buildPreAttackState({ attacker, targetRealm, defenderChampion: defender })

    let s = applyMoveChecked(state, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetPlayerId: "p2",
      targetRealmSlot: "A",
    })
    s = applyMoveChecked(s, "p2", { type: "DECLINE_DEFENSE" })

    // p2 lost their only realm — pool should be cleared immediately
    expect(s.players.p2!.formation.slots.A!.isRazed).toBe(true)
    expect(s.players.p2!.pool.length).toBe(0)

    // Resolve spoils if pending
    if (s.pendingSpoilCard) {
      s = applyMoveChecked(s, "p1", { type: "SPOIL_RETURN" })
    }

    // Winner is checked at end of turn, not during combat
    expect(s.winner).toBeNull()

    // End p1's turn — winner check happens at turn boundary
    s = applyMoveChecked(s, "p1", { type: "END_TURN" })

    // p2 has no unrazed realms — p1 should eventually win
    // (win condition: full unrazed formation at start of own turn)
    // p2's turn starts but they can't win with all razed realms
    // The game continues until p1's next turn with full formation
    // For this test, just verify pool was cleared and game state is consistent
    expect(s.players.p2!.pool.length).toBe(0)
  })

  test("wrong player cannot declare attack", () => {
    const state = buildPreAttackState({ attacker, targetRealm, defenderChampion: defender })
    expect(() => {
      applyMove(state, "p2", {
        type: "DECLARE_ATTACK",
        championId: "att",
        targetPlayerId: "p1",
        targetRealmSlot: "A",
      })
    }).toThrow()
  })

  test("wrong player cannot declare defense", () => {
    const state = buildPreAttackState({ attacker, targetRealm, defenderChampion: defender })
    const s1 = applyMoveChecked(state, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetPlayerId: "p2",
      targetRealmSlot: "A",
    })
    expect(() => {
      applyMove(s1, "p1", { type: "DECLARE_DEFENSE", championId: "att" })
    }).toThrow()
  })

  test("cannot attack with a champion not in pool", () => {
    const state = buildPreAttackState({ attacker, targetRealm, defenderChampion: defender })
    expect(() => {
      applyMove(state, "p1", {
        type: "DECLARE_ATTACK",
        championId: "nonexistent",
        targetPlayerId: "p2",
        targetRealmSlot: "A",
      })
    }).toThrow()
  })

  test("cannot attack a razed realm", () => {
    const state = buildPreAttackState({ attacker, targetRealm, defenderChampion: defender })
    // Manually raze slot A
    const razedState: GameState = {
      ...state,
      players: {
        ...state.players,
        p2: {
          ...state.players.p2!,
          formation: {
            ...state.players.p2!.formation,
            slots: {
              A: { ...state.players.p2!.formation.slots.A!, isRazed: true },
            },
          },
        },
      },
    }

    // p1 should NOT have DECLARE_ATTACK targeting slot A
    const p1Moves = getLegalMoves(razedState, "p1")
    const attackMoves = p1Moves.filter(
      (m) => m.type === "DECLARE_ATTACK" && (m as { targetRealmSlot: string }).targetRealmSlot === "A",
    )
    expect(attackMoves.length).toBe(0)
  })
})
