import { getLegalMoves, calculateCombatLevel, hasWorldMatch } from "@spell/engine"
import type { CardInstance, Formation, GameState, PoolEntry } from "@spell/engine"

// ─── Card / Formation serialisers ────────────────────────────────────────────

export function card(inst: CardInstance) {
  return {
    instanceId:  inst.instanceId,
    name:        inst.card.name,
    typeId:      inst.card.typeId,
    worldId:     inst.card.worldId,
    level:       inst.card.level,
    setId:       inst.card.setId,
    cardNumber:  inst.card.cardNumber,
    description: inst.card.description,
  }
}

function serializeFormation(
  f: Formation,
  ownerPlayerId: string,
  viewerPlayerId?: string,
) {
  const isOwnerView = viewerPlayerId != null && viewerPlayerId === ownerPlayerId
  const SLOTS = ["A","B","C","D","E","F","G","H","I","J"].slice(0, f.size)
  return Object.fromEntries(SLOTS.map(s => {
    const slot = f.slots[s as keyof typeof f.slots]
    if (!slot) return [s, null]
    const revealedToAll = slot.holdingRevealedToAll ?? false
    const canSeeHoldings = isOwnerView || revealedToAll
    return [s, {
      realm:    card(slot.realm),
      holdings: canSeeHoldings ? slot.holdings.map(card) : [],
      isRazed:  slot.isRazed,
      holdingRevealedToAll: revealedToAll,
    }]
  }))
}

function serializePool(pool: PoolEntry[]) {
  return pool.map(e => ({
    champion:    card(e.champion),
    attachments: e.attachments.map(card),
  }))
}

function serializeCombat(state: GameState) {
  const c = state.combatState!
  const realmSlot = state.players[c.defendingPlayer]?.formation.slots[c.targetRealmSlot]
  const realmWorldId = realmSlot?.realm.card.worldId ?? 0

  const attackerLevel = c.attacker
    ? calculateCombatLevel(c.attacker, c.attackerCards, hasWorldMatch(c.attacker, realmWorldId), c.effectSpecs, "offensive")
    : 0
  const defenderLevel = c.defender
    ? calculateCombatLevel(c.defender, c.defenderCards, hasWorldMatch(c.defender, realmWorldId), c.effectSpecs, "defensive")
    : 0

  return {
    attackingPlayer:     c.attackingPlayer,
    defendingPlayer:     c.defendingPlayer,
    targetSlot:          c.targetRealmSlot,
    roundPhase:          c.roundPhase,
    attacker:            c.attacker ? card(c.attacker) : null,
    defender:            c.defender ? card(c.defender) : null,
    attackerCards:       c.attackerCards.map(card),
    defenderCards:       c.defenderCards.map(card),
    attackerLevel,
    defenderLevel,
    attackerManualLevel: c.attackerManualLevel,
    defenderManualLevel: c.defenderManualLevel,
  }
}

export function serializeBoard(state: GameState, viewerPlayerId?: string) {
  return {
    players: Object.fromEntries(
      Object.entries(state.players).map(([id, p]) => [id, {
        hand:          p.hand.map(card),
        formation:     serializeFormation(p.formation, id, viewerPlayerId),
        pool:          serializePool(p.pool),
        drawPileCount: p.drawPile.length,
        discardCount:  p.discardPile.length,
      }])
    ),
    combat: state.combatState ? serializeCombat(state) : null,
  }
}

/**
 * Produces the API-shaped game state that the web client expects.
 * Includes legalMoves (always for the active player), serialized board, etc.
 */
export function serializeGameState(state: GameState, extra?: {
  status?: string
  turnDeadline?: Date | string | null
}, viewerPlayerId?: string) {
  const dl = extra?.turnDeadline
  const turnDeadline = dl instanceof Date ? dl.toISOString() : (dl ?? null)
  return {
    gameId:         state.id,
    status:         extra?.status ?? (state.winner ? "finished" : "active"),
    phase:          state.phase,
    activePlayer:   state.activePlayer,
    turnNumber:     state.currentTurn,
    turnDeadline,
    winner:         state.winner ?? null,
    legalMoves:     getLegalMoves(state, state.activePlayer),
    legalMovesPerPlayer: Object.fromEntries(
      state.playerOrder.map(id => [id, getLegalMoves(state, id)]),
    ),
    pendingEffects: state.pendingEffects,
    responseWindow: state.responseWindow ?? null,
    board:          serializeBoard(state, viewerPlayerId),
    events:         state.events,
  }
}
