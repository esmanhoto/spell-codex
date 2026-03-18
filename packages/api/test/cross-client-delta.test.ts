/**
 * Phase 6b — Client delta pipeline integration test.
 * Covers: web + engine hash parity + client serialization.
 * Verifies: DB hashState === web hashEngineState, and that
 * serializeEngineStateForClient produces correct shape from engine state.
 * Requires DATABASE_URL.
 */

import { describe, it, expect, beforeAll } from "bun:test"
import { app } from "../src/index.ts"
import { evictCachedState } from "../src/state-cache.ts"
import { loadGameState } from "../src/game-ops.ts"
import { hashState } from "@spell/db"
import { applyMove, getLegalMoves } from "@spell/engine"
import type { GameState } from "@spell/engine"
import { hashEngineState } from "../../web/src/utils/state-hash.ts"
import { serializeEngineStateForClient } from "../../web/src/utils/client-serialize.ts"

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

async function createGame(seed = 42): Promise<string> {
  const res = await app.request("/games", {
    method: "POST",
    headers: headers(PLAYER_A),
    body: JSON.stringify({
      formatId: "standard-55",
      seed,
      players: [
        { userId: PLAYER_A, deckSnapshot: DECK },
        { userId: PLAYER_B, deckSnapshot: DECK },
      ],
    }),
  })
  return ((await res.json()) as { gameId: string }).gameId
}

// ─── Hash parity ─────────────────────────────────────────────────────────────

describe("Hash parity (db hashState vs web hashEngineState)", () => {
  let initialState: GameState

  beforeAll(async () => {
    const gameId = await createGame(800)
    evictCachedState(gameId)
    const loaded = await loadGameState(gameId)
    initialState = loaded!.state
  })

  it("initial state: DB and web hash match", async () => {
    const dbHash = hashState(initialState)
    const webHash = await hashEngineState(initialState)
    expect(webHash).toBe(dbHash)
  })

  it("after move: DB and web hash match", async () => {
    const result = applyMove(initialState, PLAYER_A, { type: "PASS" })
    const dbHash = hashState(result.newState)
    const webHash = await hashEngineState(result.newState)
    expect(webHash).toBe(dbHash)
  })
})

// ─── Client serialization shape ──────────────────────────────────────────────

describe("Client serialization from engine state", () => {
  let engineState: GameState

  beforeAll(async () => {
    const gameId = await createGame(801)
    evictCachedState(gameId)
    const loaded = await loadGameState(gameId)
    engineState = loaded!.state
  })

  it("produces correct top-level fields", () => {
    const client = serializeEngineStateForClient(engineState, PLAYER_A, {
      status: "active",
      turnDeadline: new Date().toISOString(),
      winner: null,
      sequence: 0,
    })

    expect(client.gameId).toBe(engineState.id)
    expect(client.viewerPlayerId).toBe(PLAYER_A)
    expect(client.status).toBe("active")
    expect(client.phase).toBe(engineState.phase)
    expect(client.activePlayer).toBe(engineState.activePlayer)
    expect(client.turnNumber).toBe(engineState.currentTurn)
    expect(client.winner).toBeNull()
    expect(Array.isArray(client.playerOrder)).toBe(true)
    expect(Array.isArray(client.legalMoves)).toBe(true)
    expect(Array.isArray(client.events)).toBe(true)
  })

  it("hides opponent hand from viewer", () => {
    const client = serializeEngineStateForClient(engineState, PLAYER_A, {
      status: "active",
      turnDeadline: null,
      winner: null,
    })

    const board = client.board as {
      players: Record<string, { hand: unknown[]; handHidden: boolean; handCount: number }>
    }
    // Viewer sees their own hand
    expect(board.players[PLAYER_A]!.handHidden).toBe(false)
    expect(board.players[PLAYER_A]!.hand.length).toBeGreaterThan(0)

    // Opponent hand is hidden
    expect(board.players[PLAYER_B]!.handHidden).toBe(true)
    expect(board.players[PLAYER_B]!.hand.length).toBe(0)
    expect(board.players[PLAYER_B]!.handCount).toBeGreaterThan(0)
  })

  it("legal moves match engine getLegalMoves for viewer", () => {
    const client = serializeEngineStateForClient(engineState, PLAYER_A, {
      status: "active",
      turnDeadline: null,
      winner: null,
    })

    const engineMoves = getLegalMoves(engineState, PLAYER_A)
    expect(client.legalMoves).toEqual(engineMoves)
    expect(client.legalMovesPerPlayer![PLAYER_A]).toEqual(engineMoves)
  })

  it("serializes from opponent perspective differently", () => {
    const clientA = serializeEngineStateForClient(engineState, PLAYER_A, {
      status: "active",
      turnDeadline: null,
      winner: null,
    })
    const clientB = serializeEngineStateForClient(engineState, PLAYER_B, {
      status: "active",
      turnDeadline: null,
      winner: null,
    })

    // Different viewer, different hand visibility
    expect(clientA.viewerPlayerId).toBe(PLAYER_A)
    expect(clientB.viewerPlayerId).toBe(PLAYER_B)

    const boardA = clientA.board as {
      players: Record<string, { handHidden: boolean }>
    }
    const boardB = clientB.board as {
      players: Record<string, { handHidden: boolean }>
    }

    expect(boardA.players[PLAYER_A]!.handHidden).toBe(false)
    expect(boardA.players[PLAYER_B]!.handHidden).toBe(true)
    expect(boardB.players[PLAYER_A]!.handHidden).toBe(true)
    expect(boardB.players[PLAYER_B]!.handHidden).toBe(false)
  })

  it("after move: serialization reflects updated state", () => {
    const result = applyMove(engineState, PLAYER_A, { type: "PASS" })
    const client = serializeEngineStateForClient(result.newState, PLAYER_A, {
      status: "active",
      turnDeadline: null,
      winner: null,
    })

    // Phase should have advanced
    expect(client.phase).toBe(result.newState.phase)
    expect(client.activePlayer).toBe(result.newState.activePlayer)
  })
})
