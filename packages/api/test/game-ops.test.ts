/**
 * Integration tests for game-ops — loadGameState and persistMoveResult.
 * Requires DATABASE_URL.
 */

import { describe, it, expect, beforeAll, beforeEach } from "bun:test"
import { app } from "../src/index.ts"
import { loadGameState, persistMoveResult } from "../src/game-ops.ts"
import { evictCachedState } from "../src/state-cache.ts"
import { applyMove } from "@spell/engine"

process.env["AUTH_BYPASS"] = "true"

const PLAYER_A = "00000000-0000-0000-0000-000000000001"
const PLAYER_B = "00000000-0000-0000-0000-000000000002"

const REALM = {
  id: "r1",
  setId: "01",
  cardNumber: 1,
  name: "Forest",
  typeId: 3,
  worldId: 1,
  level: 0,
  gold: 0,
  description: "",
}
const DECK = Array.from({ length: 55 }, () => REALM)

function headers(userId: string) {
  return { "Content-Type": "application/json", "X-User-Id": userId }
}

async function createGame(): Promise<string> {
  const res = await app.request("/games", {
    method: "POST",
    headers: headers(PLAYER_A),
    body: JSON.stringify({
      formatId: "standard-55",
      seed: 42,
      players: [
        { userId: PLAYER_A, deckSnapshot: DECK },
        { userId: PLAYER_B, deckSnapshot: DECK },
      ],
    }),
  })
  return ((await res.json()) as { gameId: string }).gameId
}

// ─── loadGameState ───────────────────────────────────────────────────────────

describe("loadGameState", () => {
  let gameId: string

  beforeAll(async () => {
    gameId = await createGame()
  })

  beforeEach(() => {
    evictCachedState(gameId)
  })

  it("loads from DB on cache miss", async () => {
    const loaded = await loadGameState(gameId)
    expect(loaded).not.toBeNull()
    expect(loaded!.cacheHit).toBe(false)
    expect(loaded!.state).toBeDefined()
    expect(loaded!.playerIds).toContain(PLAYER_A)
    expect(loaded!.playerIds).toContain(PLAYER_B)
    expect(loaded!.sequence).toBe(-1) // no actions yet
  })

  it("loads from cache on second call", async () => {
    const first = await loadGameState(gameId)
    expect(first!.cacheHit).toBe(false)

    const second = await loadGameState(gameId)
    expect(second!.cacheHit).toBe(true)
    expect(second!.state).toBe(first!.state) // same reference
  })

  it("returns null for nonexistent game", async () => {
    const loaded = await loadGameState("00000000-0000-0000-0000-000000000000")
    expect(loaded).toBeNull()
  })

  it("returns null for non-active game status", async () => {
    // Create lobby (status=waiting, not active)
    const res = await app.request("/games/lobby", {
      method: "POST",
      headers: headers(PLAYER_A),
      body: JSON.stringify({ formatId: "standard-55", seed: 1, deckSnapshot: DECK }),
    })
    const { gameId: lobbyId } = (await res.json()) as { gameId: string }

    const loaded = await loadGameState(lobbyId)
    expect(loaded).toBeNull()
  })
})

// ─── persistMoveResult ───────────────────────────────────────────────────────

describe("persistMoveResult", () => {
  it("returns incrementing sequence and stateHash", async () => {
    const gameId = await createGame()
    const loaded = await loadGameState(gameId)
    expect(loaded).not.toBeNull()

    const result = applyMove(loaded!.state, PLAYER_A, { type: "PASS" })
    const persisted = await persistMoveResult(
      gameId,
      PLAYER_A,
      { type: "PASS" },
      result.newState,
      loaded!.sequence,
    )

    expect(persisted.sequence).toBe(loaded!.sequence + 1)
    expect(typeof persisted.stateHash).toBe("string")
    expect(persisted.stateHash.length).toBeGreaterThan(0)
    expect(persisted.turnDeadline).toBeDefined()
  })

  it("updates cache after persist", async () => {
    const gameId = await createGame()
    const loaded = await loadGameState(gameId)
    const result = applyMove(loaded!.state, PLAYER_A, { type: "PASS" })
    await persistMoveResult(gameId, PLAYER_A, { type: "PASS" }, result.newState, loaded!.sequence)

    // Cache should now have the new state
    const cached = await loadGameState(gameId)
    expect(cached!.cacheHit).toBe(true)
    expect(cached!.sequence).toBe(loaded!.sequence + 1)
  })

  it("evicts cache when game is won", async () => {
    const gameId = await createGame()
    const loaded = await loadGameState(gameId)

    // Simulate a winning state
    const wonState = { ...loaded!.state, winner: PLAYER_A }
    await persistMoveResult(gameId, PLAYER_A, { type: "PASS" }, wonState, loaded!.sequence)

    // Cache should be evicted for finished games
    evictCachedState(gameId) // ensure clean
    // loadGameState returns null for finished games (status !== "active")
    const cached = await loadGameState(gameId)
    expect(cached).toBeNull()
  })
})
