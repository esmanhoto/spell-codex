/**
 * Integration tests for WS game flow — JOIN_GAME, SUBMIT_MOVE, SYNC_REQUEST.
 * Requires DATABASE_URL (run via `bun test` which loads ../../.env).
 */

import { describe, it, expect, beforeAll, beforeEach } from "bun:test"
import type { ServerWebSocket } from "bun"
import { wsHandlers, registry } from "../src/ws.ts"
import { evictCachedState } from "../src/state-cache.ts"
import { app } from "../src/index.ts"

process.env["AUTH_BYPASS"] = "true"

// ─── Mock socket helpers ─────────────────────────────────────────────────────

interface WsData {
  gameId: string | null
  userId: string | null
  displayName: string | null
  lastChatTs: number
}

interface MockSocket extends ServerWebSocket<WsData> {
  received: unknown[]
}

function mockSocket(data?: Partial<WsData>): MockSocket {
  const received: unknown[] = []
  return {
    data: { gameId: null, userId: null, displayName: null, lastChatTs: 0, ...data },
    received,
    send(msg: string | Buffer) {
      received.push(JSON.parse(msg.toString()))
    },
    close() {},
    terminate() {},
    publish() {
      return 0
    },
    subscribe() {},
    unsubscribe() {},
    isSubscribed() {
      return false
    },
    cork() {},
    ping() {
      return 0
    },
    pong() {
      return 0
    },
    remoteAddress: "127.0.0.1",
    readyState: 1 as const,
    binaryType: "arraybuffer" as const,
  } as unknown as MockSocket
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PLAYER_A = "00000000-0000-0000-0000-000000000001"
const PLAYER_B = "00000000-0000-0000-0000-000000000002"
const OUTSIDER = "00000000-0000-0000-0000-000000000099"

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

async function createGame(): Promise<{ gameId: string; slug: string }> {
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
  expect(res.status).toBe(201)
  return (await res.json()) as { gameId: string; slug: string }
}

async function createLobbyGame(): Promise<{ gameId: string; slug: string }> {
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
  return (await res.json()) as { gameId: string; slug: string }
}

async function joinGame(ws: MockSocket, gameId: string, playerId: string): Promise<void> {
  await wsHandlers.message(
    ws as unknown as ServerWebSocket<WsData>,
    JSON.stringify({ type: "JOIN_GAME", gameId, playerId }),
  )
}

function findMsg(ws: MockSocket, type: string): Record<string, unknown> | undefined {
  return ws.received.find((m) => (m as { type: string }).type === type) as
    | Record<string, unknown>
    | undefined
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  registry.clear()
})

// ─── JOIN_GAME ───────────────────────────────────────────────────────────────

describe("JOIN_GAME", () => {
  let gameId: string
  let slug: string

  beforeAll(async () => {
    const game = await createGame()
    gameId = game.gameId
    slug = game.slug
  })

  beforeEach(() => {
    evictCachedState(gameId)
  })

  it("sends STATE_UPDATE with rawEngineState on successful join", async () => {
    const ws = mockSocket()
    await joinGame(ws, gameId, PLAYER_A)

    const msg = findMsg(ws, "STATE_UPDATE")
    expect(msg).toBeDefined()
    expect(msg!["gameId"]).toBe(gameId)
    expect(msg!["rawEngineState"]).toBeDefined()
    expect(typeof msg!["sequence"]).toBe("number")
    expect(msg!["state"]).toBeDefined()
  })

  it("resolves slug to UUID", async () => {
    const ws = mockSocket()
    await joinGame(ws, slug, PLAYER_A)

    const msg = findMsg(ws, "STATE_UPDATE")
    expect(msg).toBeDefined()
    expect(msg!["gameId"]).toBe(gameId)
    // Socket data should contain the resolved UUID, not the slug
    expect(ws.data.gameId).toBe(gameId)
  })

  it("registers socket in registry", async () => {
    const ws = mockSocket()
    await joinGame(ws, gameId, PLAYER_A)

    const players = registry.get(gameId)
    expect(players).toBeDefined()
    expect(players!.get(PLAYER_A)).toBe(ws)
  })

  it("rejects non-participant", async () => {
    const ws = mockSocket()
    await joinGame(ws, gameId, OUTSIDER)

    const err = findMsg(ws, "ERROR") as { code: string }
    expect(err).toBeDefined()
    expect(err.code).toBe("FORBIDDEN")
  })

  it("rejects unknown game", async () => {
    const ws = mockSocket()
    await joinGame(ws, "00000000-0000-0000-0000-000000000000", PLAYER_A)

    const err = findMsg(ws, "ERROR") as { code: string }
    expect(err).toBeDefined()
    expect(err.code).toBe("NOT_FOUND")
  })

  it("rejects waiting game with < 2 players", async () => {
    const lobby = await createLobbyGame()
    const ws = mockSocket()
    await joinGame(ws, lobby.gameId, PLAYER_A)

    const err = findMsg(ws, "ERROR") as { code: string }
    expect(err).toBeDefined()
    expect(err.code).toBe("WAITING_FOR_OPPONENT")
  })

  it("removes socket from previous game on re-join", async () => {
    const game2 = await createGame()
    const ws = mockSocket()

    // Join game 1
    await joinGame(ws, gameId, PLAYER_A)
    expect(registry.get(gameId)?.get(PLAYER_A)).toBe(ws)

    // Join game 2 — should remove from game 1
    await joinGame(ws, game2.gameId, PLAYER_A)
    expect(registry.get(gameId)?.has(PLAYER_A)).toBe(false)
    expect(registry.get(game2.gameId)?.get(PLAYER_A)).toBe(ws)
  })

  it("sets userId and gameId on ws.data after join", async () => {
    const ws = mockSocket()
    await joinGame(ws, gameId, PLAYER_A)

    expect(ws.data.userId).toBe(PLAYER_A)
    expect(ws.data.gameId).toBe(gameId)
  })
})

// ─── SUBMIT_MOVE ─────────────────────────────────────────────────────────────

describe("SUBMIT_MOVE", () => {
  let gameId: string

  beforeAll(async () => {
    const game = await createGame()
    gameId = game.gameId
  })

  it("broadcasts MOVE_APPLIED to all connected players", async () => {
    evictCachedState(gameId)
    const wsA = mockSocket()
    const wsB = mockSocket()

    await joinGame(wsA, gameId, PLAYER_A)
    await joinGame(wsB, gameId, PLAYER_B)
    wsA.received.length = 0
    wsB.received.length = 0

    await wsHandlers.message(
      wsA as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "SUBMIT_MOVE", gameId, move: { type: "PASS" } }),
    )

    const moveA = findMsg(wsA, "MOVE_APPLIED")
    const moveB = findMsg(wsB, "MOVE_APPLIED")
    expect(moveA).toBeDefined()
    expect(moveB).toBeDefined()
    expect(moveA!["playerId"]).toBe(PLAYER_A)
    expect(moveA!["move"]).toEqual({ type: "PASS" })
    expect(typeof moveA!["stateHash"]).toBe("string")
    expect(typeof moveA!["sequence"]).toBe("number")
  })

  it("returns ERROR for invalid move type", async () => {
    evictCachedState(gameId)
    const ws = mockSocket()
    await joinGame(ws, gameId, PLAYER_A)
    ws.received.length = 0

    await wsHandlers.message(
      ws as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "SUBMIT_MOVE", gameId, move: { type: "EXPLODE_EVERYTHING" } }),
    )

    const err = findMsg(ws, "ERROR") as { code: string }
    expect(err).toBeDefined()
    expect(err.code).toBe("UNKNOWN_MOVE")
  })

  it("returns ERROR when wrong player submits move", async () => {
    evictCachedState(gameId)
    const wsA = mockSocket()
    const wsB = mockSocket()
    await joinGame(wsA, gameId, PLAYER_A)
    await joinGame(wsB, gameId, PLAYER_B)
    wsB.received.length = 0

    // Player B tries to move when it's not their turn
    await wsHandlers.message(
      wsB as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "SUBMIT_MOVE", gameId, move: { type: "PASS" } }),
    )

    const err = findMsg(wsB, "ERROR") as { code: string }
    expect(err).toBeDefined()
    expect(err.code).toBe("NOT_YOUR_TURN")
  })

  it("serializes concurrent moves via enqueueMove", async () => {
    // Create a fresh game for this test
    const game = await createGame()
    const ws = mockSocket()
    await joinGame(ws, game.gameId, PLAYER_A)
    ws.received.length = 0

    // Fire two PASS moves concurrently — both should succeed sequentially
    // (first PASS ends draw phase, second PASS may advance further)
    const p1 = wsHandlers.message(
      ws as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "SUBMIT_MOVE", gameId: game.gameId, move: { type: "PASS" } }),
    )
    const p2 = wsHandlers.message(
      ws as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "SUBMIT_MOVE", gameId: game.gameId, move: { type: "PASS" } }),
    )

    await Promise.all([p1, p2])

    // Both should complete without crashing — at least one MOVE_APPLIED
    const moves = ws.received.filter((m) => (m as { type: string }).type === "MOVE_APPLIED")
    expect(moves.length).toBeGreaterThanOrEqual(1)

    // Sequences should be monotonically increasing if both succeeded
    if (moves.length === 2) {
      const seq0 = (moves[0] as { sequence: number }).sequence
      const seq1 = (moves[1] as { sequence: number }).sequence
      expect(seq1).toBeGreaterThan(seq0)
    }
  })
})

// ─── SYNC_REQUEST (integration) ──────────────────────────────────────────────

describe("SYNC_REQUEST (integration)", () => {
  let gameId: string

  beforeAll(async () => {
    const game = await createGame()
    gameId = game.gameId
  })

  it("returns STATE_UPDATE after join populates cache", async () => {
    evictCachedState(gameId)
    const ws = mockSocket()
    await joinGame(ws, gameId, PLAYER_A)
    ws.received.length = 0

    await wsHandlers.message(
      ws as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "SYNC_REQUEST", gameId }),
    )

    const msg = findMsg(ws, "STATE_UPDATE")
    expect(msg).toBeDefined()
    expect(msg!["gameId"]).toBe(gameId)
    expect(msg!["rawEngineState"]).toBeDefined()
  })
})
