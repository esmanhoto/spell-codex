import { describe, test, expect, beforeEach } from "bun:test"
import { applyMove } from "../../src/engine.ts"
import { initGame } from "../../src/init.ts"
import { _resetInstanceCounter } from "../../src/utils.ts"
import { Phase } from "../../src/types.ts"
import { DEFAULT_CONFIG } from "../fixtures.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

// ─── Phase skip: END_TURN from various phases ───────────────────────────────

describe("phase skip via END_TURN", () => {
  test("END_TURN from START_OF_TURN skips drawing and advances to next player", () => {
    const state = initGame(DEFAULT_CONFIG)
    expect(state.phase).toBe(Phase.StartOfTurn)
    const handBefore = state.players["p1"]!.hand.length

    const { newState, events } = applyMove(state, "p1", { type: "END_TURN" })

    // Next player's turn
    expect(newState.activePlayer).toBe("p2")
    expect(newState.phase).toBe(Phase.StartOfTurn)
    expect(newState.currentTurn).toBe(state.currentTurn + 1)

    // p1 did not draw cards (hand unchanged)
    expect(newState.players["p1"]!.hand.length).toBe(handBefore)

    expect(events.some((e) => e.type === "TURN_ENDED")).toBe(true)
  })

  test("END_TURN from PLAY_REALM skips pool and combat phases", () => {
    let state = initGame(DEFAULT_CONFIG)
    // Advance to PLAY_REALM by drawing
    const r1 = applyMove(state, "p1", { type: "PASS" })
    state = r1.newState
    expect(state.phase).toBe(Phase.PlayRealm)

    const { newState, events } = applyMove(state, "p1", { type: "END_TURN" })

    expect(newState.activePlayer).toBe("p2")
    expect(newState.phase).toBe(Phase.StartOfTurn)
    // Phase changes should have been emitted for skipped phases
    const phaseChanges = events.filter((e) => e.type === "PHASE_CHANGED")
    expect(phaseChanges.length).toBeGreaterThanOrEqual(1)
  })

  test("END_TURN from POOL skips combat", () => {
    let state = initGame(DEFAULT_CONFIG)
    // START_OF_TURN → PLAY_REALM
    state = applyMove(state, "p1", { type: "PASS" }).newState
    // PLAY_REALM → POOL
    state = applyMove(state, "p1", { type: "PASS" }).newState
    expect(state.phase).toBe(Phase.Pool)

    const { newState } = applyMove(state, "p1", { type: "END_TURN" })

    expect(newState.activePlayer).toBe("p2")
    expect(newState.phase).toBe(Phase.StartOfTurn)
  })

  test("END_TURN from COMBAT goes to next player", () => {
    let state = initGame(DEFAULT_CONFIG)
    state = applyMove(state, "p1", { type: "PASS" }).newState // → PLAY_REALM
    state = applyMove(state, "p1", { type: "PASS" }).newState // → POOL
    state = applyMove(state, "p1", { type: "PASS" }).newState // → COMBAT
    expect(state.phase).toBe(Phase.Combat)

    const { newState } = applyMove(state, "p1", { type: "END_TURN" })

    expect(newState.activePlayer).toBe("p2")
    expect(newState.phase).toBe(Phase.StartOfTurn)
  })

  test("END_TURN fails when hand exceeds maxEnd", () => {
    let state = initGame(DEFAULT_CONFIG)
    // Give p1 way too many cards in hand (maxEnd is 8 for 55-card)
    const extraCards = Array.from({ length: 10 }, (_, i) => state.players["p1"]!.drawPile[i]!)
    state = {
      ...state,
      players: {
        ...state.players,
        p1: {
          ...state.players["p1"]!,
          hand: [...state.players["p1"]!.hand, ...extraCards],
        },
      },
    }

    expect(() => applyMove(state, "p1", { type: "END_TURN" })).toThrow("Discard down to 8 cards")
  })
})

// ─── PASS from PHASE_FIVE with large hand ────────────────────────────────────

describe("PASS from PHASE_FIVE: hand size enforcement", () => {
  test("PASS fails when hand exceeds maxEnd", () => {
    let state = initGame(DEFAULT_CONFIG)
    // Advance to PHASE_FIVE
    state = applyMove(state, "p1", { type: "PASS" }).newState // → PLAY_REALM
    state = applyMove(state, "p1", { type: "PASS" }).newState // → POOL
    state = applyMove(state, "p1", { type: "PASS" }).newState // → COMBAT
    state = applyMove(state, "p1", { type: "PASS" }).newState // → PHASE_FIVE
    expect(state.phase).toBe(Phase.PhaseFive)

    // Stuff hand beyond limit
    const extra = Array.from({ length: 5 }, (_, i) => state.players["p1"]!.drawPile[i]!)
    state = {
      ...state,
      players: {
        ...state.players,
        p1: {
          ...state.players["p1"]!,
          hand: [...state.players["p1"]!.hand, ...extra],
        },
      },
    }

    expect(() => applyMove(state, "p1", { type: "PASS" })).toThrow("Discard down to 8 cards")
  })
})
