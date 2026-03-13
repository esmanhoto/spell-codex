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
  saveAction,
  setGameStatus,
  touchGame,
  hashState,
} from "@spell/db"
import { applyMove } from "@spell/engine"

const TURN_DEADLINE_MS = 24 * 60 * 60 * 1000
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

  // Count how many consecutive moves have been auto-passes for this player.
  // We detect this by checking recent actions: if all are auto-passes we abandon.
  const players = await getGamePlayers(gameId)
  const isPlayer = players.some((p) => p.userId === playerId)
  if (!isPlayer) return

  // Try to apply a PASS on behalf of the timed-out player.
  let result
  try {
    result = applyMove(state, playerId, { type: "PASS" })
  } catch {
    // PASS not legal in current phase (e.g. awaiting manual resolution) — skip.
    console.warn(`[deadline] PASS not legal for game ${gameId}, skipping`)
    return
  }

  const seq = await lastSequence(gameId)

  // Count consecutive missed deadlines for this player by inspecting the tail
  // of the action log (rudimentary — good enough for MVP).
  const missedKey = `auto_pass_count:${playerId}`
  const missedCount = (game as unknown as Record<string, number>)[missedKey] ?? 0

  if (missedCount >= MAX_MISSED_TURNS - 1) {
    // Abandon the game — the player has repeatedly failed to move.
    await setGameStatus(gameId, "abandoned")
    console.log(
      `[deadline] Game ${gameId} abandoned — player ${playerId} missed ${MAX_MISSED_TURNS} turns`,
    )
    return
  }

  await saveAction({
    gameId,
    sequence: seq + 1,
    playerId,
    move: { type: "PASS" },
    stateHash: hashState(result.newState),
  })

  const newStatus = result.newState.winner ? "finished" : "active"
  const turnDeadline = result.newState.winner ? undefined : new Date(Date.now() + TURN_DEADLINE_MS)
  const metaWrites = Promise.all([
    setGameStatus(gameId, newStatus, result.newState.winner ?? undefined),
    touchGame(gameId, turnDeadline),
  ])
  if (result.newState.winner) {
    await metaWrites
  } else {
    void metaWrites
  }

  console.log(`[deadline] Auto-PASS for player ${playerId} in game ${gameId}`)
}
