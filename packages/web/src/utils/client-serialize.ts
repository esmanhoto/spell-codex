/**
 * Client-side serialization — transforms engine GameState into the web client's shape.
 * Uses shared serializers from @spell/engine for card/formation/pool/combat.
 */

import {
  getLegalMoves,
  HAND_SIZES,
  serializeCard,
  serializeFormation,
  serializePool,
  serializeCombat,
} from "@spell/engine"
import type { GameState as EngineGameState } from "@spell/engine"
import type { GameState as ClientGameState } from "../api.ts"

/**
 * Produces the client GameState shape from the engine's internal state.
 * Only serializes from the perspective of `viewerPlayerId` (opponent hand is hidden).
 */
export function serializeEngineStateForClient(
  state: EngineGameState,
  viewerPlayerId: string,
  extra: {
    status: string
    turnDeadline: string | null
    winner: string | null
    sequence?: number
    /** Preserved from the initial load — not re-computed on delta updates */
    players?: ClientGameState["players"]
  },
): Omit<ClientGameState, "deckCardImages"> {
  const legalMoves = getLegalMoves(state, viewerPlayerId)

  const board = {
    players: Object.fromEntries(
      Object.entries(state.players).map(([id, p]) => [
        id,
        {
          hand: viewerPlayerId === id ? p.hand.map(serializeCard) : [],
          handCount: p.hand.length,
          handHidden: viewerPlayerId !== id,
          formation: serializeFormation(p.formation, id, viewerPlayerId),
          pool: serializePool(p.pool),
          drawPileCount: p.drawPile.length,
          discardCount: p.discardPile.length,
          discardPile: p.discardPile.map(serializeCard),
          lastingEffects: p.lastingEffects.map(serializeCard),
        },
      ]),
    ),
    combat: state.combatState ? serializeCombat(state) : null,
  }

  return {
    gameId: state.id,
    viewerPlayerId,
    playerOrder: state.playerOrder,
    status: extra.status,
    phase: state.phase,
    activePlayer: state.activePlayer,
    turnNumber: state.currentTurn,
    turnDeadline: extra.turnDeadline,
    winner: extra.winner,
    handMaxSize: state.players[viewerPlayerId]?.maxHandSizeOverride
      ?? HAND_SIZES[state.deckSize]?.maxEnd ?? 8,
    legalMoves,
    legalMovesPerPlayer: { [viewerPlayerId]: legalMoves },
    board,
    events: state.events,
    resolutionContext: state.resolutionContext
      ? {
          cardInstanceId: state.resolutionContext.cardInstanceId,
          pendingCard: serializeCard(state.resolutionContext.pendingCard),
          initiatingPlayer: state.resolutionContext.initiatingPlayer,
          resolvingPlayer: state.resolutionContext.resolvingPlayer,
          cardDestination: state.resolutionContext.cardDestination,
          attachTarget: state.resolutionContext.attachTarget ?? null,
          declarations: state.resolutionContext.declarations,
        }
      : null,
    pendingSpoilCard: state.pendingSpoilCard
      ? (state.pendingSpoil === viewerPlayerId ? serializeCard(state.pendingSpoilCard) : null)
      : null,
    pendingTriggers: state.pendingTriggers.map((t) => ({
      id: t.id,
      sourceCardInstanceId: t.sourceCardInstanceId,
      owningPlayerId: t.owningPlayerId,
      effect: t.effect,
      peekContext:
        t.peekContext && viewerPlayerId === t.owningPlayerId
          ? {
              targetPlayerId: t.peekContext.targetPlayerId,
              source: t.peekContext.source,
              cards: t.peekContext.cards.map(serializeCard),
            }
          : t.peekContext
            ? {
                targetPlayerId: t.peekContext.targetPlayerId,
                source: t.peekContext.source,
                cards: [],
              }
            : null,
    })),
    ...(extra.players !== undefined ? { players: extra.players } : {}),
  }
}
