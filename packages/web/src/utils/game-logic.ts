import type { GameState as EngineGameState } from "@spell/engine"
import { applyMove } from "@spell/engine"
import { serializeEngineStateForClient } from "./client-serialize.ts"
import { cardImageUrl, CARD_BACK_URL } from "./card-helpers.ts"
import type { CardInfo, GameState, PlayerBoard } from "../api.ts"

/** Zero-out opponent hidden zones to match server-side filterStateForPlayer. */
export function filterLocalState(state: EngineGameState, viewerId: string): EngineGameState {
  const players = { ...state.players }
  for (const id of Object.keys(players)) {
    if (id !== viewerId) {
      players[id] = { ...players[id]!, hand: [], drawPile: [] }
    }
  }
  return { ...state, players }
}

export function collectCardImageUrls(deckCardImages?: Array<[string, number]>): string[] {
  const urls = new Set<string>()
  urls.add(CARD_BACK_URL)
  if (deckCardImages) {
    for (const [setId, cardNumber] of deckCardImages) {
      urls.add(cardImageUrl(setId, cardNumber))
    }
  }
  return [...urls]
}

export function buildLingeringSpellsByPlayer(
  playerIds: string[],
  boards: Record<string, PlayerBoard> | undefined,
): Record<string, CardInfo[]> {
  const result = Object.fromEntries(playerIds.map((id) => [id, [] as CardInfo[]]))
  if (!boards) return result
  for (const id of playerIds) {
    result[id] = boards[id]?.lastingEffects ?? []
  }
  return result
}

/**
 * Core MOVE_APPLIED pipeline: apply an engine move locally and derive the API state.
 * Returns null if the move fails (caller should request a sync).
 */
export function applyMoveLocally(args: {
  engineState: EngineGameState
  playerId: string
  move: unknown
  viewerId: string
  status: string
  turnDeadline: string | null
  winner: string | null
  currentApiState?: GameState | undefined
}): {
  newEngineState: EngineGameState
  apiState: GameState
} | null {
  const { engineState, playerId, move, viewerId, status, turnDeadline, winner, currentApiState } = args
  let newEngineState: EngineGameState
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = applyMove(engineState, playerId, move as any)
    newEngineState = result.newState
  } catch {
    return null
  }

  const apiState = serializeEngineStateForClient(newEngineState, viewerId, {
    status,
    turnDeadline,
    winner,
    players: currentApiState?.players,
  })

  const merged: GameState = {
    ...(currentApiState ?? {}),
    ...apiState,
    ...(currentApiState?.deckCardImages ? { deckCardImages: currentApiState.deckCardImages } : {}),
  }

  return { newEngineState, apiState: merged }
}
