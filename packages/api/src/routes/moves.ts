import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
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
import type { GameState } from "@spell/engine"
import type { AppVariables } from "../auth.ts"
import { getGameCache, setCachedState, evictCachedState } from "../state-cache.ts"

// ─── Move schema ──────────────────────────────────────────────────────────────
// We accept any JSON object with a `type` string — the engine validates the rest.

const MoveSchema = z
  .object({
    type: z.string(),
  })
  .passthrough()

export const movesRouter = new Hono<{ Variables: AppVariables }>()

// ─── POST /games/:id/moves ────────────────────────────────────────────────────

movesRouter.post("/:id/moves", zValidator("json", MoveSchema), async (c) => {
  const t0 = performance.now()
  const userId = c.get("userId")
  const gameId = c.req.param("id")
  const move = c.req.valid("json") as { type: string }

  // Try cache first — on hit, skip all DB reads
  const hit = getGameCache(gameId)
  let state: GameState
  let seq0: number
  let cacheHit: boolean

  if (hit) {
    if (!hit.playerIds.includes(userId)) {
      return c.json({ error: "Forbidden" }, 403)
    }
    state = hit.state
    seq0 = hit.sequence
    cacheHit = true
  } else {
    // Cache miss — fall back to DB
    const game = await getGame(gameId)
    if (!game) return c.json({ error: "Game not found" }, 404)
    if (game.status !== "active") return c.json({ error: "Game is not active" }, 409)

    const players = await getGamePlayers(gameId)
    if (!players.some((p) => p.userId === userId)) {
      return c.json({ error: "Forbidden" }, 403)
    }

    seq0 = await lastSequence(gameId)
    const { state: reconstructed } = await reconstructState(gameId, game.seed)
    state = reconstructed
    const playerIds = players.map((p) => p.userId)
    setCachedState(gameId, state, seq0, {
      playerIds,
      seed: game.seed,
      stateSnapshot: null,
    })
    cacheHit = false
  }
  const t1 = performance.now()

  // 4. Apply the move through the engine (throws EngineError on invalid moves)
  let result
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = applyMove(state, userId, move as any)
  } catch (err) {
    if (err instanceof EngineError) {
      return c.json({ error: err.message, code: err.code }, 422)
    }
    const message = err instanceof Error ? err.message : "Invalid move"
    return c.json({ error: message, code: "INVALID_MOVE" }, 422)
  }
  const t2 = performance.now()

  // 6. Persist the human move
  let seq = seq0
  const actionsReplayed = seq + 1

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

  const currentState = result.newState

  // Update in-memory cache with the newly applied state
  setCachedState(gameId, currentState, seq)
  if (currentState.winner) evictCachedState(gameId)

  // 8. Update game metadata + set the next turn deadline (24 h from now)
  const TURN_DEADLINE_MS = 24 * 60 * 60 * 1000
  const newStatus = currentState.winner ? "finished" : "active"
  const turnDeadline = currentState.winner ? undefined : new Date(Date.now() + TURN_DEADLINE_MS)
  await Promise.all([
    setGameStatus(gameId, newStatus, currentState.winner ?? undefined),
    touchGame(gameId, turnDeadline),
  ])

  const total = performance.now()
  console.log(
    JSON.stringify({
      perf: "move_http",
      game: gameId,
      seq,
      move_type: move.type,
      cache_hit: cacheHit,
      actions_replayed: actionsReplayed,
      reconstruct_ms: +(t1 - t0).toFixed(2),
      apply_move_ms: +(t2 - t1).toFixed(2),
      hash_ms: +(tHashEnd - tHashStart).toFixed(2),
      total_ms: +(total - t0).toFixed(2),
    }),
  )

  return c.json(
    {
      sequence: seq,
      phase: currentState.phase,
      activePlayer: currentState.winner ? null : currentState.activePlayer,
      events: result.events,
      winner: currentState.winner ?? null,
    },
    201,
  )
})
