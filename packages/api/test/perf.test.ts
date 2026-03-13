/**
 * Performance benchmarks for the API layer (reconstruction, serialization, e2e move).
 *
 * Requires DATABASE_URL to be set (run via `bun test` which loads ../../.env).
 *
 * Run with a label:
 *   PERF_LABEL=baseline bun test --filter perf
 *
 * Results are written to benchmarks/{date}_{label}.json at the project root (merged with engine results).
 */

import { describe, it, expect, beforeAll } from "bun:test"
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs"
import { resolve } from "path"
import { app } from "../src/index.ts"
import { reconstructState, saveAction, hashState, createGame, getGamePlayers } from "@spell/db"
import type { CardData } from "@spell/engine"
import { initGame, applyMove, getLegalMoves } from "@spell/engine"
import type { GameState, Move } from "@spell/engine"
import { serializeGameState } from "../src/serialize.ts"

process.env["AUTH_BYPASS"] = "true"

// ─── Minimal deck ─────────────────────────────────────────────────────────────

const REALM: CardData = {
  setId: "01",
  cardNumber: 1,
  name: "Forest",
  typeId: 13,
  worldId: 1,
  isAvatar: false,
  level: null,
  description: "",
  attributes: [],
  supportIds: [],
  effects: [],
}

const CHAMPION: CardData = {
  setId: "01",
  cardNumber: 2,
  name: "Hero",
  typeId: 7,
  worldId: 0,
  isAvatar: false,
  level: 5,
  description: "",
  attributes: [],
  supportIds: [],
  effects: [],
}

const DECK: CardData[] = [
  ...Array.from({ length: 22 }, () => REALM),
  ...Array.from({ length: 33 }, () => CHAMPION),
]

const PLAYER_A = "00000000-0000-0000-0000-000000000001"
const PLAYER_B = "00000000-0000-0000-0000-000000000002"
const SEED = 99

function headers(userId: string) {
  return { "Content-Type": "application/json", "X-User-Id": userId }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Play N moves in memory and return the list of (playerId, move, stateHash) tuples. */
function generateMoves(
  gameId: string,
  count: number,
  deckA: CardData[],
  deckB: CardData[],
): Array<{ playerId: string; move: Move; stateHash: string }> {
  let state = initGame({
    gameId,
    seed: SEED,
    players: [
      { id: PLAYER_A, deckCards: deckA },
      { id: PLAYER_B, deckCards: deckB },
    ],
  })

  const actions: Array<{ playerId: string; move: Move; stateHash: string }> = []

  for (let i = 0; i < count && !state.winner; i++) {
    const playerId = state.activePlayer
    const moves = getLegalMoves(state, playerId)
    if (moves.length === 0) break

    const move: Move = moves.find((m) => m.type === "PASS") ?? moves[0]!
    try {
      const result = applyMove(state, playerId, move)
      state = result.newState
      actions.push({ playerId, move, stateHash: hashState(state) })
    } catch {
      break
    }
  }

  return actions
}

/** Creates a game in DB directly (bypasses HTTP overhead) and saves N pre-computed actions. */
async function setupBenchmarkGame(actionCount: number): Promise<{ gameId: string; seed: number }> {
  const game = await createGame({
    formatId: "standard-55",
    seed: SEED,
    players: [
      { userId: PLAYER_A, seatPosition: 0, deckSnapshot: DECK },
      { userId: PLAYER_B, seatPosition: 1, deckSnapshot: DECK },
    ],
  })

  // Read decks back from DB so generateMoves uses the exact same data as reconstructState
  const gamePlayers = await getGamePlayers(game.id)
  const sorted = [...gamePlayers].sort((a, b) => a.seatPosition - b.seatPosition)
  const deckA = sorted[0]!.deckSnapshot as CardData[]
  const deckB = sorted[1]!.deckSnapshot as CardData[]

  const actions = generateMoves(game.id, actionCount, deckA, deckB)
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i]!
    await saveAction({
      gameId: game.id,
      sequence: i,
      playerId: a.playerId,
      move: a.move,
      stateHash: a.stateHash,
    })
  }

  return { gameId: game.id, seed: game.seed }
}

// ─── Results accumulator ──────────────────────────────────────────────────────

const results: Record<string, number> = {}

function record(key: string, value: number) {
  results[key] = +value.toFixed(3)
}

// ─── Benchmarks ───────────────────────────────────────────────────────────────

describe("perf: reconstruction scaling", () => {
  let game50: { gameId: string; seed: number }
  let game100: { gameId: string; seed: number }
  let game200: { gameId: string; seed: number }

  beforeAll(async () => {
    // Set up games in parallel to save setup time
    ;[game50, game100, game200] = await Promise.all([
      setupBenchmarkGame(50),
      setupBenchmarkGame(100),
      setupBenchmarkGame(200),
    ])
  })

  it("reconstructs a game with ~50 actions", async () => {
    const t0 = performance.now()
    const { state, errors } = await reconstructState(game50.gameId, game50.seed)
    const elapsed = performance.now() - t0

    record("reconstruct_50_actions_ms", elapsed)
    record("reconstruct_50_actions_events", state.events?.length ?? 0)
    console.log(`[perf] reconstruct 50 actions: ${elapsed.toFixed(2)}ms (${errors.length} errors)`)

    // Regression guard: 50 actions should reconstruct in under 2 seconds locally
    expect(elapsed).toBeLessThan(2000)
  })

  it("reconstructs a game with ~100 actions", async () => {
    const t0 = performance.now()
    const { state, errors } = await reconstructState(game100.gameId, game100.seed)
    const elapsed = performance.now() - t0

    record("reconstruct_100_actions_ms", elapsed)
    record("reconstruct_100_actions_events", state.events?.length ?? 0)
    console.log(`[perf] reconstruct 100 actions: ${elapsed.toFixed(2)}ms (${errors.length} errors)`)

    expect(elapsed).toBeLessThan(5000)
  })

  it("reconstructs a game with ~200 actions", async () => {
    const t0 = performance.now()
    const { state, errors } = await reconstructState(game200.gameId, game200.seed)
    const elapsed = performance.now() - t0

    record("reconstruct_200_actions_ms", elapsed)
    record("reconstruct_200_actions_events", state.events?.length ?? 0)
    console.log(`[perf] reconstruct 200 actions: ${elapsed.toFixed(2)}ms (${errors.length} errors)`)

    expect(elapsed).toBeLessThan(15000)
  })
})

describe("perf: serialization size", () => {
  let midGameState: GameState

  beforeAll(async () => {
    const { gameId, seed } = await setupBenchmarkGame(30)
    const { state } = await reconstructState(gameId, seed)
    midGameState = state
  })

  it("serializes mid-game state for player A and checks payload size", () => {
    const t0 = performance.now()
    const serialized = serializeGameState(midGameState, { status: "active" }, PLAYER_A)
    const elapsed = performance.now() - t0
    const bytes = Buffer.byteLength(JSON.stringify(serialized), "utf8")

    record("serialize_playerA_ms", elapsed)
    record("serialize_payload_bytes_playerA", bytes)
    console.log(`[perf] serialize playerA: ${bytes} bytes in ${elapsed.toFixed(2)}ms`)

    // Regression guard: under 50KB per player
    expect(bytes).toBeLessThan(50_000)
  })

  it("serializes mid-game state for player B and checks payload size", () => {
    const t0 = performance.now()
    const serialized = serializeGameState(midGameState, { status: "active" }, PLAYER_B)
    const elapsed = performance.now() - t0
    const bytes = Buffer.byteLength(JSON.stringify(serialized), "utf8")

    record("serialize_playerB_ms", elapsed)
    record("serialize_payload_bytes_playerB", bytes)
    console.log(`[perf] serialize playerB: ${bytes} bytes in ${elapsed.toFixed(2)}ms`)

    expect(bytes).toBeLessThan(50_000)
  })
})

describe("perf: end-to-end move via HTTP", () => {
  let gameId: string

  beforeAll(async () => {
    const res = await app.request("/games", {
      method: "POST",
      headers: headers(PLAYER_A),
      body: JSON.stringify({
        formatId: "standard-55",
        seed: SEED,
        players: [
          { userId: PLAYER_A, deckSnapshot: DECK },
          { userId: PLAYER_B, deckSnapshot: DECK },
        ],
      }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { gameId: string }
    gameId = body.gameId
  })

  it("move 1 — cold cache (full reconstruction)", async () => {
    const t0 = performance.now()
    const res = await app.request(`/games/${gameId}/moves`, {
      method: "POST",
      headers: headers(PLAYER_A),
      body: JSON.stringify({ type: "PASS" }),
    })
    const elapsed = performance.now() - t0

    record("end_to_end_http_move_ms", elapsed)
    record("end_to_end_http_move_status", res.status)
    console.log(
      `[perf] end-to-end HTTP move (cold): ${elapsed.toFixed(2)}ms (status ${res.status})`,
    )

    expect([201, 422]).toContain(res.status)
    expect(elapsed).toBeLessThan(5000)
  })

  it("move 2 — warm cache (no reconstruction)", async () => {
    // Determine whose turn it is after move 1
    const stateRes = await app.request(`/games/${gameId}`, { headers: headers(PLAYER_A) })
    const stateBody = (await stateRes.json()) as { activePlayer: string }
    const activePlayer = stateBody.activePlayer ?? PLAYER_A
    const playerHeader = activePlayer === PLAYER_B ? PLAYER_B : PLAYER_A

    const t0 = performance.now()
    const res = await app.request(`/games/${gameId}/moves`, {
      method: "POST",
      headers: headers(playerHeader),
      body: JSON.stringify({ type: "PASS" }),
    })
    const elapsed = performance.now() - t0

    record("end_to_end_http_move_cached_ms", elapsed)
    console.log(
      `[perf] end-to-end HTTP move (warm cache): ${elapsed.toFixed(2)}ms (status ${res.status})`,
    )

    expect([201, 422]).toContain(res.status)
    expect(elapsed).toBeLessThan(5000)
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
      api: results,
    }

    writeFileSync(filePath, JSON.stringify(output, null, 2))
    console.log(`[perf] results written to ${filePath}`)
    expect(Object.keys(results).length).toBeGreaterThan(0)
  })
})
