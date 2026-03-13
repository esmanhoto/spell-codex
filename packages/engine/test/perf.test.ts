/**
 * Performance benchmarks for the game engine.
 *
 * These are not correctness tests — they measure timing and fail only if a
 * hard threshold is exceeded (regression guard).
 *
 * Run with a label:
 *   PERF_LABEL=baseline bun test --filter perf
 *
 * Results are written to benchmarks/{date}_{label}.json at the project root (merged with API results).
 */

import { describe, it, expect } from "bun:test"
import { createHash } from "crypto"
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs"
import { resolve } from "path"
import { initGame, applyMove, getLegalMoves } from "../src/index.ts"
import type { GameState, Move } from "../src/types.ts"
import { DEFAULT_CONFIG, DECK_P1, DECK_P2 } from "./fixtures.ts"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hashGameState(state: GameState): string {
  return createHash("sha256").update(JSON.stringify(state)).digest("hex")
}

/** Play up to maxMoves moves using the first available legal move each turn. */
function playGame(maxMoves: number): { state: GameState; moveCount: number } {
  let state = initGame(DEFAULT_CONFIG)
  let moveCount = 0

  while (moveCount < maxMoves && !state.winner) {
    const moves = getLegalMoves(state, state.activePlayer)
    if (moves.length === 0) break

    // Prefer PASS to keep things simple and fast
    const move: Move = moves.find((m) => m.type === "PASS") ?? moves[0]!
    try {
      const result = applyMove(state, state.activePlayer, move)
      state = result.newState
      moveCount++
    } catch {
      break
    }
  }

  return { state, moveCount }
}

/** Build a state with a specific number of events by playing moves. */
function buildStateWithMoves(targetMoves: number): GameState {
  return playGame(targetMoves).state
}

// ─── Results accumulator ──────────────────────────────────────────────────────

const results: Record<string, number> = {}

function record(key: string, value: number) {
  results[key] = +value.toFixed(3)
}

// ─── Benchmarks ───────────────────────────────────────────────────────────────

describe("perf: applyMove throughput", () => {
  it("plays 100 moves and measures total and per-move time", () => {
    const t0 = performance.now()
    const { moveCount } = playGame(100)
    const elapsed = performance.now() - t0

    record("applyMove_moves_played", moveCount)
    record("applyMove_total_ms", elapsed)
    record("applyMove_per_move_avg_ms", moveCount > 0 ? elapsed / moveCount : 0)

    console.log(
      `[perf] applyMove: ${moveCount} moves in ${elapsed.toFixed(2)}ms (${(elapsed / Math.max(moveCount, 1)).toFixed(3)}ms/move)`,
    )

    // Regression guard: 100 moves should complete within 5 seconds locally
    expect(elapsed).toBeLessThan(5000)
  })
})

describe("perf: getLegalMoves scaling", () => {
  it("measures getLegalMoves on initial state (empty board)", () => {
    const state = initGame(DEFAULT_CONFIG)
    const t0 = performance.now()
    const moves = getLegalMoves(state, state.activePlayer)
    const elapsed = performance.now() - t0

    record("getLegalMoves_initial_ms", elapsed)
    record("getLegalMoves_initial_count", moves.length)
    console.log(`[perf] getLegalMoves initial: ${moves.length} moves in ${elapsed.toFixed(3)}ms`)

    expect(elapsed).toBeLessThan(100)
  })

  it("measures getLegalMoves after 20 moves (early game)", () => {
    const state = buildStateWithMoves(20)
    const t0 = performance.now()
    const moves = getLegalMoves(state, state.activePlayer)
    const elapsed = performance.now() - t0

    record("getLegalMoves_20moves_ms", elapsed)
    record("getLegalMoves_20moves_count", moves.length)
    console.log(`[perf] getLegalMoves 20 moves: ${moves.length} moves in ${elapsed.toFixed(3)}ms`)

    expect(elapsed).toBeLessThan(100)
  })

  it("measures getLegalMoves after 60 moves (mid game)", () => {
    const state = buildStateWithMoves(60)
    const t0 = performance.now()
    const moves = getLegalMoves(state, state.activePlayer)
    const elapsed = performance.now() - t0

    record("getLegalMoves_60moves_ms", elapsed)
    record("getLegalMoves_60moves_count", moves.length)
    console.log(`[perf] getLegalMoves 60 moves: ${moves.length} moves in ${elapsed.toFixed(3)}ms`)

    expect(elapsed).toBeLessThan(200)
  })
})

describe("perf: hashState scaling", () => {
  it("measures hashState on state with few events (10 moves)", () => {
    const state = buildStateWithMoves(10)
    const eventCount = state.events?.length ?? 0

    const t0 = performance.now()
    hashGameState(state)
    const elapsed = performance.now() - t0

    record("hashState_10moves_events", eventCount)
    record("hashState_10moves_ms", elapsed)
    console.log(`[perf] hashState 10 moves (${eventCount} events): ${elapsed.toFixed(3)}ms`)

    expect(elapsed).toBeLessThan(50)
  })

  it("measures hashState on state with more events (50 moves)", () => {
    const state = buildStateWithMoves(50)
    const eventCount = state.events?.length ?? 0

    const t0 = performance.now()
    hashGameState(state)
    const elapsed = performance.now() - t0

    record("hashState_50moves_events", eventCount)
    record("hashState_50moves_ms", elapsed)
    console.log(`[perf] hashState 50 moves (${eventCount} events): ${elapsed.toFixed(3)}ms`)

    expect(elapsed).toBeLessThan(100)
  })

  it("measures hashState on state with many events (100 moves)", () => {
    const state = buildStateWithMoves(100)
    const eventCount = state.events?.length ?? 0

    const t0 = performance.now()
    hashGameState(state)
    const elapsed = performance.now() - t0

    record("hashState_100moves_events", eventCount)
    record("hashState_100moves_ms", elapsed)
    console.log(`[perf] hashState 100 moves (${eventCount} events): ${elapsed.toFixed(3)}ms`)

    expect(elapsed).toBeLessThan(200)
  })
})

describe("perf: initGame cost", () => {
  it("measures initGame with a 55-card deck", () => {
    const t0 = performance.now()
    initGame({
      gameId: "bench-init",
      players: [
        { id: "p1", deckCards: DECK_P1 },
        { id: "p2", deckCards: DECK_P2 },
      ],
      seed: 99,
      formationSize: 6,
    })
    const elapsed = performance.now() - t0

    record("initGame_ms", elapsed)
    console.log(`[perf] initGame: ${elapsed.toFixed(3)}ms`)

    expect(elapsed).toBeLessThan(500)
  })
})

// ─── Write benchmark results ──────────────────────────────────────────────────

describe("perf: write results", () => {
  it("writes benchmark results to benchmarks/ directory", () => {
    const label = process.env["PERF_LABEL"] ?? "local"
    const date = new Date().toISOString().slice(0, 10)
    const benchDir = resolve(import.meta.dir, "../../../benchmarks")
    const filePath = resolve(benchDir, `${date}_${label}.json`)

    if (!existsSync(benchDir)) {
      mkdirSync(benchDir, { recursive: true })
    }

    // Merge with existing file if present (for incremental runs)
    let existing: Record<string, unknown> = {}
    if (existsSync(filePath)) {
      try {
        existing = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>
      } catch {
        // ignore parse errors — overwrite
      }
    }

    const output = {
      ...existing,
      label,
      date,
      engine: results,
    }

    writeFileSync(filePath, JSON.stringify(output, null, 2))
    console.log(`[perf] results written to ${filePath}`)
    expect(Object.keys(results).length).toBeGreaterThan(0)
  })
})
