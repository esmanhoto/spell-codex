/**
 * WS handler security unit tests — no DB required.
 * Tests JSON parsing, auth guards, not-joined guards, SYNC_REQUEST cache checks,
 * and malformed/oversized payloads.
 */

import { describe, it, expect, beforeEach, afterAll } from "bun:test"
import type { ServerWebSocket } from "bun"
import { wsHandlers, registry, processWsMove, filterStateForPlayer } from "../src/ws.ts"
import { setCachedState, evictCachedState } from "../src/state-cache.ts"
import type { GameState } from "@spell/engine"

// ─── Mock socket helpers (same pattern as chat-ws.test.ts) ───────────────────

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

function mockSocket(data: WsData): MockSocket {
  const received: unknown[] = []
  return {
    data,
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

function notJoinedSocket(): MockSocket {
  return mockSocket({ gameId: null, userId: null, displayName: null, lastChatTs: 0, idleTimer: null })
}

function joinedSocket(gameId: string, userId: string): MockSocket {
  return mockSocket({ gameId, userId, displayName: null, lastChatTs: 0, idleTimer: null })
}

// ─── Constants ───────────────────────────────────────────────────────────────

const GAME = "aaaaaaaa-0000-0000-0000-000000000001"
const P1 = "player-1"
const P2 = "player-2"

// Minimal GameState stub for cache population
const STUB_STATE = {
  id: GAME,
  players: {},
  currentTurn: 0,
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
} as unknown as GameState

beforeEach(() => {
  registry.clear()
  evictCachedState(GAME)
})

// ─── Malformed JSON ──────────────────────────────────────────────────────────

describe("malformed WS JSON", () => {
  const cases: Array<[string, string | Buffer]> = [
    ["invalid JSON string", "{bad json"],
    ["empty string", ""],
    ["binary garbage", Buffer.from([0xff, 0xfe, 0x00, 0x01])],
    ["1MB non-JSON payload", "x".repeat(1_000_000)],
  ]

  for (const [label, payload] of cases) {
    it(`returns PARSE_ERROR for ${label}`, async () => {
      const ws = notJoinedSocket()
      await wsHandlers.message(ws as unknown as ServerWebSocket<WsData>, payload)
      const err = ws.received[0] as { type: string; code: string }
      expect(err.type).toBe("ERROR")
      expect(err.code).toBe("PARSE_ERROR")
    })
  }
})

// ─── Unknown message type ────────────────────────────────────────────────────

describe("unknown message type", () => {
  it("returns UNKNOWN_MSG for unrecognized type", async () => {
    const ws = notJoinedSocket()
    await wsHandlers.message(
      ws as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "HACK_SERVER" }),
    )
    const err = ws.received[0] as { type: string; code: string }
    expect(err.type).toBe("ERROR")
    expect(err.code).toBe("UNKNOWN_MSG")
  })

  it("returns UNKNOWN_MSG for missing type field", async () => {
    const ws = notJoinedSocket()
    await wsHandlers.message(
      ws as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ data: "no type" }),
    )
    const err = ws.received[0] as { type: string; code: string }
    expect(err.type).toBe("ERROR")
    expect(err.code).toBe("UNKNOWN_MSG")
  })
})

// ─── PING ────────────────────────────────────────────────────────────────────

describe("PING", () => {
  it("responds with PONG", async () => {
    const ws = notJoinedSocket()
    await wsHandlers.message(
      ws as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "PING" }),
    )
    expect(ws.received).toHaveLength(1)
    expect((ws.received[0] as { type: string }).type).toBe("PONG")
  })
})

// ─── Not-joined guards ──────────────────────────────────────────────────────

describe("not-joined guards", () => {
  it("SUBMIT_MOVE rejects when not joined", async () => {
    const ws = notJoinedSocket()
    await wsHandlers.message(
      ws as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "SUBMIT_MOVE", gameId: GAME, move: { type: "PASS" } }),
    )
    const err = ws.received[0] as { type: string; code: string }
    expect(err.type).toBe("ERROR")
    expect(err.code).toBe("NOT_JOINED")
  })

  it("SYNC_REQUEST rejects when not joined", async () => {
    const ws = notJoinedSocket()
    await wsHandlers.message(
      ws as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "SYNC_REQUEST", gameId: GAME }),
    )
    const err = ws.received[0] as { type: string; code: string }
    expect(err.type).toBe("ERROR")
    expect(err.code).toBe("NOT_JOINED")
  })
})

// ─── SYNC_REQUEST cache checks ──────────────────────────────────────────────

describe("SYNC_REQUEST", () => {
  it("returns NOT_FOUND when game is not in cache", async () => {
    const ws = joinedSocket(GAME, P1)
    await wsHandlers.message(
      ws as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "SYNC_REQUEST", gameId: "nonexistent-game-id" }),
    )
    const err = ws.received[0] as { type: string; code: string }
    expect(err.type).toBe("ERROR")
    expect(err.code).toBe("NOT_FOUND")
  })

  it("returns FORBIDDEN when userId is not a participant", async () => {
    setCachedState(GAME, STUB_STATE, 0, {
      playerIds: [P1, P2],
      seed: 42,
      stateSnapshot: null,
    })
    const outsider = joinedSocket(GAME, "outsider-id")
    await wsHandlers.message(
      outsider as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "SYNC_REQUEST", gameId: GAME }),
    )
    const err = outsider.received[0] as { type: string; code: string }
    expect(err.type).toBe("ERROR")
    expect(err.code).toBe("FORBIDDEN")
  })

  it("returns STATE_UPDATE with rawEngineState for valid participant", async () => {
    setCachedState(GAME, STUB_STATE, 5, {
      playerIds: [P1, P2],
      seed: 42,
      stateSnapshot: null,
    })
    const ws = joinedSocket(GAME, P1)
    await wsHandlers.message(
      ws as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "SYNC_REQUEST", gameId: GAME }),
    )
    const msg = ws.received[0] as {
      type: string
      gameId: string
      rawEngineState: unknown
      sequence: number
    }
    expect(msg.type).toBe("STATE_UPDATE")
    expect(msg.gameId).toBe(GAME)
    expect(msg.rawEngineState).toBeDefined()
    expect(msg.sequence).toBe(5)
  })
})

// ─── JOIN_GAME auth ──────────────────────────────────────────────────────────

describe("JOIN_GAME auth", () => {
  const savedBypass = process.env["AUTH_BYPASS"]
  const realFetch = globalThis.fetch

  afterAll(() => {
    process.env["AUTH_BYPASS"] = savedBypass
    globalThis.fetch = realFetch
  })

  it("rejects when no token and AUTH_BYPASS is disabled", async () => {
    process.env["AUTH_BYPASS"] = "false"
    const ws = notJoinedSocket()
    await wsHandlers.message(
      ws as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "JOIN_GAME", gameId: GAME }),
    )
    const err = ws.received[0] as { type: string; code: string }
    expect(err.type).toBe("ERROR")
    expect(err.code).toBe("UNAUTHORIZED")
    process.env["AUTH_BYPASS"] = savedBypass
  })

  it("rejects when playerId provided but AUTH_BYPASS disabled", async () => {
    process.env["AUTH_BYPASS"] = "false"
    const ws = notJoinedSocket()
    await wsHandlers.message(
      ws as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "JOIN_GAME", gameId: GAME, playerId: P1 }),
    )
    const err = ws.received[0] as { type: string; code: string }
    expect(err.type).toBe("ERROR")
    expect(err.code).toBe("UNAUTHORIZED")
    process.env["AUTH_BYPASS"] = savedBypass
  })

  it("rejects invalid bearer token", async () => {
    process.env["AUTH_BYPASS"] = "false"
    process.env["SUPABASE_URL"] = "http://supabase.mock"
    process.env["SUPABASE_ANON_KEY"] = "test-key"

    globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      if (url === "http://supabase.mock/auth/v1/user") {
        return new Response(JSON.stringify({ message: "Invalid JWT" }), { status: 401 })
      }
      return realFetch(input)
    }) as typeof fetch

    const ws = notJoinedSocket()
    await wsHandlers.message(
      ws as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "JOIN_GAME", gameId: GAME, token: "invalid-token" }),
    )
    const err = ws.received[0] as { type: string; code: string }
    expect(err.type).toBe("ERROR")
    expect(err.code).toBe("UNAUTHORIZED")

    globalThis.fetch = realFetch
    process.env["AUTH_BYPASS"] = savedBypass
  })

  it("rejects empty token string", async () => {
    process.env["AUTH_BYPASS"] = "false"
    const ws = notJoinedSocket()
    await wsHandlers.message(
      ws as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "JOIN_GAME", gameId: GAME, token: "" }),
    )
    const err = ws.received[0] as { type: string; code: string }
    expect(err.type).toBe("ERROR")
    expect(err.code).toBe("UNAUTHORIZED")
    process.env["AUTH_BYPASS"] = savedBypass
  })

  it("rejects empty playerId string in bypass mode", async () => {
    process.env["AUTH_BYPASS"] = "true"
    const ws = notJoinedSocket()
    await wsHandlers.message(
      ws as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "JOIN_GAME", gameId: GAME, playerId: "" }),
    )
    const err = ws.received[0] as { type: string; code: string }
    expect(err.type).toBe("ERROR")
    expect(err.code).toBe("UNAUTHORIZED")
    process.env["AUTH_BYPASS"] = savedBypass
  })
})

// ─── Socket close cleanup ────────────────────────────────────────────────────

describe("socket close", () => {
  it("removes socket from registry on close", () => {
    const ws = joinedSocket(GAME, P1)
    if (!registry.has(GAME)) registry.set(GAME, new Map())
    registry.get(GAME)!.set(P1, ws as unknown as ServerWebSocket<WsData>)

    wsHandlers.close(ws as unknown as ServerWebSocket<WsData>)

    const players = registry.get(GAME)
    expect(players?.has(P1)).toBe(false)
  })

  it("does not remove a different socket for the same user", () => {
    const ws1 = joinedSocket(GAME, P1)
    const ws2 = joinedSocket(GAME, P1)
    if (!registry.has(GAME)) registry.set(GAME, new Map())
    registry.get(GAME)!.set(P1, ws2 as unknown as ServerWebSocket<WsData>)

    // Close ws1, but ws2 is registered — should NOT remove
    wsHandlers.close(ws1 as unknown as ServerWebSocket<WsData>)

    const players = registry.get(GAME)
    expect(players?.get(P1)).toBe(ws2)
  })

  it("handles close when not joined (no crash)", () => {
    const ws = notJoinedSocket()
    expect(() => wsHandlers.close(ws as unknown as ServerWebSocket<WsData>)).not.toThrow()
  })
})

// ─── Socket open initialization ──────────────────────────────────────────────

describe("socket open", () => {
  it("initializes ws.data with null fields", () => {
    const ws = mockSocket({
      gameId: "stale",
      userId: "stale",
      displayName: "stale",
      lastChatTs: 999,
      idleTimer: null,
    })
    wsHandlers.open(ws as unknown as ServerWebSocket<WsData>)
    expect(ws.data.gameId).toBeNull()
    expect(ws.data.userId).toBeNull()
    expect(ws.data.displayName).toBeNull()
    expect(ws.data.lastChatTs).toBe(0)
    expect(ws.data.idleTimer).not.toBeNull()
  })
})

// ─── Blocked move types ──────────────────────────────────────────────────────

describe("processWsMove blocked move types", () => {
  it("rejects DEV_GIVE_CARD without hitting DB or engine", async () => {
    const result = await processWsMove(GAME, P1, {
      type: "DEV_GIVE_CARD",
      playerId: P1,
      instanceId: "exploit-1",
      card: { name: "Exploit" },
    })
    expect(result).toEqual({ ok: false, code: "BLOCKED_MOVE", message: "Blocked move type" })
  })
})

// ─── filterStateForPlayer ────────────────────────────────────────────────────

describe("filterStateForPlayer", () => {
  const card = { instanceId: "c1", card: { name: "Test" } }
  const fullState = {
    ...STUB_STATE,
    players: {
      [P1]: {
        id: P1,
        hand: [card, card],
        drawPile: [card, card, card],
        discardPile: [card],
        limbo: [],
        abyss: [],
        formation: { realms: [] },
        dungeon: null,
        pool: [],
        lastingEffects: [],
      },
      [P2]: {
        id: P2,
        hand: [card],
        drawPile: [card, card],
        discardPile: [card],
        limbo: [],
        abyss: [],
        formation: { realms: [] },
        dungeon: null,
        pool: [],
        lastingEffects: [],
      },
    },
  } as unknown as GameState

  it("hides opponent hand/drawPile, preserves viewer and non-hidden zones, works symmetrically", () => {
    const p1View = filterStateForPlayer(fullState, P1)
    // Viewer zones preserved
    expect(p1View.players[P1]!.hand).toHaveLength(2)
    expect(p1View.players[P1]!.drawPile).toHaveLength(3)
    // Opponent hidden zones emptied
    expect(p1View.players[P2]!.hand).toHaveLength(0)
    expect(p1View.players[P2]!.drawPile).toHaveLength(0)
    // Opponent non-hidden zones preserved
    expect(p1View.players[P2]!.discardPile).toHaveLength(1)

    // Symmetric for P2
    const p2View = filterStateForPlayer(fullState, P2)
    expect(p2View.players[P2]!.hand).toHaveLength(1)
    expect(p2View.players[P2]!.drawPile).toHaveLength(2)
    expect(p2View.players[P1]!.hand).toHaveLength(0)
    expect(p2View.players[P1]!.drawPile).toHaveLength(0)
  })

  it("does not mutate the original state", () => {
    const before = fullState.players[P2]!.hand.length
    filterStateForPlayer(fullState, P1)
    expect(fullState.players[P2]!.hand).toHaveLength(before)
  })
})
