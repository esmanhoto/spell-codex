import type { GameState } from "@spell/engine"
import { createHash } from "crypto"

/**
 * Returns a SHA-256 hex digest of the serialised GameState.
 * Stored alongside every game_action row to detect replay divergence.
 */
export function hashState(state: GameState): string {
  const json = JSON.stringify(state)
  return createHash("sha256").update(json).digest("hex")
}
