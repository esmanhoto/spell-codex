import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { applyMove, EngineError } from "@spell/engine"
import type { AppVariables } from "../auth.ts"
import { loadGameState, persistMoveResult } from "../game-ops.ts"

// ─── Move schema ──────────────────────────────────────────────────────────────
// We accept any JSON object with a `type` string — the engine validates the rest.
// Dev-only move types are blocked at the API layer to prevent exploitation.

const BLOCKED_MOVE_TYPES = new Set(["DEV_GIVE_CARD"])

const MoveSchema = z
  .object({
    type: z.string().refine((t) => !BLOCKED_MOVE_TYPES.has(t), "Blocked move type"),
  })
  .passthrough()

export const movesRouter = new Hono<{ Variables: AppVariables }>()

// ─── POST /games/:id/moves ────────────────────────────────────────────────────

movesRouter.post("/:id/moves", zValidator("json", MoveSchema), async (c) => {
  const t0 = performance.now()
  const userId = c.get("userId")
  const gameId = c.req.param("id")
  const move = c.req.valid("json") as { type: string }

  const loaded = await loadGameState(gameId)
  if (!loaded) return c.json({ error: "Game not found or not active" }, 404)
  if (!loaded.playerIds.includes(userId)) return c.json({ error: "Forbidden" }, 403)

  const { state, sequence: seq0, cacheHit } = loaded
  const t1 = performance.now()

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

  const tHashStart = performance.now()
  const { sequence: seq } = await persistMoveResult(gameId, userId, move, result.newState, seq0)
  const tHashEnd = performance.now()

  const total = performance.now()
  console.log(
    JSON.stringify({
      perf: "move_http",
      game: gameId,
      seq,
      move_type: move.type,
      cache_hit: cacheHit,
      actions_replayed: seq0 + 1,
      reconstruct_ms: +(t1 - t0).toFixed(2),
      apply_move_ms: +(t2 - t1).toFixed(2),
      hash_ms: +(tHashEnd - tHashStart).toFixed(2),
      total_ms: +(total - t0).toFixed(2),
    }),
  )

  return c.json(
    {
      sequence: seq,
      phase: result.newState.phase,
      activePlayer: result.newState.winner ? null : result.newState.activePlayer,
      events: result.events,
      winner: result.newState.winner ?? null,
    },
    201,
  )
})
