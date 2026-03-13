import { initGame, applyMove } from "@spell/engine"
import type { GameState, Move, CardData } from "@spell/engine"
import { listActions } from "./actions.ts"
import { getGamePlayers } from "./games.ts"

export interface ReconstructError {
  kind: "hash_mismatch" | "engine_error"
  sequence: number
  message: string
}

export interface ReconstructResult {
  state: GameState
  errors: ReconstructError[]
}

/**
 * Rebuilds the current GameState for a game by replaying every stored action
 * through the engine in sequence order.
 *
 * If `stateSnapshot` is provided (dev-only games), it is used as the starting
 * point instead of calling initGame(). Subsequent moves are replayed on top.
 *
 * Hash mismatches are collected as non-fatal errors (the replay continues with
 * the engine's output) so callers can detect and log integrity issues without
 * crashing.
 */
export async function reconstructState(
  gameId: string,
  seed: number,
  stateSnapshot?: GameState | null,
): Promise<ReconstructResult> {
  const [players, actions] = await Promise.all([getGamePlayers(gameId), listActions(gameId)])

  let current: GameState

  if (stateSnapshot) {
    current = stateSnapshot
  } else {
    // Sort players by seat position so init gets them in the right order.
    const sorted = [...players].sort((a, b) => a.seatPosition - b.seatPosition)
    if (sorted.length < 2) {
      throw new Error("Cannot reconstruct waiting game before second player joins")
    }
    const [p1, p2] = sorted as [(typeof sorted)[0], (typeof sorted)[0]]

    current = initGame({
      gameId,
      seed,
      players: [
        { id: p1.userId, deckCards: p1.deckSnapshot as CardData[] },
        { id: p2.userId, deckCards: p2.deckSnapshot as CardData[] },
      ],
    })
  }

  const errors: ReconstructError[] = []

  for (const action of actions) {
    const move = action.move as Move

    let next
    try {
      next = applyMove(current, action.playerId, move)
    } catch (err) {
      errors.push({
        kind: "engine_error",
        sequence: action.sequence,
        message: err instanceof Error ? err.message : String(err),
      })
      // Keep current state — cannot apply this move.
      continue
    }

    current = next.newState
  }

  return { state: current, errors }
}
