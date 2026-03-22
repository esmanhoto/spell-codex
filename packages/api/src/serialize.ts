import {
  getLegalMoves,
  HAND_SIZES,
  serializeCard,
  serializeFormation,
  serializePool,
  serializeCombat,
} from "@spell/engine"
import type { GameState } from "@spell/engine"

// Re-export for use by other modules
export { serializeCard as card }

export function serializeBoard(state: GameState, viewerPlayerId?: string) {
  return {
    players: Object.fromEntries(
      Object.entries(state.players).map(([id, p]) => [
        id,
        {
          hand: viewerPlayerId == null || viewerPlayerId === id ? p.hand.map(serializeCard) : [],
          handCount: p.hand.length,
          handHidden: viewerPlayerId != null && viewerPlayerId !== id,
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
}

/** Collects unique [setId, cardNumber] for every card in both players' decks. */
function collectDeckCardImages(state: GameState): Array<[string, number]> {
  const seen = new Set<string>()
  const result: Array<[string, number]> = []
  for (const p of Object.values(state.players)) {
    for (const inst of [...p.hand, ...p.drawPile]) {
      const key = `${inst.card.setId}:${inst.card.cardNumber}`
      if (!seen.has(key)) {
        seen.add(key)
        result.push([inst.card.setId, inst.card.cardNumber])
      }
    }
  }
  return result
}

/**
 * Produces the API-shaped game state that the web client expects.
 */
export function serializeGameState(
  state: GameState,
  extra?: {
    status?: string
    turnDeadline?: Date | string | null
    includeDeckImages?: boolean
  },
  viewerPlayerId?: string,
) {
  const dl = extra?.turnDeadline
  const turnDeadline = dl instanceof Date ? dl.toISOString() : (dl ?? null)
  const legalMovesPerPlayer =
    viewerPlayerId == null
      ? Object.fromEntries(state.playerOrder.map((id) => [id, getLegalMoves(state, id)]))
      : { [viewerPlayerId]: getLegalMoves(state, viewerPlayerId) }

  return {
    gameId: state.id,
    viewerPlayerId: viewerPlayerId ?? null,
    playerOrder: state.playerOrder,
    status: extra?.status ?? (state.winner ? "finished" : "active"),
    phase: state.phase,
    activePlayer: state.activePlayer,
    turnNumber: state.currentTurn,
    turnDeadline,
    winner: state.winner ?? null,
    handMaxSize: (() => {
      const pid = viewerPlayerId ?? state.activePlayer
      return state.players[pid]?.maxHandSizeOverride ?? HAND_SIZES[state.deckSize]?.maxEnd ?? 8
    })(),
    legalMoves: getLegalMoves(state, viewerPlayerId ?? state.activePlayer),
    legalMovesPerPlayer,
    board: serializeBoard(state, viewerPlayerId),
    ...(extra?.includeDeckImages ? { deckCardImages: collectDeckCardImages(state) } : {}),
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
      ? (viewerPlayerId == null || state.pendingSpoil === viewerPlayerId
          ? serializeCard(state.pendingSpoilCard)
          : null)
      : null,
    pendingTriggers: state.pendingTriggers.map((t) => ({
      id: t.id,
      sourceCardInstanceId: t.sourceCardInstanceId,
      owningPlayerId: t.owningPlayerId,
      effect: t.effect,
      peekContext:
        t.peekContext && (viewerPlayerId == null || viewerPlayerId === t.owningPlayerId)
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
  }
}
