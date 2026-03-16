/**
 * Client-side equivalent of packages/api/src/serialize.ts.
 * Transforms the engine's internal GameState into the web client's GameState shape.
 * Used after applying a MOVE_APPLIED delta locally via @spell/engine.
 */

import {
  getLegalMoves,
  calculateCombatLevel,
  hasWorldMatch,
  getPoolAttachments,
  HAND_SIZES,
} from "@spell/engine"
import type {
  CardInstance,
  Formation,
  GameState as EngineGameState,
  PoolEntry,
} from "@spell/engine"
import type { GameState as ClientGameState } from "../api.ts"

function card(inst: CardInstance) {
  return {
    instanceId: inst.instanceId,
    name: inst.card.name,
    typeId: inst.card.typeId,
    worldId: inst.card.worldId,
    level: inst.card.level,
    setId: inst.card.setId,
    cardNumber: inst.card.cardNumber,
    description: inst.card.description,
    supportIds: inst.card.supportIds,
    spellNature: inst.card.spellNature ?? null,
    castPhases: inst.card.castPhases ?? [],
  }
}

function serializeFormation(f: Formation, ownerPlayerId: string, viewerPlayerId: string) {
  const isOwnerView = viewerPlayerId === ownerPlayerId
  const SLOTS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].slice(0, f.size)
  return Object.fromEntries(
    SLOTS.map((s) => {
      const slot = f.slots[s as keyof typeof f.slots]
      if (!slot) return [s, null]
      const revealedToAll = slot.holdingRevealedToAll ?? false
      const canSeeHoldings = isOwnerView || revealedToAll
      return [
        s,
        {
          realm: card(slot.realm),
          holdings: canSeeHoldings ? slot.holdings.map(card) : [],
          isRazed: slot.isRazed,
          holdingRevealedToAll: revealedToAll,
        },
      ]
    }),
  )
}

function serializePool(pool: PoolEntry[]) {
  return pool.map((e) => ({
    champion: card(e.champion),
    attachments: e.attachments.map(card),
  }))
}

function serializeCombat(state: EngineGameState) {
  const c = state.combatState!
  const realmSlot = state.players[c.defendingPlayer]?.formation.slots[c.targetRealmSlot]
  const realmWorldId = realmSlot?.realm.card.worldId ?? 0

  const attackerLevel = c.attacker
    ? calculateCombatLevel(
        c.attacker,
        c.attackerCards,
        hasWorldMatch(c.attacker, realmWorldId),
        "offensive",
        getPoolAttachments(state, c.attackingPlayer, c.attacker.instanceId),
      )
    : 0
  const defenderIsRealm = realmSlot?.realm.instanceId === c.defender?.instanceId
  const defenderLevel = c.defender
    ? calculateCombatLevel(
        c.defender,
        c.defenderCards,
        !defenderIsRealm && hasWorldMatch(c.defender, realmWorldId),
        "defensive",
        getPoolAttachments(state, c.defendingPlayer, c.defender.instanceId),
      )
    : 0

  return {
    attackingPlayer: c.attackingPlayer,
    defendingPlayer: c.defendingPlayer,
    targetSlot: c.targetRealmSlot,
    roundPhase: c.roundPhase,
    attacker: c.attacker ? card(c.attacker) : null,
    defender: c.defender ? card(c.defender) : null,
    attackerCards: c.attackerCards.map(card),
    defenderCards: c.defenderCards.map(card),
    attackerLevel,
    defenderLevel,
    attackerManualLevel: c.attackerManualLevel,
    defenderManualLevel: c.defenderManualLevel,
  }
}

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
          hand: viewerPlayerId === id ? p.hand.map(card) : [],
          handCount: p.hand.length,
          handHidden: viewerPlayerId !== id,
          formation: serializeFormation(p.formation, id, viewerPlayerId),
          pool: serializePool(p.pool),
          drawPileCount: p.drawPile.length,
          discardCount: p.discardPile.length,
          discardPile: p.discardPile.map(card),
          lastingEffects: p.lastingEffects.map(card),
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
    handMaxSize: HAND_SIZES[state.deckSize]?.maxEnd ?? 8,
    legalMoves,
    legalMovesPerPlayer: { [viewerPlayerId]: legalMoves },
    board,
    events: state.events,
    resolutionContext: state.resolutionContext
      ? {
          cardInstanceId: state.resolutionContext.cardInstanceId,
          pendingCard: card(state.resolutionContext.pendingCard),
          initiatingPlayer: state.resolutionContext.initiatingPlayer,
          resolvingPlayer: state.resolutionContext.resolvingPlayer,
          cardDestination: state.resolutionContext.cardDestination,
          attachTarget: state.resolutionContext.attachTarget ?? null,
          counterWindowOpen: state.resolutionContext.counterWindowOpen,
        }
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
              cards: t.peekContext.cards.map(card),
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
