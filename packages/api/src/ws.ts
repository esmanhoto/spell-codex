import type { ServerWebSocket } from "bun"
import {
  getGame,
  getGameBySlug,
  getGamePlayers,
  reconstructState,
  lastSequence,
  saveAction,
  setGameStatus,
  touchGame,
  hashState,
} from "@spell/db"
import { applyMove, EngineError } from "@spell/engine"
import type { GameState } from "@spell/engine"
import { serializeGameState } from "./serialize.ts"
import { authBypassEnabled, verifySupabaseAccessTokenFull } from "./auth-verify.ts"
import { getCachedState, setCachedState, evictCachedState } from "./state-cache.ts"

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClientMessage =
  | { type: "JOIN_GAME"; gameId: string; token?: string; playerId?: string }
  | { type: "SUBMIT_MOVE"; gameId: string; move: { type: string; [key: string]: unknown } }
  | { type: "CHAT_MSG"; text: string }
  | { type: "CHAT_EMOTE"; emote: string }
  | { type: "PING" }

export type ServerMessage =
  | { type: "STATE_UPDATE"; gameId: string; state: unknown }
  | { type: "GAME_OVER"; gameId: string; winner: string }
  | {
      type: "CHAT_MSG"
      gameId: string
      playerId: string
      displayName: string | null
      text: string
      ts: number
    }
  | { type: "CHAT_EMOTE"; gameId: string; playerId: string; emote: string; ts: number }
  | { type: "PONG" }
  | { type: "ERROR"; code: string; message: string }

// ─── Connection registry ──────────────────────────────────────────────────────

// gameId → playerId → socket
export const registry = new Map<string, Map<string, ServerWebSocket<WsData>>>()

const ALLOWED_EMOTES = new Set(["scream", "heart", "thumbsup", "hourglass"])
const CHAT_RATE_MS = 200

// Per-game move queue to prevent concurrent move processing.
// Bun's async WS message handler does NOT serialize awaits — two messages
// from the same connection can race if both call processWsMove concurrently,
// leading to duplicate sequence numbers and DB constraint violations.
const moveQueues = new Map<string, Promise<void>>()

function enqueueMove(gameId: string, fn: () => Promise<void>): Promise<void> {
  const prev = moveQueues.get(gameId) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  moveQueues.set(gameId, next)
  // Clean up reference when the queue drains
  next.then(() => {
    if (moveQueues.get(gameId) === next) moveQueues.delete(gameId)
  })
  return next
}

interface WsData {
  gameId: string | null
  userId: string | null
  displayName: string | null
  lastChatTs: number
}

// ─── Broadcast helpers ────────────────────────────────────────────────────────

function send(ws: ServerWebSocket<WsData>, msg: ServerMessage): void {
  try {
    ws.send(JSON.stringify(msg))
  } catch {
    // Socket may have closed between check and send — ignore
  }
}

export function broadcastToGame(gameId: string, msg: ServerMessage): void {
  const players = registry.get(gameId)
  if (!players) return
  for (const ws of players.values()) {
    send(ws, msg)
  }
}

// ─── Move processing ──────────────────────────────────────────────────────────

const TURN_DEADLINE_MS = 24 * 60 * 60 * 1000

export async function processWsMove(
  gameId: string,
  userId: string,
  move: { type: string; [key: string]: unknown },
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const t0 = performance.now()

  const game = await getGame(gameId)
  if (!game) return { ok: false, code: "NOT_FOUND", message: "Game not found" }
  if (game.status !== "active") {
    return { ok: false, code: "GAME_ENDED", message: "Game is not active" }
  }

  const players = await getGamePlayers(gameId)
  if (!players.some((p) => p.userId === userId)) {
    return { ok: false, code: "FORBIDDEN", message: "Not a participant" }
  }

  let seq = await lastSequence(gameId)
  const actionsReplayed = seq + 1 // seq=-1 means 0 prior actions

  const cached = getCachedState(gameId, seq)
  let state: GameState
  if (cached) {
    state = cached
  } else {
    const { state: reconstructed } = await reconstructState(
      gameId,
      game.seed,
      (game.stateSnapshot as GameState | null) ?? null,
    )
    state = reconstructed
    setCachedState(gameId, state, seq)
  }
  const t1 = performance.now()

  let result
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = applyMove(state, userId, move as any)
  } catch (err) {
    if (err instanceof EngineError) {
      return { ok: false, code: err.code, message: err.message }
    }
    const message = err instanceof Error ? err.message : "Invalid move"
    return { ok: false, code: "INVALID_MOVE", message }
  }
  const t2 = performance.now()

  const tHashStart = performance.now()
  const stateHash = hashState(result.newState)
  const tHashEnd = performance.now()

  const action = await saveAction({
    gameId,
    sequence: seq + 1,
    playerId: userId,
    move: move as Parameters<typeof saveAction>[0]["move"],
    stateHash,
  })
  seq = action.sequence

  // Update in-memory cache with the newly applied state
  setCachedState(gameId, result.newState, seq)
  if (result.newState.winner) evictCachedState(gameId)

  const newStatus = result.newState.winner ? "finished" : "active"
  const turnDeadline = result.newState.winner ? undefined : new Date(Date.now() + TURN_DEADLINE_MS)
  await Promise.all([
    setGameStatus(gameId, newStatus, result.newState.winner ?? undefined),
    touchGame(gameId, turnDeadline),
  ])

  // Broadcast updated state to all players in the game (player-specific visibility)
  const newTurnDeadline = result.newState.winner
    ? null
    : new Date(Date.now() + TURN_DEADLINE_MS).toISOString()
  const sockets = registry.get(gameId)
  let broadcastBytes = 0
  const tSerializeStart = performance.now()
  if (sockets) {
    for (const [viewerPlayerId, socket] of sockets.entries()) {
      const msg: ServerMessage = {
        type: "STATE_UPDATE",
        gameId,
        state: serializeGameState(
          result.newState,
          {
            status: result.newState.winner ? "finished" : "active",
            turnDeadline: newTurnDeadline,
          },
          viewerPlayerId,
        ),
      }
      const encoded = JSON.stringify(msg)
      broadcastBytes += encoded.length
      try {
        socket.send(encoded)
      } catch {
        // Socket may have closed between check and send — ignore
      }
    }
  }
  const tSerializeEnd = performance.now()

  if (result.newState.winner) {
    broadcastToGame(gameId, { type: "GAME_OVER", gameId, winner: result.newState.winner })
  }

  const total = performance.now()
  console.log(
    JSON.stringify({
      perf: "move",
      game: gameId,
      seq,
      move_type: move.type,
      cache_hit: cached !== null,
      actions_replayed: actionsReplayed,
      reconstruct_ms: +(t1 - t0).toFixed(2),
      apply_move_ms: +(t2 - t1).toFixed(2),
      hash_ms: +(tHashEnd - tHashStart).toFixed(2),
      serialize_ms: +(tSerializeEnd - tSerializeStart).toFixed(2),
      broadcast_bytes: broadcastBytes,
      total_ms: +(total - t0).toFixed(2),
    }),
  )

  return { ok: true }
}

// ─── WebSocket handlers ───────────────────────────────────────────────────────

export const wsHandlers = {
  open(ws: ServerWebSocket<WsData>) {
    ws.data = { gameId: null, userId: null, displayName: null, lastChatTs: 0 }
  },

  async message(ws: ServerWebSocket<WsData>, raw: string | Buffer) {
    let msg: ClientMessage
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage
    } catch {
      send(ws, { type: "ERROR", code: "PARSE_ERROR", message: "Invalid JSON" })
      return
    }

    try {
      switch (msg.type) {
        case "PING":
          send(ws, { type: "PONG" })
          return

        case "JOIN_GAME": {
          const idOrSlug = msg.gameId
          let userId: string | null = null
          let displayName: string | null = null

          if (typeof msg.token === "string" && msg.token.length > 0) {
            try {
              const result = await verifySupabaseAccessTokenFull(msg.token)
              userId = result.id
              displayName = result.email ? result.email.split("@")[0]! : null
            } catch {
              send(ws, { type: "ERROR", code: "UNAUTHORIZED", message: "Invalid bearer token" })
              return
            }
          } else if (
            authBypassEnabled() &&
            typeof msg.playerId === "string" &&
            msg.playerId.length > 0
          ) {
            userId = msg.playerId
            displayName = null
          } else {
            send(ws, { type: "ERROR", code: "UNAUTHORIZED", message: "Missing authentication" })
            return
          }

          // Resolve slug or UUID → canonical game record
          const game = /^[0-9a-f-]{36}$/i.test(idOrSlug)
            ? await getGame(idOrSlug)
            : await getGameBySlug(idOrSlug)
          if (!game) {
            send(ws, { type: "ERROR", code: "NOT_FOUND", message: "Game not found" })
            return
          }
          const gameId = game.id
          const players = await getGamePlayers(gameId)
          if (!players.some((p) => p.userId === userId)) {
            send(ws, { type: "ERROR", code: "FORBIDDEN", message: "Not a participant" })
            return
          }
          if (game.status === "waiting" && players.length < 2) {
            send(ws, {
              type: "ERROR",
              code: "WAITING_FOR_OPPONENT",
              message: "Game is waiting for an opponent to join",
            })
            return
          }

          // Leave previous game if any (only remove if this exact socket is registered)
          if (ws.data.gameId && ws.data.userId) {
            const prevMap = registry.get(ws.data.gameId)
            if (prevMap?.get(ws.data.userId) === ws) {
              prevMap.delete(ws.data.userId)
            }
          }

          ws.data = { gameId, userId, displayName, lastChatTs: ws.data.lastChatTs }
          if (!registry.has(gameId)) registry.set(gameId, new Map())
          registry.get(gameId)!.set(userId, ws)

          // Send current state (serialized to the API shape the client expects)
          const joinSeq = await lastSequence(gameId)
          const joinCached = getCachedState(gameId, joinSeq)
          let joinState: GameState
          if (joinCached) {
            joinState = joinCached
          } else {
            const { state: reconstructed } = await reconstructState(
              gameId,
              game.seed,
              (game.stateSnapshot as GameState | null) ?? null,
            )
            joinState = reconstructed
            setCachedState(gameId, joinState, joinSeq)
          }
          send(ws, {
            type: "STATE_UPDATE",
            gameId,
            state: serializeGameState(joinState, undefined, userId),
          })
          return
        }

        case "SUBMIT_MOVE": {
          const { move } = msg
          if (!ws.data.userId || !ws.data.gameId) {
            send(ws, { type: "ERROR", code: "NOT_JOINED", message: "Join a game first" })
            return
          }
          // Use the resolved UUID stored at JOIN_GAME time (msg.gameId may be a slug)
          const gameId = ws.data.gameId
          const userId = ws.data.userId
          // Enqueue to prevent concurrent move processing for the same game
          await enqueueMove(gameId, async () => {
            const result = await processWsMove(gameId, userId, move)
            if (!result.ok) {
              send(ws, { type: "ERROR", code: result.code, message: result.message })
            }
          })
          return
        }

        case "CHAT_MSG": {
          if (!ws.data.userId || !ws.data.gameId) {
            send(ws, { type: "ERROR", code: "NOT_JOINED", message: "Join a game first" })
            return
          }
          const now = Date.now()
          if (now - ws.data.lastChatTs < CHAT_RATE_MS) {
            send(ws, { type: "ERROR", code: "RATE_LIMITED", message: "Slow down" })
            return
          }
          ws.data.lastChatTs = now
          const text = msg.text.trim().slice(0, 500)
          if (!text) return
          broadcastToGame(ws.data.gameId, {
            type: "CHAT_MSG",
            gameId: ws.data.gameId,
            playerId: ws.data.userId,
            displayName: ws.data.displayName,
            text,
            ts: now,
          })
          return
        }

        case "CHAT_EMOTE": {
          if (!ws.data.userId || !ws.data.gameId) {
            send(ws, { type: "ERROR", code: "NOT_JOINED", message: "Join a game first" })
            return
          }
          if (!ALLOWED_EMOTES.has(msg.emote)) {
            send(ws, { type: "ERROR", code: "INVALID_EMOTE", message: "Unknown emote" })
            return
          }
          const now = Date.now()
          if (now - ws.data.lastChatTs < CHAT_RATE_MS) {
            send(ws, { type: "ERROR", code: "RATE_LIMITED", message: "Slow down" })
            return
          }
          ws.data.lastChatTs = now
          broadcastToGame(ws.data.gameId, {
            type: "CHAT_EMOTE",
            gameId: ws.data.gameId,
            playerId: ws.data.userId,
            emote: msg.emote,
            ts: now,
          })
          return
        }

        default:
          send(ws, { type: "ERROR", code: "UNKNOWN_MSG", message: "Unknown message type" })
      }
    } catch (err) {
      console.error("[ws] Unhandled error in message handler:", err)
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("ECONNREFUSED")) {
        send(ws, {
          type: "ERROR",
          code: "DB_UNAVAILABLE",
          message: "Database unavailable. Verify DATABASE_URL and DB availability.",
        })
        return
      }
      send(ws, { type: "ERROR", code: "INTERNAL", message: "Internal server error" })
    }
  },

  close(ws: ServerWebSocket<WsData>) {
    if (ws.data.gameId && ws.data.userId) {
      const players = registry.get(ws.data.gameId)
      if (players?.get(ws.data.userId) === ws) {
        players.delete(ws.data.userId)
      }
    }
  },
}
