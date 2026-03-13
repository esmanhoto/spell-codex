import type { GameState } from "@spell/engine"

/**
 * Computes a SHA-256 hex digest of the board state (excludes `events`).
 * Mirrors packages/db/src/hash.ts — same JSON.stringify, same exclusion of events.
 * Uses Web Crypto API (available in all modern browsers and Bun).
 */
export async function hashEngineState(state: GameState): Promise<string> {
  const { events: _events, ...boardState } = state
  const json = JSON.stringify(boardState)
  const encoded = new TextEncoder().encode(json)
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}
