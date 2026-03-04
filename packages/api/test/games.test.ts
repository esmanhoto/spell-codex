/**
 * Integration tests for the games + moves API.
 *
 * Requires DATABASE_URL to be set (run via `bun test` which loads ../../.env).
 * Each test suite creates its own isolated game so tests can run in any order.
 */

import { describe, it, expect, beforeAll } from "bun:test"
import { app } from "../src/index.ts"

process.env["AUTH_BYPASS"] = "true"

// ─── Minimal deck (55 realm cards) ───────────────────────────────────────────

const REALM = {
  id: "r1", setId: "01", cardNumber: 1, name: "Forest",
  typeId: 3, worldId: 1, level: 0, gold: 0, description: "",
}
const DECK = Array.from({ length: 55 }, () => REALM)

const PLAYER_A = "00000000-0000-0000-0000-000000000001"
const PLAYER_B = "00000000-0000-0000-0000-000000000002"

function headers(userId: string) {
  return { "Content-Type": "application/json", "X-User-Id": userId }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createGame() {
  const res = await app.request("/games", {
    method:  "POST",
    headers: headers(PLAYER_A),
    body: JSON.stringify({
      formatId: "standard-55",
      seed:     42,
      players: [
        { userId: PLAYER_A, deckSnapshot: DECK },
        { userId: PLAYER_B, deckSnapshot: DECK },
      ],
    }),
  })
  expect(res.status).toBe(201)
  const body = await res.json() as { gameId: string }
  return body.gameId
}

async function createLobbyGame() {
  const res = await app.request("/games/lobby", {
    method: "POST",
    headers: headers(PLAYER_A),
    body: JSON.stringify({
      formatId: "standard-55",
      seed: 42,
      deckSnapshot: DECK,
    }),
  })
  expect(res.status).toBe(201)
  const body = await res.json() as { gameId: string }
  return body.gameId
}

// ─── Health ───────────────────────────────────────────────────────────────────

describe("GET /health", () => {
  it("returns 200 ok", async () => {
    const res = await app.request("/health")
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })
})

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe("auth middleware", () => {
  it("rejects requests without X-User-Id", async () => {
    const res = await app.request("/games", { method: "POST" })
    expect(res.status).toBe(401)
  })
})

// ─── Create game ──────────────────────────────────────────────────────────────

describe("POST /games", () => {
  it("creates a game and returns a gameId", async () => {
    const gameId = await createGame()
    expect(gameId).toBeString()
    expect(gameId).toHaveLength(36) // UUID
  })

  it("rejects invalid body", async () => {
    const res = await app.request("/games", {
      method:  "POST",
      headers: headers(PLAYER_A),
      body:    JSON.stringify({ formatId: "x" }), // missing players + seed
    })
    expect(res.status).toBe(400)
  })
})

// ─── Get game ─────────────────────────────────────────────────────────────────

describe("GET /games/:id", () => {
  let gameId: string
  beforeAll(async () => { gameId = await createGame() })

  it("returns game state for a participant", async () => {
    const res = await app.request(`/games/${gameId}`, {
      headers: headers(PLAYER_A),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.gameId).toBe(gameId)
    expect(body.phase).toBeString()
    expect(body.playMode).toBe("full_manual")
    expect(Array.isArray(body.legalMoves)).toBe(true)
  })

  it("returns 403 for a non-participant", async () => {
    const outsider = "00000000-0000-0000-0000-000000000099"
    const res = await app.request(`/games/${gameId}`, {
      headers: headers(outsider),
    })
    expect(res.status).toBe(403)
  })

  it("returns 404 for unknown game", async () => {
    const res = await app.request("/games/00000000-0000-0000-0000-000000000000", {
      headers: headers(PLAYER_A),
    })
    expect(res.status).toBe(404)
  })

  it("returns 409 while waiting for opponent", async () => {
    const gameId = await createLobbyGame()
    const res = await app.request(`/games/${gameId}`, {
      headers: headers(PLAYER_A),
    })
    expect(res.status).toBe(409)
  })
})

describe("lobby flow", () => {
  it("creates waiting lobby, joins by game id, then becomes active", async () => {
    const gameId = await createLobbyGame()

    const lobbyRes = await app.request(`/games/${gameId}/lobby`, {
      headers: headers(PLAYER_A),
    })
    expect(lobbyRes.status).toBe(200)
    const lobby = await lobbyRes.json() as { status: string; playerCount: number; isFull: boolean }
    expect(lobby.status).toBe("waiting")
    expect(lobby.playerCount).toBe(1)
    expect(lobby.isFull).toBe(false)

    const joinRes = await app.request(`/games/${gameId}/join`, {
      method: "POST",
      headers: headers(PLAYER_B),
      body: JSON.stringify({ deckSnapshot: DECK }),
    })
    expect(joinRes.status).toBe(200)
    const join = await joinRes.json() as { status: string; playerCount: number; joined: boolean }
    expect(join.joined).toBe(true)
    expect(join.status).toBe("active")
    expect(join.playerCount).toBe(2)

    const stateRes = await app.request(`/games/${gameId}`, {
      headers: headers(PLAYER_A),
    })
    expect(stateRes.status).toBe(200)
  })

  it("rejects third player when game is full", async () => {
    const gameId = await createLobbyGame()
    const joinB = await app.request(`/games/${gameId}/join`, {
      method: "POST",
      headers: headers(PLAYER_B),
      body: JSON.stringify({ deckSnapshot: DECK }),
    })
    expect(joinB.status).toBe(200)

    const joinC = await app.request(`/games/${gameId}/join`, {
      method: "POST",
      headers: headers("00000000-0000-0000-0000-000000000003"),
      body: JSON.stringify({ deckSnapshot: DECK }),
    })
    expect(joinC.status).toBe(409)
  })
})

// ─── Submit move ──────────────────────────────────────────────────────────────

describe("POST /games/:id/moves", () => {
  let gameId: string
  beforeAll(async () => { gameId = await createGame() })

  it("accepts a valid PASS move from the active player", async () => {
    const res = await app.request(`/games/${gameId}/moves`, {
      method:  "POST",
      headers: headers(PLAYER_A),
      body:    JSON.stringify({ type: "PASS" }),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    expect(body.sequence).toBe(0)
    expect(body.phase).toBeString()
  })

  it("rejects a move from the wrong player", async () => {
    const res = await app.request(`/games/${gameId}/moves`, {
      method:  "POST",
      headers: headers(PLAYER_B), // not the active player
      body:    JSON.stringify({ type: "PASS" }),
    })
    expect(res.status).toBe(422)
    const body = await res.json() as { code?: string }
    expect(body.code).toBe("NOT_YOUR_TURN")
  })

  it("accepts out-of-turn mode switch from a participant", async () => {
    const res = await app.request(`/games/${gameId}/moves`, {
      method: "POST",
      headers: headers(PLAYER_B),
      body: JSON.stringify({ type: "SET_PLAY_MODE", mode: "semi_auto" }),
    })
    expect(res.status).toBe(201)

    const stateRes = await app.request(`/games/${gameId}`, {
      headers: headers(PLAYER_A),
    })
    expect(stateRes.status).toBe(200)
    const state = await stateRes.json() as { playMode: string }
    expect(state.playMode).toBe("semi_auto")
  })

  it("still rejects move submission from non-participants", async () => {
    const outsider = "00000000-0000-0000-0000-000000000099"
    const res = await app.request(`/games/${gameId}/moves`, {
      method: "POST",
      headers: headers(outsider),
      body: JSON.stringify({ type: "SET_PLAY_MODE", mode: "full_manual" }),
    })
    expect(res.status).toBe(403)
  })

  it("rejects an invalid move type", async () => {
    const res = await app.request(`/games/${gameId}/moves`, {
      method:  "POST",
      headers: headers(PLAYER_A),
      body:    JSON.stringify({ type: "EXPLODE_EVERYTHING" }),
    })
    expect(res.status).toBe(422)
    const body = await res.json() as { code?: string }
    expect(body.code).toBe("UNKNOWN_MOVE")
  })
})
