/**
 * Deadline checker — runs on a fixed interval.
 *
 * For each active game whose turnDeadline has passed, the current player's
 * turn is automatically forfeited with a PASS move. If that player has
 * repeatedly missed deadlines (3+ in a row) the game is abandoned instead.
 *
 * Concurrency note: this runs in-process. For multi-instance deployments,
 * a Postgres advisory lock or an external scheduler (pg_cron, Inngest) would
 * be needed. Fine for the single-server async MVP.
 */

import {
  findExpiredGames,
  getGame,
  getGamePlayers,
  reconstructState,
  lastSequence,
  setGameStatus,
} from "@spell/db"
import { applyMove } from "@spell/engine"
import { persistMoveResult } from "./game-ops.ts"

const CHECK_INTERVAL_MS = 60 * 1000 // check every minute
const MAX_MISSED_TURNS = 3 // abandon after 3 consecutive misses

export function startDeadlineChecker(): ReturnType<typeof setInterval> {
  return setInterval(processExpiredGames, CHECK_INTERVAL_MS)
}

export async function processExpiredGames(): Promise<void> {
  const expired = await findExpiredGames()
  if (expired.length === 0) return

  console.log(`[deadline] Processing ${expired.length} expired game(s)`)

  await Promise.allSettled(expired.map((game) => processExpiredGame(game.id)))
}

async function processExpiredGame(gameId: string): Promise<void> {
  const game = await getGame(gameId)
  if (!game || game.status !== "active") return

  const { state } = await reconstructState(gameId, game.seed)
  const playerId = state.activePlayer

  const players = await getGamePlayers(gameId)
  const isPlayer = players.some((p) => p.userId === playerId)
  if (!isPlayer) return

  let result
  try {
    result = applyMove(state, playerId, { type: "PASS" })
  } catch {
    console.warn(`[deadline] PASS not legal for game ${gameId}, skipping`)
    return
  }

  const seq = await lastSequence(gameId)

  // Count consecutive missed deadlines (rudimentary — good enough for MVP)
  const missedKey = `auto_pass_count:${playerId}`
  const missedCount = (game as unknown as Record<string, number>)[missedKey] ?? 0

  if (missedCount >= MAX_MISSED_TURNS - 1) {
    await setGameStatus(gameId, "abandoned")
    console.log(
      `[deadline] Game ${gameId} abandoned — player ${playerId} missed ${MAX_MISSED_TURNS} turns`,
    )
    return
  }

  await persistMoveResult(gameId, playerId, { type: "PASS" }, result.newState, seq)
  console.log(`[deadline] Auto-PASS for player ${playerId} in game ${gameId}`)
}
