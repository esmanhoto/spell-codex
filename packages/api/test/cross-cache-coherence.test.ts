/**
 * Phase 6b — State cache coherence integration test.
 * Covers: api + db cache miss → reconstruct → cache update cycle.
 * Verifies cache never diverges from DB across multiple moves and evictions.
 * Requires DATABASE_URL.
 */

import { describe, it, expect } from "bun:test"
import type { ServerWebSocket } from "bun"
import { wsHandlers, registry } from "../src/ws.ts"
import { loadGameState } from "../src/game-ops.ts"
import { evictCachedState, getGameCache } from "../src/state-cache.ts"
import { app } from "../src/index.ts"
import { hashState, reconstructState, getGame, listActions } from "@spell/db"
import type { GameState } from "@spell/engine"

process.env["AUTH_BYPASS"] = "true"

// ─── Mock socket ─────────────────────────────────────────────────────────────

interface WsData {
  gameId: string | null
  userId: string | null
  displayName: string | null
  lastChatTs: number
  idleTimer: ReturnType<typeof setTimeout> | null
}

interface MockSocket extends ServerWebSocket<WsData> {
  received: unknown[]
}

function mockSocket(data?: Partial<WsData>): MockSocket {
  const received: unknown[] = []
  return {
    data: { gameId: null, userId: null, displayName: null, lastChatTs: 0, idleTimer: null, ...data },
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

async function joinAndMove(gameId: string, move = { type: "PASS" }): Promise<void> {
  const ws = mockSocket()
  await wsHandlers.message(
    ws as unknown as ServerWebSocket<WsData>,
    JSON.stringify({ type: "JOIN_GAME", gameId, playerId: PLAYER_A }),
  )
  ws.received.length = 0
  await wsHandlers.message(
    ws as unknown as ServerWebSocket<WsData>,
    JSON.stringify({ type: "SUBMIT_MOVE", gameId, move }),
  )
  registry.clear()
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("State cache coherence (api + db)", () => {
  it("cache miss → DB reconstruct → cache hit returns same state", async () => {
    const gameId = await createGame(700)
    evictCachedState(gameId)

    // First load = DB reconstruct
    const first = await loadGameState(gameId)
    expect(first!.cacheHit).toBe(false)
    const firstHash = hashState(first!.state)

    // Second load = cache hit
    const second = await loadGameState(gameId)
    expect(second!.cacheHit).toBe(true)
    const secondHash = hashState(second!.state)

    expect(firstHash).toBe(secondHash)
    // Same object reference (not a copy)
    expect(second!.state).toBe(first!.state)
  })

  it("move updates cache — evict + reload matches DB", async () => {
    const gameId = await createGame(701)

    // Make a move (populates cache)
    await joinAndMove(gameId)

    // Get cached hash
    const cached = getGameCache(gameId)
    expect(cached).not.toBeNull()
    const cachedHash = hashState(cached!.state)

    // Evict and reload from DB
    evictCachedState(gameId)
    const reloaded = await loadGameState(gameId)
    expect(reloaded!.cacheHit).toBe(false)
    const reloadedHash = hashState(reloaded!.state)

    expect(reloadedHash).toBe(cachedHash)
  })

  it("multiple moves + evictions maintain hash parity", async () => {
    const gameId = await createGame(702)

    const hashes: string[] = []

    for (let i = 0; i < 3; i++) {
      // Make a move
      evictCachedState(gameId)
      await joinAndMove(gameId)

      // Capture cached hash
      const cached = getGameCache(gameId)
      hashes.push(hashState(cached!.state))

      // Evict and reconstruct from DB
      evictCachedState(gameId)
      const fromDb = await loadGameState(gameId)
      const dbHash = hashState(fromDb!.state)

      expect(dbHash).toBe(hashes[i])
    }

    // All hashes should be different (state progressed)
    const unique = new Set(hashes)
    expect(unique.size).toBe(hashes.length)
  })

  it("cache sequence matches DB lastAction sequence", async () => {
    const gameId = await createGame(703)

    await joinAndMove(gameId)

    const cached = getGameCache(gameId)
    const actions = await listActions(gameId)
    expect(cached!.sequence).toBe(actions[actions.length - 1]!.sequence)
  })

  it("cache playerIds match DB game players", async () => {
    const gameId = await createGame(704)
    evictCachedState(gameId)

    const loaded = await loadGameState(gameId)
    expect(loaded!.playerIds).toContain(PLAYER_A)
    expect(loaded!.playerIds).toContain(PLAYER_B)
    expect(loaded!.playerIds.length).toBe(2)
  })

  it("full reconstruct matches last action hash", async () => {
    const gameId = await createGame(705)

    // Apply 2 moves
    await joinAndMove(gameId)
    evictCachedState(gameId)
    registry.clear()
    await joinAndMove(gameId)

    const actions = await listActions(gameId)
    const lastAction = actions[actions.length - 1]!

    // Full reconstruct from DB
    const game = await getGame(gameId)
    const { state: reconstructed } = await reconstructState(
      gameId,
      game!.seed,
      (game!.stateSnapshot as GameState | null) ?? null,
    )

    expect(hashState(reconstructed)).toBe(lastAction.stateHash)
  })
})
