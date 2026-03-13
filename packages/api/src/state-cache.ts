import type { GameState } from "@spell/engine"

const EVICT_AFTER_MS = 30 * 60 * 1000 // 30 minutes

interface CacheEntry {
  state: GameState
  sequence: number
  /** Player user IDs — for auth checks without DB query */
  playerIds: string[]
  /** Game seed — needed for reconstruction on cache miss */
  seed: number
  /** State snapshot — needed for reconstruction on cache miss */
  stateSnapshot: GameState | null
  lastAccessedAt: number
}

/** Result of a full cache lookup — everything needed to process a move without DB reads. */
export interface GameCacheHit {
  state: GameState
  sequence: number
  playerIds: string[]
}

const cache = new Map<string, CacheEntry>()

/**
 * Returns cached game data if available.
 * On hit, the caller can skip getGame/getGamePlayers/lastSequence entirely.
 */
export function getGameCache(gameId: string): GameCacheHit | null {
  const entry = cache.get(gameId)
  if (!entry) return null
  entry.lastAccessedAt = Date.now()
  return { state: entry.state, sequence: entry.sequence, playerIds: entry.playerIds }
}

/** Returns seed + stateSnapshot from cache (for reconstruction on sequence mismatch). */
export function getCachedMeta(
  gameId: string,
): { seed: number; stateSnapshot: GameState | null } | null {
  const entry = cache.get(gameId)
  if (!entry) return null
  return { seed: entry.seed, stateSnapshot: entry.stateSnapshot }
}

export function setCachedState(
  gameId: string,
  state: GameState,
  sequence: number,
  meta?: { playerIds: string[]; seed: number; stateSnapshot: GameState | null },
): void {
  const existing = cache.get(gameId)
  cache.set(gameId, {
    state,
    sequence,
    playerIds: meta?.playerIds ?? existing?.playerIds ?? [],
    seed: meta?.seed ?? existing?.seed ?? 0,
    stateSnapshot: meta?.stateSnapshot ?? existing?.stateSnapshot ?? null,
    lastAccessedAt: Date.now(),
  })
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
evictTimer.unref()
