import type { ServerWebSocket } from "bun"
import {
  getGame, getGamePlayers,
  reconstructState, lastSequence, saveAction,
  setGameStatus, touchGame, hashState,
} from "@spell/db"
import { applyMove } from "@spell/engine"
import { serializeGameState } from "./serialize.ts"

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClientMessage =
  | { type: "JOIN_GAME";   gameId: string; playerId: string }
  | { type: "SUBMIT_MOVE"; gameId: string; playerId: string; move: { type: string; [key: string]: unknown } }
  | { type: "PING" }

export type ServerMessage =
  | { type: "STATE_UPDATE";            gameId: string; state: unknown }
  | { type: "RESPONSE_WINDOW_OPEN";    gameId: string; respondingPlayerId: string; effectCardName: string; effectCardDescription: string }
  | { type: "RESPONSE_WINDOW_CLOSED";  gameId: string }
  | { type: "GAME_OVER";               gameId: string; winner: string }
  | { type: "PONG" }
  | { type: "ERROR";                   code: string; message: string }

// ─── Connection registry ──────────────────────────────────────────────────────

// gameId → playerId → socket
const registry = new Map<string, Map<string, ServerWebSocket<WsData>>>()

interface WsData {
  gameId:   string | null
  playerId: string | null
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

// ─── Move processing (shared with HTTP route for bot games) ──────────────────

const TURN_DEADLINE_MS = 24 * 60 * 60 * 1000

export async function processWsMove(
  gameId: string,
  userId: string,
  move: { type: string; [key: string]: unknown },
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const game = await getGame(gameId)
  if (!game) return { ok: false, code: "NOT_FOUND", message: "Game not found" }
  if (game.status !== "active" && game.status !== "waiting") {
    return { ok: false, code: "GAME_ENDED", message: "Game is not in progress" }
  }

  const players = await getGamePlayers(gameId)
  if (!players.some(p => p.userId === userId)) {
    return { ok: false, code: "FORBIDDEN", message: "Not a participant" }
  }

  const { state } = await reconstructState(gameId, game.seed)

  if (state.activePlayer !== userId) {
    return { ok: false, code: "NOT_YOUR_TURN", message: "Not your turn" }
  }

  let result
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = applyMove(state, userId, move as any)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid move"
    return { ok: false, code: "INVALID_MOVE", message }
  }

  let seq = await lastSequence(gameId)
  const action = await saveAction({
    gameId,
    sequence:  seq + 1,
    playerId:  userId,
    move:      move as Parameters<typeof saveAction>[0]["move"],
    stateHash: hashState(result.newState),
  })
  seq = action.sequence

  const newStatus    = result.newState.winner ? "finished" : "active"
  const turnDeadline = result.newState.winner ? undefined : new Date(Date.now() + TURN_DEADLINE_MS)
  await Promise.all([
    setGameStatus(gameId, newStatus, result.newState.winner ?? undefined),
    touchGame(gameId, turnDeadline),
  ])

  // Broadcast updated state to all players in the game (player-specific visibility)
  const newTurnDeadline = result.newState.winner ? null : new Date(Date.now() + TURN_DEADLINE_MS).toISOString()
  const sockets = registry.get(gameId)
  if (sockets) {
    for (const [viewerPlayerId, socket] of sockets.entries()) {
      send(socket, {
        type:  "STATE_UPDATE",
        gameId,
        state: serializeGameState(result.newState, {
          status:      result.newState.winner ? "finished" : "active",
          turnDeadline: newTurnDeadline,
        }, viewerPlayerId),
      })
    }
  }

  if (result.newState.winner) {
    broadcastToGame(gameId, { type: "GAME_OVER", gameId, winner: result.newState.winner })
  } else if (result.newState.responseWindow) {
    broadcastToGame(gameId, {
      type:                  "RESPONSE_WINDOW_OPEN",
      gameId,
      respondingPlayerId:    result.newState.responseWindow.respondingPlayerId,
      effectCardName:        result.newState.responseWindow.effectCardName,
      effectCardDescription: result.newState.responseWindow.effectCardDescription,
    })
  } else if (!result.newState.responseWindow) {
    // Only close if previous state had one open (clients track this themselves)
    // The STATE_UPDATE already carries the full state so clients will self-correct
  }

  return { ok: true }
}

// ─── WebSocket handlers ───────────────────────────────────────────────────────

export const wsHandlers = {
  open(ws: ServerWebSocket<WsData>) {
    ws.data = { gameId: null, playerId: null }
  },

  async message(ws: ServerWebSocket<WsData>, raw: string | Buffer) {
    let msg: ClientMessage
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage
    } catch {
      send(ws, { type: "ERROR", code: "PARSE_ERROR", message: "Invalid JSON" })
      return
    }

    switch (msg.type) {
      case "PING":
        send(ws, { type: "PONG" })
        return

      case "JOIN_GAME": {
        const { gameId, playerId } = msg

        // Leave previous game if any
        if (ws.data.gameId) {
          registry.get(ws.data.gameId)?.delete(ws.data.playerId ?? "")
        }

        ws.data = { gameId, playerId }

        if (!registry.has(gameId)) registry.set(gameId, new Map())
        registry.get(gameId)!.set(playerId, ws)

        // Verify participant
        const game = await getGame(gameId)
        if (!game) {
          send(ws, { type: "ERROR", code: "NOT_FOUND", message: "Game not found" })
          return
        }
        const players = await getGamePlayers(gameId)
        if (!players.some(p => p.userId === playerId)) {
          send(ws, { type: "ERROR", code: "FORBIDDEN", message: "Not a participant" })
          return
        }

        // Send current state (serialized to the API shape the client expects)
        const { state } = await reconstructState(gameId, game.seed)
        send(ws, { type: "STATE_UPDATE", gameId, state: serializeGameState(state, undefined, playerId) })
        return
      }

      case "SUBMIT_MOVE": {
        const { gameId, playerId, move } = msg
        const result = await processWsMove(gameId, playerId, move)
        if (!result.ok) {
          send(ws, { type: "ERROR", code: result.code, message: result.message })
        }
        return
      }

      default:
        send(ws, { type: "ERROR", code: "UNKNOWN_MSG", message: "Unknown message type" })
    }
  },

  close(ws: ServerWebSocket<WsData>) {
    if (ws.data.gameId && ws.data.playerId) {
      registry.get(ws.data.gameId)?.delete(ws.data.playerId)
    }
  },
}
