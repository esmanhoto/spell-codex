/**
 * Shared game operation helpers — state loading, move persistence, and metadata.
 */
import {
  getGame,
  getGamePlayers,
  reconstructState,
  lastSequence,
  saveAction,
  setGameStatus,
  touchGame,
  hashState,
} from "@spell/db"
import type { GameState } from "@spell/engine"
import { getGameCache, setCachedState, evictCachedState } from "./state-cache.ts"

const TURN_DEADLINE_MS = 24 * 60 * 60 * 1000

export interface LoadedGameState {
  state: GameState
  sequence: number
  playerIds: string[]
  cacheHit: boolean
}

/**
 * Loads game state from cache or DB. Returns null if game not found or not active.
 */
export async function loadGameState(gameId: string): Promise<LoadedGameState | null> {
  const hit = getGameCache(gameId)
  if (hit) {
    return { state: hit.state, sequence: hit.sequence, playerIds: hit.playerIds, cacheHit: true }
  }

  const game = await getGame(gameId)
  if (!game || game.status !== "active") return null

  const players = await getGamePlayers(gameId)
  const playerIds = players.map((p) => p.userId)
  const seq = await lastSequence(gameId)
  const { state } = await reconstructState(
    gameId,
    game.seed,
    (game.stateSnapshot as GameState | null) ?? null,
  )
  setCachedState(gameId, state, seq, {
    playerIds,
    seed: game.seed,
    stateSnapshot: (game.stateSnapshot as GameState | null) ?? null,
  })
  return { state, sequence: seq, playerIds, cacheHit: false }
}

/**
 * Persists a move result: hash state, save action, update cache + game metadata.
 * Returns the new sequence number and state hash.
 */
export async function persistMoveResult(
  gameId: string,
  playerId: string,
  move: { type: string; [key: string]: unknown },
  newState: GameState,
  prevSequence: number,
): Promise<{ sequence: number; stateHash: string; turnDeadline: Date | undefined }> {
  const stateHash = hashState(newState)
  const action = await saveAction({
    gameId,
    sequence: prevSequence + 1,
    playerId,
    move: move as Parameters<typeof saveAction>[0]["move"],
    stateHash,
  })
  const seq = action.sequence

  setCachedState(gameId, newState, seq)
  if (newState.winner) evictCachedState(gameId)

  const newStatus = newState.winner ? "finished" : "active"
  const turnDeadline = newState.winner ? undefined : new Date(Date.now() + TURN_DEADLINE_MS)
  const metaWrites = Promise.all([
    setGameStatus(gameId, newStatus, newState.winner ?? undefined),
    touchGame(gameId, turnDeadline),
  ])
  if (newState.winner) {
    await metaWrites
  } else {
    void metaWrites
  }

  return { sequence: seq, stateHash, turnDeadline }
}
