import type { ServerWebSocket } from "bun"
import { getGamePlayers, lastSequence, reconstructState, hashState } from "@spell/db"
// lastSequence + reconstructState needed for JOIN_GAME fallback on finished games
import { applyMove, EngineError } from "@spell/engine"
import type { GameState } from "@spell/engine"
import { serializeGameState } from "./serialize.ts"
import { authBypassEnabled, verifySupabaseAccessTokenFull } from "./auth-verify.ts"
import { getGameCache } from "./state-cache.ts"
import { resolveGame } from "./utils.ts"
import { loadGameState, persistMoveResult } from "./game-ops.ts"

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strip opponent's hidden information (hand, drawPile) before sending over WS. */
export function filterStateForPlayer(state: GameState, viewerId: string): GameState {
  const filteredPlayers = { ...state.players }
  for (const id of Object.keys(filteredPlayers)) {
    if (id !== viewerId) {
      filteredPlayers[id] = { ...filteredPlayers[id]!, hand: [], drawPile: [] }
    }
  }
  return { ...state, players: filteredPlayers }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClientMessage =
  | { type: "JOIN_GAME"; gameId: string; token?: string; playerId?: string }
  | { type: "SUBMIT_MOVE"; gameId: string; move: { type: string; [key: string]: unknown } }
  | { type: "SYNC_REQUEST"; gameId: string }
  | { type: "CHAT_MSG"; text: string }
  | { type: "CHAT_EMOTE"; emote: string }
  | { type: "PING" }

export type ServerMessage =
  | {
      type: "STATE_UPDATE"
      gameId: string
      state: unknown
      /** Filtered engine GameState — sent on JOIN_GAME and SYNC_REQUEST for client-side engine init */
      rawEngineState?: GameState
      sequence?: number
      /** Per-player filtered state hash for reconciliation */
      stateHash?: string
    }
  | {
      /** Delta update — replaces STATE_UPDATE in the move broadcast path */
      type: "MOVE_APPLIED"
      gameId: string
      /** Player who submitted the move */
      playerId: string
      move: { type: string; [key: string]: unknown }
      stateHash: string
      sequence: number
      turnDeadline: string | null
      status: string
      winner: string | null
    }
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

const WS_IDLE_TIMEOUT_MS = 5_000

interface WsData {
  gameId: string | null
  userId: string | null
  displayName: string | null
  lastChatTs: number
  idleTimer: ReturnType<typeof setTimeout> | null
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

const BLOCKED_MOVE_TYPES = new Set(["DEV_GIVE_CARD"])

export async function processWsMove(
  gameId: string,
  userId: string,
  move: { type: string; [key: string]: unknown },
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  if (BLOCKED_MOVE_TYPES.has(move.type)) {
    return { ok: false, code: "BLOCKED_MOVE", message: "Blocked move type" }
  }
  // Overwrite playerId with authenticated userId to prevent forging
  const safeMove = { ...move, playerId: userId }
  const t0 = performance.now()

  const loaded = await loadGameState(gameId)
  if (!loaded) return { ok: false, code: "NOT_FOUND", message: "Game not found or not active" }
  if (!loaded.playerIds.includes(userId)) {
    return { ok: false, code: "FORBIDDEN", message: "Not a participant" }
  }

  const { state, sequence: seq0, cacheHit } = loaded
  const t1 = performance.now()

  let result
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = applyMove(state, userId, safeMove as any)
  } catch (err) {
    if (err instanceof EngineError) {
      return { ok: false, code: err.code, message: err.message }
    }
    const message = err instanceof Error ? err.message : "Invalid move"
    return { ok: false, code: "INVALID_MOVE", message }
  }
  const t2 = performance.now()

  const tHashStart = performance.now()
  const {
    sequence: seq,
    turnDeadline,
  } = await persistMoveResult(gameId, userId, safeMove, result.newState, seq0)
  const tHashEnd = performance.now()

  // Broadcast delta update to each player with per-player filtered hash
  const sockets = registry.get(gameId)
  let broadcastBytes = 0
  const tSerializeStart = performance.now()
  if (sockets) {
    for (const [viewerId, socket] of sockets.entries()) {
      const filteredHash = hashState(filterStateForPlayer(result.newState, viewerId))
      const msg: ServerMessage = {
        type: "MOVE_APPLIED",
        gameId,
        playerId: userId,
        move: safeMove,
        stateHash: filteredHash,
        sequence: seq,
        turnDeadline: turnDeadline ? turnDeadline.toISOString() : null,
        status: result.newState.winner ? "finished" : "active",
        winner: result.newState.winner ?? null,
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
      cache_hit: cacheHit,
      actions_replayed: seq0 + 1,
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
    const idleTimer = setTimeout(() => {
      if (!ws.data.userId) {
        try {
          ws.close(4001, "Idle timeout — authenticate within 5 seconds")
        } catch {
          // Socket may already be closed
        }
      }
    }, WS_IDLE_TIMEOUT_MS)
    ws.data = { gameId: null, userId: null, displayName: null, lastChatTs: 0, idleTimer }
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
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(msg.playerId)
          ) {
            userId = msg.playerId
            displayName = null
          } else {
            send(ws, { type: "ERROR", code: "UNAUTHORIZED", message: "Missing authentication" })
            return
          }

          // Resolve slug or UUID → canonical game record
          const game = await resolveGame(idOrSlug)
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

          if (ws.data.idleTimer) clearTimeout(ws.data.idleTimer)
          ws.data = { gameId, userId, displayName, lastChatTs: ws.data.lastChatTs, idleTimer: null }
          if (!registry.has(gameId)) registry.set(gameId, new Map())
          registry.get(gameId)!.set(userId, ws)

          // Send current state (serialized to the API shape the client expects)
          const loaded = await loadGameState(gameId)
          // If game can't be loaded (e.g. finished), reconstruct directly
          let joinState: GameState
          let joinSeq: number
          if (loaded) {
            joinState = loaded.state
            joinSeq = loaded.sequence
          } else {
            // Fallback for non-active games (e.g. finished)
            joinSeq = await lastSequence(gameId)
            const { state: reconstructed } = await reconstructState(
              gameId,
              game.seed,
              (game.stateSnapshot as GameState | null) ?? null,
            )
            joinState = reconstructed
          }
          const filteredJoin = filterStateForPlayer(joinState, userId)
          send(ws, {
            type: "STATE_UPDATE",
            gameId,
            state: serializeGameState(joinState, { includeDeckImages: true }, userId),
            rawEngineState: filteredJoin,
            sequence: joinSeq,
            stateHash: hashState(filteredJoin),
          })
          return
        }

        case "SYNC_REQUEST": {
          const { gameId: syncGameId } = msg
          if (!ws.data.userId) {
            send(ws, { type: "ERROR", code: "NOT_JOINED", message: "Join a game first" })
            return
          }
          const syncHit = getGameCache(syncGameId)
          if (!syncHit) {
            send(ws, { type: "ERROR", code: "NOT_FOUND", message: "Game state unavailable" })
            return
          }
          if (!syncHit.playerIds.includes(ws.data.userId)) {
            send(ws, { type: "ERROR", code: "FORBIDDEN", message: "Not a participant" })
            return
          }
          const filteredSync = filterStateForPlayer(syncHit.state, ws.data.userId)
          send(ws, {
            type: "STATE_UPDATE",
            gameId: syncGameId,
            state: serializeGameState(
              syncHit.state,
              { status: syncHit.state.winner ? "finished" : "active" },
              ws.data.userId,
            ),
            rawEngineState: filteredSync,
            sequence: syncHit.sequence,
            stateHash: hashState(filteredSync),
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
          const text = msg.text.trim().slice(0, 500).replace(/<[^>]*>/g, "")
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
      const message = err instanceof Error ? err.message : String(err)
      if (process.env["NODE_ENV"] === "production") {
        console.error(JSON.stringify({ error: message, context: "ws_message_handler" }))
      } else {
        console.error("[ws] Unhandled error in message handler:", err)
      }
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
    if (ws.data.idleTimer) clearTimeout(ws.data.idleTimer)
    if (ws.data.gameId && ws.data.userId) {
      const players = registry.get(ws.data.gameId)
      if (players?.get(ws.data.userId) === ws) {
        players.delete(ws.data.userId)
      }
    }
  },
}
