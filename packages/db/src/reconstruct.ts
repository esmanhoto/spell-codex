import { initGame, applyMove } from "@spell/engine"
import type { GameState, Move, CardData, PlayMode } from "@spell/engine"
import { hashState } from "./hash.ts"
import { listActions } from "./actions.ts"
import { getGamePlayers } from "./games.ts"

export interface ReconstructError {
  kind:     "hash_mismatch" | "engine_error"
  sequence: number
  message:  string
}

export interface ReconstructResult {
  state:  GameState
  errors: ReconstructError[]
}

/**
 * Rebuilds the current GameState for a game by replaying every stored action
 * through the engine in sequence order.
 *
 * Hash mismatches are collected as non-fatal errors (the replay continues with
 * the engine's output) so callers can detect and log integrity issues without
 * crashing.
 */
export async function reconstructState(
  gameId: string,
  seed:   number,
  playMode: PlayMode = "full_manual",
): Promise<ReconstructResult> {
  const [players, actions] = await Promise.all([
    getGamePlayers(gameId),
    listActions(gameId),
  ])

  // Sort players by seat position so init gets them in the right order.
  const sorted = [...players].sort((a, b) => a.seatPosition - b.seatPosition)
  if (sorted.length < 2) {
    throw new Error("Cannot reconstruct waiting game before second player joins")
  }
  const [p1, p2] = sorted as [typeof sorted[0], typeof sorted[0]]

  const state = initGame({
    gameId,
    seed,
    playMode,
    players: [
      { id: p1.userId, deckCards: p1.deckSnapshot as CardData[] },
      { id: p2.userId, deckCards: p2.deckSnapshot as CardData[] },
    ],
  })

  const errors: ReconstructError[] = []
  let current: GameState = state

  for (const action of actions) {
    const move = action.move as Move

    let next
    try {
      next = applyMove(current, action.playerId, move)
    } catch (err) {
      errors.push({
        kind:     "engine_error",
        sequence: action.sequence,
        message:  err instanceof Error ? err.message : String(err),
      })
      // Keep current state — cannot apply this move.
      continue
    }

    current = next.newState

    const actualHash = hashState(current)
    if (actualHash !== action.stateHash) {
      errors.push({
        kind:     "hash_mismatch",
        sequence: action.sequence,
        message:  `expected ${action.stateHash}, got ${actualHash}`,
      })
    }
  }

  return { state: current, errors }
}
