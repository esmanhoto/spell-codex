import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import {
  getGame, getGamePlayers,
  reconstructState,
  lastSequence, saveAction,
  setGameStatus, touchGame,
  hashState,
} from "@spell/db"
import { applyMove, pickMove } from "@spell/engine"

// ─── Move schema ──────────────────────────────────────────────────────────────
// We accept any JSON object with a `type` string — the engine validates the rest.

const MoveSchema = z.object({
  type: z.string(),
}).passthrough()

export const movesRouter = new Hono<{ Variables: { userId: string } }>()

// ─── POST /games/:id/moves ────────────────────────────────────────────────────

movesRouter.post("/:id/moves", zValidator("json", MoveSchema), async (c) => {
  const userId = c.get("userId")
  const gameId = c.req.param("id")
  const move   = c.req.valid("json") as { type: string }

  // 1. Load game row
  const game = await getGame(gameId)
  if (!game)                     return c.json({ error: "Game not found" }, 404)
  if (game.status !== "active" &&
      game.status !== "waiting") return c.json({ error: "Game is not in progress" }, 409)

  // 2. Verify the requester is a participant
  const players = await getGamePlayers(gameId)
  const isPlayer = players.some(p => p.userId === userId)
  if (!isPlayer) return c.json({ error: "Forbidden" }, 403)

  // 3. Reconstruct current state
  const { state } = await reconstructState(gameId, game.seed)

  // 4. Verify it is this player's turn
  if (state.activePlayer !== userId) {
    return c.json({ error: "Not your turn" }, 409)
  }

  // 5. Apply the move through the engine (throws EngineError on invalid moves)
  let result
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = applyMove(state, userId, move as any)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid move"
    return c.json({ error: message }, 422)
  }

  // 6. Persist the human move
  let seq = await lastSequence(gameId)
  const action = await saveAction({
    gameId,
    sequence:  seq + 1,
    playerId:  userId,
    move:      move as Parameters<typeof saveAction>[0]["move"],
    stateHash: hashState(result.newState),
  })
  seq = action.sequence

  // 7. Auto-apply bot moves until it is a human's turn (or game over).
  //    Safety cap: 200 iterations prevents infinite loops on degenerate states.
  const botPlayerIds = new Set(players.filter(p => p.isBot).map(p => p.userId))
  let currentState = result.newState
  let iterations = 0

  while (!currentState.winner && botPlayerIds.has(currentState.activePlayer) && iterations < 200) {
    iterations++
    const botId   = currentState.activePlayer
    const botMove = pickMove(currentState, botId)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const botResult = applyMove(currentState, botId, botMove as any)
    seq++
    await saveAction({
      gameId,
      sequence:  seq,
      playerId:  botId,
      move:      botMove as Parameters<typeof saveAction>[0]["move"],
      stateHash: hashState(botResult.newState),
    })
    currentState = botResult.newState
  }

  // 8. Update game metadata + set the next turn deadline (24 h from now)
  const TURN_DEADLINE_MS = 24 * 60 * 60 * 1000
  const newStatus    = currentState.winner ? "finished" : "active"
  const turnDeadline = currentState.winner ? undefined : new Date(Date.now() + TURN_DEADLINE_MS)
  await Promise.all([
    setGameStatus(gameId, newStatus, currentState.winner ?? undefined),
    touchGame(gameId, turnDeadline),
  ])

  return c.json({
    sequence:     seq,
    phase:        currentState.phase,
    activePlayer: currentState.winner ? null : currentState.activePlayer,
    events:       result.events,
    winner:       currentState.winner ?? null,
  }, 201)
})

