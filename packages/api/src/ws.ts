import type { ServerWebSocket } from "bun"
import {
  getGame,
  getGamePlayers,
  reconstructState,
  lastSequence,
  saveAction,
  setGameStatus,
  touchGame,
  hashState,
} from "@spell/db"
import { applyMove, EngineError } from "@spell/engine"
import { serializeGameState } from "./serialize.ts"
import { authBypassEnabled, verifySupabaseAccessToken } from "./auth-verify.ts"

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClientMessage =
  | { type: "JOIN_GAME"; gameId: string; token?: string; playerId?: string }
  | { type: "SUBMIT_MOVE"; gameId: string; move: { type: string; [key: string]: unknown } }
  | { type: "PING" }

export type ServerMessage =
  | { type: "STATE_UPDATE"; gameId: string; state: unknown }
  | { type: "GAME_OVER"; gameId: string; winner: string }
  | { type: "PONG" }
  | { type: "ERROR"; code: string; message: string }

// ─── Connection registry ──────────────────────────────────────────────────────

// gameId → playerId → socket
const registry = new Map<string, Map<string, ServerWebSocket<WsData>>>()

interface WsData {
  gameId: string | null
  userId: string | null
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
  const game = await getGame(gameId)
  if (!game) return { ok: false, code: "NOT_FOUND", message: "Game not found" }
  if (game.status !== "active") {
    return { ok: false, code: "GAME_ENDED", message: "Game is not active" }
  }

  const players = await getGamePlayers(gameId)
  if (!players.some((p) => p.userId === userId)) {
    return { ok: false, code: "FORBIDDEN", message: "Not a participant" }
  }

  const { state } = await reconstructState(gameId, game.seed)

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

  let seq = await lastSequence(gameId)
  const action = await saveAction({
    gameId,
    sequence: seq + 1,
    playerId: userId,
    move: move as Parameters<typeof saveAction>[0]["move"],
    stateHash: hashState(result.newState),
  })
  seq = action.sequence

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
  if (sockets) {
    for (const [viewerPlayerId, socket] of sockets.entries()) {
      send(socket, {
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
      })
    }
  }

  if (result.newState.winner) {
    broadcastToGame(gameId, { type: "GAME_OVER", gameId, winner: result.newState.winner })
  }

  return { ok: true }
}

// ─── WebSocket handlers ───────────────────────────────────────────────────────

export const wsHandlers = {
  open(ws: ServerWebSocket<WsData>) {
    ws.data = { gameId: null, userId: null }
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
          const { gameId } = msg
          let userId: string | null = null

          if (typeof msg.token === "string" && msg.token.length > 0) {
            try {
              userId = await verifySupabaseAccessToken(msg.token)
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
          } else {
            send(ws, { type: "ERROR", code: "UNAUTHORIZED", message: "Missing authentication" })
            return
          }

          // Verify participant
          const game = await getGame(gameId)
          if (!game) {
            send(ws, { type: "ERROR", code: "NOT_FOUND", message: "Game not found" })
            return
          }
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

          ws.data = { gameId, userId }
          if (!registry.has(gameId)) registry.set(gameId, new Map())
          registry.get(gameId)!.set(userId, ws)

          // Send current state (serialized to the API shape the client expects)
          const { state } = await reconstructState(gameId, game.seed)
          send(ws, {
            type: "STATE_UPDATE",
            gameId,
            state: serializeGameState(state, undefined, userId),
          })
          return
        }

        case "SUBMIT_MOVE": {
          const { gameId, move } = msg
          if (!ws.data.userId || !ws.data.gameId) {
            send(ws, { type: "ERROR", code: "NOT_JOINED", message: "Join a game first" })
            return
          }
          if (ws.data.gameId !== gameId) {
            send(ws, {
              type: "ERROR",
              code: "GAME_MISMATCH",
              message: "Socket joined to a different game",
            })
            return
          }
          const result = await processWsMove(gameId, ws.data.userId, move)
          if (!result.ok) {
            send(ws, { type: "ERROR", code: result.code, message: result.message })
          }
          return
        }

        default:
          send(ws, { type: "ERROR", code: "UNKNOWN_MSG", message: "Unknown message type" })
      }
    } catch (err) {
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
