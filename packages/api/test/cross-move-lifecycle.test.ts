/**
 * Phase 6a — Full move lifecycle integration test.
 * Covers: api + db + engine end-to-end.
 * Flow: HTTP create → WS join → submit move → DB action persisted →
 *       engine state matches → hash verified → broadcast to all players.
 * Requires DATABASE_URL.
 */

import { describe, it, expect, beforeAll, beforeEach } from "bun:test"
import type { ServerWebSocket } from "bun"
import { wsHandlers, registry } from "../src/ws.ts"
import { evictCachedState, getGameCache } from "../src/state-cache.ts"
import { app } from "../src/index.ts"
import { listActions, hashState, reconstructState, getGame } from "@spell/db"
import type { GameState } from "@spell/engine"

process.env["AUTH_BYPASS"] = "true"

// ─── Mock socket ─────────────────────────────────────────────────────────────

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
    publish() { return 0 },
    subscribe() {},
    unsubscribe() {},
    isSubscribed() { return false },
    cork() {},
    ping() { return 0 },
    pong() { return 0 },
    remoteAddress: "127.0.0.1",
    readyState: 1 as const,
    binaryType: "arraybuffer" as const,
  } as unknown as MockSocket
}

// ─── Constants & helpers ─────────────────────────────────────────────────────

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

async function createGame(seed = 42): Promise<{ gameId: string; slug: string }> {
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
  expect(res.status).toBe(201)
  return (await res.json()) as { gameId: string; slug: string }
}

async function joinGame(ws: MockSocket, gameId: string, playerId: string): Promise<void> {
  await wsHandlers.message(
    ws as unknown as ServerWebSocket<WsData>,
    JSON.stringify({ type: "JOIN_GAME", gameId, playerId }),
  )
}

async function submitMove(
  ws: MockSocket,
  gameId: string,
  move: { type: string; [key: string]: unknown },
): Promise<void> {
  await wsHandlers.message(
    ws as unknown as ServerWebSocket<WsData>,
    JSON.stringify({ type: "SUBMIT_MOVE", gameId, move }),
  )
}

function findMsg(ws: MockSocket, type: string): Record<string, unknown> | undefined {
  return ws.received.find((m) => (m as { type: string }).type === type) as
    | Record<string, unknown>
    | undefined
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Full move lifecycle (api + db + engine)", () => {
  let gameId: string

  beforeAll(async () => {
    const game = await createGame()
    gameId = game.gameId
  })

  beforeEach(() => {
    registry.clear()
    evictCachedState(gameId)
  })

  it("move persists to DB with correct sequence and hash", async () => {
    const wsA = mockSocket()
    await joinGame(wsA, gameId, PLAYER_A)
    wsA.received.length = 0

    // Submit via WS
    await submitMove(wsA, gameId, { type: "PASS" })

    // Verify DB action
    const actions = await listActions(gameId)
    const lastAction = actions[actions.length - 1]!
    expect(lastAction.playerId).toBe(PLAYER_A)
    expect(lastAction.move).toEqual({ type: "PASS", playerId: PLAYER_A })

    // Verify hash matches server-side reconstructed state
    const cached = getGameCache(gameId)
    expect(lastAction.stateHash).toBe(hashState(cached!.state))
  })

  it("broadcast MOVE_APPLIED reaches both players with matching hash", async () => {
    const game = await createGame(100)
    const wsA = mockSocket()
    const wsB = mockSocket()

    await joinGame(wsA, game.gameId, PLAYER_A)
    await joinGame(wsB, game.gameId, PLAYER_B)
    wsA.received.length = 0
    wsB.received.length = 0

    await submitMove(wsA, game.gameId, { type: "PASS" })

    const msgA = findMsg(wsA, "MOVE_APPLIED") as Record<string, unknown>
    const msgB = findMsg(wsB, "MOVE_APPLIED") as Record<string, unknown>
    expect(msgA).toBeDefined()
    expect(msgB).toBeDefined()

    // Both get identical delta
    expect(msgA["stateHash"]).toBe(msgB["stateHash"])
    expect(msgA["sequence"]).toBe(msgB["sequence"])
    expect(msgA["playerId"]).toBe(PLAYER_A)
    expect(msgA["move"]).toEqual({ type: "PASS", playerId: PLAYER_A })
    expect(msgA["status"]).toBe("active")
  })

  it("DB reconstruct matches cached state after move", async () => {
    const game = await createGame(200)
    const ws = mockSocket()

    await joinGame(ws, game.gameId, PLAYER_A)
    ws.received.length = 0

    await submitMove(ws, game.gameId, { type: "PASS" })

    // Get cached state
    const cached = getGameCache(game.gameId)
    expect(cached).not.toBeNull()

    // Reconstruct from DB
    const dbGame = await getGame(game.gameId)
    const { state: reconstructed } = await reconstructState(
      game.gameId,
      dbGame!.seed,
      (dbGame!.stateSnapshot as GameState | null) ?? null,
    )

    // Hashes must match
    expect(hashState(reconstructed)).toBe(hashState(cached!.state))
  })

  it("multi-move sequence maintains DB integrity", async () => {
    const game = await createGame(300)
    const ws = mockSocket()

    await joinGame(ws, game.gameId, PLAYER_A)
    ws.received.length = 0

    // Submit 3 PASS moves (advances through phases)
    for (let i = 0; i < 3; i++) {
      await submitMove(ws, game.gameId, { type: "PASS" })
    }

    const actions = await listActions(game.gameId)
    expect(actions.length).toBe(3)

    // Sequences are monotonically increasing
    for (let i = 1; i < actions.length; i++) {
      expect(actions[i]!.sequence).toBeGreaterThan(actions[i - 1]!.sequence)
    }

    // Last hash matches reconstruct
    const dbGame = await getGame(game.gameId)
    const { state: reconstructed } = await reconstructState(
      game.gameId,
      dbGame!.seed,
      (dbGame!.stateSnapshot as GameState | null) ?? null,
    )
    expect(hashState(reconstructed)).toBe(actions[actions.length - 1]!.stateHash)
  })

  it("invalid move does not create DB action or corrupt state", async () => {
    const game = await createGame(400)
    const ws = mockSocket()

    await joinGame(ws, game.gameId, PLAYER_A)
    const initialActions = await listActions(game.gameId)
    ws.received.length = 0

    // Submit an impossible move
    await submitMove(ws, game.gameId, { type: "EXPLODE_EVERYTHING" })

    const err = findMsg(ws, "ERROR")
    expect(err).toBeDefined()

    // No new action in DB
    const afterActions = await listActions(game.gameId)
    expect(afterActions.length).toBe(initialActions.length)
  })

  it("wrong player move does not create DB action", async () => {
    const game = await createGame(500)
    const wsA = mockSocket()
    const wsB = mockSocket()

    await joinGame(wsA, game.gameId, PLAYER_A)
    await joinGame(wsB, game.gameId, PLAYER_B)

    const initialActions = await listActions(game.gameId)
    wsB.received.length = 0

    // Player B tries to move when it's Player A's turn
    await submitMove(wsB, game.gameId, { type: "PASS" })

    const err = findMsg(wsB, "ERROR")
    expect(err).toBeDefined()

    const afterActions = await listActions(game.gameId)
    expect(afterActions.length).toBe(initialActions.length)
  })
})
