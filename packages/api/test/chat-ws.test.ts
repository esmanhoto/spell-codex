/**
 * Unit tests for chat WebSocket message handlers.
 * Tests call wsHandlers.message directly with mock sockets — no DB or network needed.
 */

import { describe, it, expect, beforeEach } from "bun:test"
import type { ServerWebSocket } from "bun"
import { wsHandlers, registry } from "../src/ws.ts"

process.env["AUTH_BYPASS"] = "true"

// ─── Mock socket helpers ──────────────────────────────────────────────────────

interface WsData {
  gameId: string | null
  userId: string | null
  displayName: string | null
  lastChatTs: number
}

interface MockSocket extends ServerWebSocket<WsData> {
  received: unknown[]
}

function mockSocket(data: WsData): MockSocket {
  const received: unknown[] = []
  const sock = {
    data,
    received,
    send(msg: string | Buffer) {
      received.push(JSON.parse(msg.toString()))
    },
    // unused stubs
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
  return sock
}

function joinedSocket(gameId: string, userId: string, displayName: string | null = null): MockSocket {
  return mockSocket({ gameId, userId, displayName, lastChatTs: 0 })
}

function registerSocket(sock: MockSocket) {
  const { gameId, userId } = sock.data
  if (!gameId || !userId) return
  if (!registry.has(gameId)) registry.set(gameId, new Map())
  registry.get(gameId)!.set(userId, sock as unknown as ServerWebSocket<WsData>)
}

// ─── Setup ────────────────────────────────────────────────────────────────────

const GAME = "aaaaaaaa-0000-0000-0000-000000000001"
const P1 = "player-1"
const P2 = "player-2"

beforeEach(() => {
  registry.clear()
})

// ─── CHAT_MSG ─────────────────────────────────────────────────────────────────

describe("CHAT_MSG", () => {
  it("broadcasts to all players in the game", async () => {
    const s1 = joinedSocket(GAME, P1)
    const s2 = joinedSocket(GAME, P2)
    registerSocket(s1)
    registerSocket(s2)

    await wsHandlers.message(s1 as unknown as ServerWebSocket<WsData>, JSON.stringify({ type: "CHAT_MSG", text: "Hello!" }))

    const s1Msgs = s1.received.filter((m) => (m as { type: string }).type === "CHAT_MSG")
    const s2Msgs = s2.received.filter((m) => (m as { type: string }).type === "CHAT_MSG")
    expect(s1Msgs).toHaveLength(1)
    expect(s2Msgs).toHaveLength(1)
    expect((s1Msgs[0] as { text: string }).text).toBe("Hello!")
    expect((s2Msgs[0] as { playerId: string }).playerId).toBe(P1)
  })

  it("includes gameId, playerId, text, ts in broadcast", async () => {
    const s1 = joinedSocket(GAME, P1)
    registerSocket(s1)

    await wsHandlers.message(s1 as unknown as ServerWebSocket<WsData>, JSON.stringify({ type: "CHAT_MSG", text: "hi" }))

    const msg = s1.received.find((m) => (m as { type: string }).type === "CHAT_MSG") as Record<string, unknown>
    expect(msg).toBeDefined()
    expect(msg["gameId"]).toBe(GAME)
    expect(msg["playerId"]).toBe(P1)
    expect(msg["text"]).toBe("hi")
    expect(typeof msg["ts"]).toBe("number")
  })

  it("rejects empty text", async () => {
    const s1 = joinedSocket(GAME, P1)
    registerSocket(s1)

    await wsHandlers.message(s1 as unknown as ServerWebSocket<WsData>, JSON.stringify({ type: "CHAT_MSG", text: "   " }))

    const chatMsgs = s1.received.filter((m) => (m as { type: string }).type === "CHAT_MSG")
    expect(chatMsgs).toHaveLength(0)
  })

  it("trims whitespace from text", async () => {
    const s1 = joinedSocket(GAME, P1)
    registerSocket(s1)

    await wsHandlers.message(s1 as unknown as ServerWebSocket<WsData>, JSON.stringify({ type: "CHAT_MSG", text: "  hello  " }))

    const msg = s1.received.find((m) => (m as { type: string }).type === "CHAT_MSG") as Record<string, unknown>
    expect(msg["text"]).toBe("hello")
  })

  it("truncates text to 500 chars", async () => {
    const s1 = joinedSocket(GAME, P1)
    registerSocket(s1)

    const long = "a".repeat(600)
    await wsHandlers.message(s1 as unknown as ServerWebSocket<WsData>, JSON.stringify({ type: "CHAT_MSG", text: long }))

    const msg = s1.received.find((m) => (m as { type: string }).type === "CHAT_MSG") as Record<string, unknown>
    expect((msg["text"] as string).length).toBe(500)
  })

  it("rejects if socket has not joined a game", async () => {
    const s1 = mockSocket({ gameId: null, userId: null, displayName: null, lastChatTs: 0 })

    await wsHandlers.message(s1 as unknown as ServerWebSocket<WsData>, JSON.stringify({ type: "CHAT_MSG", text: "hi" }))

    const err = s1.received.find((m) => (m as { type: string }).type === "ERROR") as Record<string, unknown>
    expect(err).toBeDefined()
    expect(err["code"]).toBe("NOT_JOINED")
  })

  it("rate-limits rapid messages", async () => {
    const s1 = joinedSocket(GAME, P1)
    registerSocket(s1)

    // First message goes through
    await wsHandlers.message(s1 as unknown as ServerWebSocket<WsData>, JSON.stringify({ type: "CHAT_MSG", text: "first" }))
    // Second immediately after should be rate-limited
    await wsHandlers.message(s1 as unknown as ServerWebSocket<WsData>, JSON.stringify({ type: "CHAT_MSG", text: "second" }))

    const chatMsgs = s1.received.filter((m) => (m as { type: string }).type === "CHAT_MSG")
    const errors = s1.received.filter(
      (m) => (m as { type: string; code?: string }).type === "ERROR" && (m as { code: string }).code === "RATE_LIMITED",
    )
    expect(chatMsgs).toHaveLength(1)
    expect(errors).toHaveLength(1)
  })
})

// ─── CHAT_EMOTE ───────────────────────────────────────────────────────────────

describe("CHAT_EMOTE", () => {
  it("broadcasts to all players in the game", async () => {
    const s1 = joinedSocket(GAME, P1)
    const s2 = joinedSocket(GAME, P2)
    registerSocket(s1)
    registerSocket(s2)

    await wsHandlers.message(s1 as unknown as ServerWebSocket<WsData>, JSON.stringify({ type: "CHAT_EMOTE", emote: "heart" }))

    const s1Emotes = s1.received.filter((m) => (m as { type: string }).type === "CHAT_EMOTE")
    const s2Emotes = s2.received.filter((m) => (m as { type: string }).type === "CHAT_EMOTE")
    expect(s1Emotes).toHaveLength(1)
    expect(s2Emotes).toHaveLength(1)
    expect((s2Emotes[0] as { emote: string }).emote).toBe("heart")
    expect((s2Emotes[0] as { playerId: string }).playerId).toBe(P1)
  })

  it("rejects unknown emote ids", async () => {
    const s1 = joinedSocket(GAME, P1)
    registerSocket(s1)

    await wsHandlers.message(s1 as unknown as ServerWebSocket<WsData>, JSON.stringify({ type: "CHAT_EMOTE", emote: "skull" }))

    const err = s1.received.find((m) => (m as { type: string }).type === "ERROR") as Record<string, unknown>
    expect(err).toBeDefined()
    expect(err["code"]).toBe("INVALID_EMOTE")
  })

  it("accepts all allowed emotes", async () => {
    const allowed = ["scream", "heart", "thumbsup", "hourglass"]
    for (const emote of allowed) {
      const s1 = joinedSocket(GAME, P1)
      registerSocket(s1)

      await wsHandlers.message(s1 as unknown as ServerWebSocket<WsData>, JSON.stringify({ type: "CHAT_EMOTE", emote }))

      const emoteMsg = s1.received.find((m) => (m as { type: string }).type === "CHAT_EMOTE")
      expect(emoteMsg).toBeDefined()

      registry.clear()
    }
  })

  it("rejects if socket has not joined a game", async () => {
    const s1 = mockSocket({ gameId: null, userId: null, displayName: null, lastChatTs: 0 })

    await wsHandlers.message(s1 as unknown as ServerWebSocket<WsData>, JSON.stringify({ type: "CHAT_EMOTE", emote: "heart" }))

    const err = s1.received.find((m) => (m as { type: string }).type === "ERROR") as Record<string, unknown>
    expect(err).toBeDefined()
    expect(err["code"]).toBe("NOT_JOINED")
  })

  it("rate-limits rapid emotes", async () => {
    const s1 = joinedSocket(GAME, P1)
    registerSocket(s1)

    await wsHandlers.message(s1 as unknown as ServerWebSocket<WsData>, JSON.stringify({ type: "CHAT_EMOTE", emote: "heart" }))
    await wsHandlers.message(s1 as unknown as ServerWebSocket<WsData>, JSON.stringify({ type: "CHAT_EMOTE", emote: "thumbsup" }))

    const emoteMsgs = s1.received.filter((m) => (m as { type: string }).type === "CHAT_EMOTE")
    const rateLimitErrors = s1.received.filter(
      (m) => (m as { type: string; code?: string }).type === "ERROR" && (m as { code: string }).code === "RATE_LIMITED",
    )
    expect(emoteMsgs).toHaveLength(1)
    expect(rateLimitErrors).toHaveLength(1)
  })
})
