import { describe, test, expect, beforeEach } from "bun:test"
import { applyMove } from "../../src/engine.ts"
import { getLegalMoves } from "../../src/legal-moves.ts"
import { initGame } from "../../src/init.ts"
import { _resetInstanceCounter } from "../../src/utils.ts"
import { Phase } from "../../src/types.ts"
import type { GameState, ResolutionContext } from "../../src/types.ts"
import { DEFAULT_CONFIG, EVENT_CARD, COUNTER_EVENT_CARD } from "../fixtures.ts"
import { inst, makeChampion } from "../scenario-builders.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

function stateWithCounterWindow(): GameState {
  const base = initGame(DEFAULT_CONFIG)
  const eventCard = inst("event1", EVENT_CARD)
  const counterCard = inst("counter1", COUNTER_EVENT_CARD)
  const ctx: ResolutionContext = {
    cardInstanceId: "event1",
    pendingCard: eventCard,
    initiatingPlayer: "p1",
    resolvingPlayer: "p1",
    cardDestination: "abyss",
    counterWindowOpen: true,
  }
  return {
    ...base,
    phase: Phase.Pool,
    activePlayer: "p1",
    resolutionContext: ctx,
    players: {
      ...base.players,
      p1: { ...base.players["p1"]!, hand: [] },
      p2: { ...base.players["p2"]!, hand: [counterCard] },
    },
  }
}

// ─── Counter window: legal moves ─────────────────────────────────────────────

describe("counter window: legal moves", () => {
  test("resolving player still gets RESOLVE_* moves during counter window", () => {
    const state = stateWithCounterWindow()
    const moves = getLegalMoves(state, "p1")
    // Resolving player can still issue resolution moves; counter window only gates the opponent
    expect(moves.length).toBeGreaterThan(0)
    for (const m of moves) {
      expect(m.type).toMatch(/^RESOLVE_/)
    }
  })

  test("non-resolving player gets PASS_COUNTER + counter card moves", () => {
    const state = stateWithCounterWindow()
    const moves = getLegalMoves(state, "p2")

    expect(moves.some((m) => m.type === "PASS_COUNTER")).toBe(true)
    expect(moves.some((m) => m.type === "PLAY_EVENT")).toBe(true)
    // No other move types
    const types = new Set(moves.map((m) => m.type))
    expect(types.size).toBeLessThanOrEqual(2)
  })

  test("non-resolving player without counter cards only gets PASS_COUNTER", () => {
    const state = {
      ...stateWithCounterWindow(),
      players: {
        ...stateWithCounterWindow().players,
        p2: { ...stateWithCounterWindow().players["p2"]!, hand: [] },
      },
    }
    const moves = getLegalMoves(state, "p2")
    expect(moves).toEqual([{ type: "PASS_COUNTER" }])
  })
})

// ─── Counter play: terminates resolution ─────────────────────────────────────

describe("counter play: terminates resolution entirely", () => {
  test("PLAY_EVENT as counter: cancels original, both cards placed, resolution ends", () => {
    const state = stateWithCounterWindow()
    const { newState, events } = applyMove(state, "p2", {
      type: "PLAY_EVENT",
      cardInstanceId: "counter1",
    })

    // Resolution ended
    expect(newState.resolutionContext).toBeNull()

    // Counter card in abyss (events go to abyss)
    expect(newState.players["p2"]!.abyss.some((c) => c.instanceId === "counter1")).toBe(true)
    // Original event also in abyss
    expect(newState.players["p1"]!.abyss.some((c) => c.instanceId === "event1")).toBe(true)

    expect(events.some((e) => e.type === "COUNTER_PLAYED")).toBe(true)
  })

  test("PASS_COUNTER: closes counter window, resolving player can act", () => {
    const state = stateWithCounterWindow()
    const { newState } = applyMove(state, "p2", { type: "PASS_COUNTER" })

    expect(newState.resolutionContext).not.toBeNull()
    expect(newState.resolutionContext!.counterWindowOpen).toBe(false)

    // Now p1 (resolving player) should have RESOLVE_* moves
    const moves = getLegalMoves(newState, "p1")
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.every((m) => m.type.startsWith("RESOLVE_"))).toBe(true)
  })
})

// ─── Pool counter: terminates resolution, card stays in pool ─────────────────

describe("pool counter: card stays in pool", () => {
  test("USE_POOL_COUNTER: cancels original, counter card stays in pool", () => {
    const base = stateWithCounterWindow()
    const poolChampion = inst("pool-c", makeChampion())
    const poolCounter = inst("pool-counter", {
      ...COUNTER_EVENT_CARD,
      typeId: 2, // Artifact
      cardNumber: 220,
      name: "Rod of Dispel Magic",
    })
    const state: GameState = {
      ...base,
      players: {
        ...base.players,
        p2: {
          ...base.players["p2"]!,
          hand: [],
          pool: [{ champion: poolChampion, attachments: [poolCounter] }],
        },
      },
    }

    const { newState, events } = applyMove(state, "p2", {
      type: "USE_POOL_COUNTER",
      cardInstanceId: "pool-counter",
    })

    // Resolution ended
    expect(newState.resolutionContext).toBeNull()
    // Pool counter still in pool
    expect(
      newState.players["p2"]!.pool[0]!.attachments.some((a) => a.instanceId === "pool-counter"),
    ).toBe(true)
    // Original event cancelled → abyss
    expect(newState.players["p1"]!.abyss.some((c) => c.instanceId === "event1")).toBe(true)
    expect(events.some((e) => e.type === "COUNTER_PLAYED")).toBe(true)
  })
})

// ─── No nested resolution: counter ends it, doesn't chain ────────────────────

describe("counter does NOT create new resolution", () => {
  test("after counter play, no resolution context exists", () => {
    const state = stateWithCounterWindow()
    const { newState } = applyMove(state, "p2", {
      type: "PLAY_EVENT",
      cardInstanceId: "counter1",
    })

    // No resolution at all — no chain
    expect(newState.resolutionContext).toBeNull()
    // Normal game moves resume
    const p1Moves = getLegalMoves(newState, "p1")
    expect(p1Moves.some((m) => m.type === "PASS" || m.type === "END_TURN")).toBe(true)
  })
})
