import type { GameState } from "@spell/engine"

const EVICT_AFTER_MS = 30 * 60 * 1000 // 30 minutes

interface CacheEntry {
  state: GameState
  sequence: number
  lastAccessedAt: number
}

const cache = new Map<string, CacheEntry>()

/** Returns the cached state only if the stored sequence matches the expected one. */
export function getCachedState(gameId: string, sequence: number): GameState | null {
  const entry = cache.get(gameId)
  if (!entry || entry.sequence !== sequence) return null
  entry.lastAccessedAt = Date.now()
  return entry.state
}

export function setCachedState(gameId: string, state: GameState, sequence: number): void {
  cache.set(gameId, { state, sequence, lastAccessedAt: Date.now() })
}

export function evictCachedState(gameId: string): void {
  cache.delete(gameId)
}

// Evict entries idle for 30+ minutes; check every 5 minutes.
// .unref() prevents this timer from keeping the process alive.
const evictTimer = setInterval(
  () => {
    const cutoff = Date.now() - EVICT_AFTER_MS
    for (const [gameId, entry] of cache.entries()) {
      if (entry.lastAccessedAt < cutoff) cache.delete(gameId)
    }
  },
  5 * 60 * 1000,
)
// @ts-expect-error — Bun's Timer has unref()
evictTimer.unref?.()
