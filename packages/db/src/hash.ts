import type { GameState } from "@spell/engine"
import { createHash } from "crypto"

/**
 * Returns a SHA-256 hex digest of the board state (excludes `events`).
 * Events are derived from moves and grow linearly — excluding them keeps
 * hash cost O(1) regardless of game length.
 * Stored alongside every game_action row to detect replay divergence.
 */
export function hashState(state: GameState): string {
  const { events: _events, ...boardState } = state
  const json = JSON.stringify(boardState)
  return createHash("sha256").update(json).digest("hex")
}
