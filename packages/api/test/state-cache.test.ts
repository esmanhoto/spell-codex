/**
 * Unit tests for the in-memory game state cache.
 */

import { describe, it, expect, beforeEach } from "bun:test"
import {
  getGameCache,
  getCachedMeta,
  setCachedState,
  evictCachedState,
} from "../src/state-cache.ts"
import type { GameState } from "@spell/engine"

const GAME_A = "aaaaaaaa-0000-0000-0000-000000000001"
const GAME_B = "bbbbbbbb-0000-0000-0000-000000000002"
const P1 = "player-1"
const P2 = "player-2"

function stubState(id: string, overrides?: Partial<GameState>): GameState {
  return {
    id,
    players: {},
    currentTurn: 1,
    activePlayer: P1,
    playerOrder: [P1, P2],
    phase: "DRAW",
    combatState: null,
    resolutionContext: null,
    pendingTriggers: [],
    endTriggersPopulated: false,
    winner: null,
    events: [],
    deckSize: 55,
    ...overrides,
  } as unknown as GameState
}

beforeEach(() => {
  evictCachedState(GAME_A)
  evictCachedState(GAME_B)
})

// ─── getGameCache ────────────────────────────────────────────────────────────

describe("getGameCache", () => {
  it("returns null for uncached game", () => {
    expect(getGameCache("nonexistent")).toBeNull()
  })

  it("returns state, sequence, and playerIds after set", () => {
    const state = stubState(GAME_A)
    setCachedState(GAME_A, state, 5, { playerIds: [P1, P2], seed: 42, stateSnapshot: null })

    const hit = getGameCache(GAME_A)
    expect(hit).not.toBeNull()
    expect(hit!.state).toBe(state)
    expect(hit!.sequence).toBe(5)
    expect(hit!.playerIds).toEqual([P1, P2])
  })

  it("returns null after eviction", () => {
    setCachedState(GAME_A, stubState(GAME_A), 0, {
      playerIds: [P1],
      seed: 1,
      stateSnapshot: null,
    })
    evictCachedState(GAME_A)
    expect(getGameCache(GAME_A)).toBeNull()
  })
})

// ─── setCachedState ──────────────────────────────────────────────────────────

describe("setCachedState", () => {
  it("updates state and sequence for existing entry", () => {
    const state1 = stubState(GAME_A)
    const state2 = stubState(GAME_A, { currentTurn: 2 })
    setCachedState(GAME_A, state1, 0, { playerIds: [P1, P2], seed: 42, stateSnapshot: null })
    setCachedState(GAME_A, state2, 3)

    const hit = getGameCache(GAME_A)
    expect(hit!.state).toBe(state2)
    expect(hit!.sequence).toBe(3)
    // playerIds preserved from initial set
    expect(hit!.playerIds).toEqual([P1, P2])
  })

  it("preserves meta from initial set when updating without meta", () => {
    setCachedState(GAME_A, stubState(GAME_A), 0, {
      playerIds: [P1, P2],
      seed: 99,
      stateSnapshot: stubState(GAME_A),
    })
    setCachedState(GAME_A, stubState(GAME_A, { currentTurn: 5 }), 4)

    const meta = getCachedMeta(GAME_A)
    expect(meta).not.toBeNull()
    expect(meta!.seed).toBe(99)
    expect(meta!.stateSnapshot).not.toBeNull()
  })

  it("isolates different game IDs", () => {
    setCachedState(GAME_A, stubState(GAME_A), 1, {
      playerIds: [P1],
      seed: 1,
      stateSnapshot: null,
    })
    setCachedState(GAME_B, stubState(GAME_B), 2, {
      playerIds: [P2],
      seed: 2,
      stateSnapshot: null,
    })

    expect(getGameCache(GAME_A)!.sequence).toBe(1)
    expect(getGameCache(GAME_B)!.sequence).toBe(2)
    expect(getGameCache(GAME_A)!.playerIds).toEqual([P1])
    expect(getGameCache(GAME_B)!.playerIds).toEqual([P2])
  })
})

// ─── getCachedMeta ───────────────────────────────────────────────────────────

describe("getCachedMeta", () => {
  it("returns null for uncached game", () => {
    expect(getCachedMeta("nonexistent")).toBeNull()
  })

  it("returns seed and stateSnapshot", () => {
    const snapshot = stubState(GAME_A)
    setCachedState(GAME_A, stubState(GAME_A), 0, {
      playerIds: [P1],
      seed: 42,
      stateSnapshot: snapshot,
    })

    const meta = getCachedMeta(GAME_A)
    expect(meta!.seed).toBe(42)
    expect(meta!.stateSnapshot).toBe(snapshot)
  })

  it("returns null stateSnapshot when none provided", () => {
    setCachedState(GAME_A, stubState(GAME_A), 0, {
      playerIds: [P1],
      seed: 1,
      stateSnapshot: null,
    })
    expect(getCachedMeta(GAME_A)!.stateSnapshot).toBeNull()
  })
})

// ─── evictCachedState ────────────────────────────────────────────────────────

describe("evictCachedState", () => {
  it("does not throw for nonexistent game", () => {
    expect(() => evictCachedState("nonexistent")).not.toThrow()
  })

  it("only evicts the targeted game", () => {
    setCachedState(GAME_A, stubState(GAME_A), 0, {
      playerIds: [P1],
      seed: 1,
      stateSnapshot: null,
    })
    setCachedState(GAME_B, stubState(GAME_B), 0, {
      playerIds: [P2],
      seed: 2,
      stateSnapshot: null,
    })

    evictCachedState(GAME_A)
    expect(getGameCache(GAME_A)).toBeNull()
    expect(getGameCache(GAME_B)).not.toBeNull()
  })
})
