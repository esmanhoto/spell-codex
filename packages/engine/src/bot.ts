import { getLegalMoves } from "./legal-moves.ts"
import type { GameState, Move, PlayerId } from "./types.ts"

/**
 * Level 1 bot: picks a random legal move.
 *
 * Pending effects (Tier 2) are always skipped — the bot cannot interactively
 * resolve complex effects. For everything else it chooses uniformly at random
 * from whatever getLegalMoves returns.
 */
export function pickMove(state: GameState, playerId: PlayerId): Move {
  const moves = getLegalMoves(state, playerId)

  // When an unresolvable effect is queued, always waive it.
  if (state.pendingEffects.length > 0) {
    const skip = moves.find(m => m.type === "SKIP_EFFECT")
    if (skip) return skip
  }

  return moves[Math.floor(Math.random() * moves.length)]!
}
