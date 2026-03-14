/**
 * Turn-triggered ability system.
 *
 * At the start and end of a player's turn the engine scans their cards for
 * TurnTriggerEffect entries and queues them as pendingTriggers. The active
 * player is then offered generic tools (peek draw pile, peek hand, discard
 * from hand, done) and decides which ones apply based on their card text.
 *
 * The engine provides tools — not rule enforcement. Same philosophy as the
 * spell resolutionContext system.
 */

import type {
  GameState,
  PlayerId,
  GameEvent,
  TriggerEntry,
  PeekContext,
  Move,
  CardInstanceId,
  CardInstance,
} from "./types.ts"
import { EngineError } from "./errors.ts"
import { seededRandom } from "./utils.ts"

// ─── Scanner ──────────────────────────────────────────────────────────────────

/**
 * Scans the active player's cards for TurnTriggerEffect entries matching
 * `timing` and appends them to pendingTriggers.
 * Called at turn start (end of PhaseFive handler) and turn end (PhaseFive PASS).
 */
export function populateTriggers(
  state: GameState,
  timing: "start" | "end",
  events: GameEvent[],
): GameState {
  const player = state.players[state.activePlayer]!
  const newTriggers: TriggerEntry[] = []

  function consider(instanceId: CardInstanceId, card: CardInstance["card"]): void {
    for (const effect of card.effects) {
      if (effect.type !== "turn_trigger") continue
      if (effect.timing !== timing) continue
      newTriggers.push({
        id: `${instanceId}-${timing}-${newTriggers.length}`,
        sourceCardInstanceId: instanceId,
        owningPlayerId: state.activePlayer,
        effect,
      })
    }
  }

  for (const entry of player.pool) {
    consider(entry.champion.instanceId, entry.champion.card)
    for (const att of entry.attachments) consider(att.instanceId, att.card)
  }

  for (const slot of Object.values(player.formation.slots)) {
    if (!slot || slot.isRazed) continue
    consider(slot.realm.instanceId, slot.realm.card)
    for (const holding of slot.holdings) consider(holding.instanceId, holding.card)
  }

  for (const card of player.lastingEffects) consider(card.instanceId, card.card)

  if (newTriggers.length === 0) return state

  events.push({ type: "TRIGGERS_QUEUED", playerId: state.activePlayer, count: newTriggers.length })
  return { ...state, pendingTriggers: [...state.pendingTriggers, ...newTriggers] }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function currentTrigger(state: GameState): TriggerEntry {
  const t = state.pendingTriggers[0]
  if (!t) throw new EngineError("NO_PENDING_TRIGGER", "No trigger in queue")
  return t
}

function assertOwner(trigger: TriggerEntry, playerId: PlayerId): void {
  if (trigger.owningPlayerId !== playerId) throw new EngineError("NOT_YOUR_TRIGGER")
}

function dismissTrigger(state: GameState, playerId: PlayerId, events: GameEvent[]): GameState {
  const trigger = currentTrigger(state)
  events.push({
    type: "TRIGGER_RESOLVED",
    playerId,
    sourceCardInstanceId: trigger.sourceCardInstanceId,
  })
  return { ...state, pendingTriggers: state.pendingTriggers.slice(1) }
}

function updateCurrentTrigger(state: GameState, updates: Partial<TriggerEntry>): GameState {
  const [head, ...rest] = state.pendingTriggers
  return { ...state, pendingTriggers: [{ ...head!, ...updates }, ...rest] }
}

// ─── Handlers ────────────────────────────────────────────────────────────────

export function handleResolveTriggerPeek(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "RESOLVE_TRIGGER_PEEK" }>,
  events: GameEvent[],
): GameState {
  const trigger = currentTrigger(state)
  assertOwner(trigger, playerId)
  if (trigger.peekContext) throw new EngineError("PEEK_ALREADY_OPEN", "Close current peek first")

  const targetPlayer = state.players[move.targetPlayerId]
  if (!targetPlayer) throw new EngineError("INVALID_PLAYER")

  let peekContext: PeekContext
  let nextState = state

  if (move.source === "draw_pile") {
    const count = move.count ?? 1
    const cards = targetPlayer.drawPile.slice(0, count)
    if (cards.length === 0) throw new EngineError("EMPTY_DRAW_PILE", "No cards to peek")
    nextState = {
      ...state,
      players: {
        ...state.players,
        [move.targetPlayerId]: {
          ...targetPlayer,
          drawPile: targetPlayer.drawPile.slice(cards.length),
        },
      },
    }
    peekContext = { targetPlayerId: move.targetPlayerId, cards, source: "draw_pile" }
  } else {
    // hand peek — copies cards, originals stay in hand
    peekContext = {
      targetPlayerId: move.targetPlayerId,
      cards: [...targetPlayer.hand],
      source: "hand",
    }
  }

  events.push({
    type: "TRIGGER_PEEK_OPENED",
    playerId,
    targetPlayerId: move.targetPlayerId,
    cardCount: peekContext.cards.length,
    source: peekContext.source,
  })
  return updateCurrentTrigger(nextState, { peekContext })
}

export function handleResolveTriggerDiscardPeeked(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "RESOLVE_TRIGGER_DISCARD_PEEKED" }>,
  events: GameEvent[],
): GameState {
  const trigger = currentTrigger(state)
  assertOwner(trigger, playerId)
  const peek = trigger.peekContext
  if (!peek) throw new EngineError("NO_PEEK_CONTEXT", "No active peek")
  if (peek.source !== "draw_pile") {
    throw new EngineError("INVALID_TRIGGER_ACTION", "Can only discard from a draw_pile peek")
  }

  const card = peek.cards.find(c => c.instanceId === move.cardInstanceId)
  if (!card) throw new EngineError("CARD_NOT_IN_PEEK", "Card not in peek context")

  const targetPlayer = state.players[peek.targetPlayerId]!
  events.push({
    type: "TRIGGER_CARD_DISCARDED",
    playerId,
    targetPlayerId: peek.targetPlayerId,
    instanceId: card.instanceId,
    cardName: card.card.name,
  })

  return updateCurrentTrigger(
    {
      ...state,
      players: {
        ...state.players,
        [peek.targetPlayerId]: {
          ...targetPlayer,
          discardPile: [...targetPlayer.discardPile, card],
        },
      },
    },
    { peekContext: { ...peek, cards: peek.cards.filter(c => c.instanceId !== move.cardInstanceId) } },
  )
}

export function handleResolveTriggerDiscardFromHand(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "RESOLVE_TRIGGER_DISCARD_FROM_HAND" }>,
  events: GameEvent[],
): GameState {
  const trigger = currentTrigger(state)
  assertOwner(trigger, playerId)

  const targetPlayer = state.players[move.targetPlayerId]
  if (!targetPlayer || targetPlayer.hand.length === 0) {
    throw new EngineError("EMPTY_HAND", "Target player has no cards in hand")
  }

  const idx = seededRandom(state.currentTurn, trigger.id) % targetPlayer.hand.length
  const card = targetPlayer.hand[idx]!

  events.push({
    type: "TRIGGER_CARD_DISCARDED",
    playerId,
    targetPlayerId: move.targetPlayerId,
    instanceId: card.instanceId,
    cardName: card.card.name,
  })

  return dismissTrigger(
    {
      ...state,
      players: {
        ...state.players,
        [move.targetPlayerId]: {
          ...targetPlayer,
          hand: targetPlayer.hand.filter((_, i) => i !== idx),
          discardPile: [...targetPlayer.discardPile, card],
        },
      },
    },
    playerId,
    events,
  )
}

export function handleResolveTriggerDone(
  state: GameState,
  playerId: PlayerId,
  events: GameEvent[],
): GameState {
  const trigger = currentTrigger(state)
  assertOwner(trigger, playerId)

  // Return any held draw pile cards to the top of the target's draw pile
  if (trigger.peekContext?.source === "draw_pile" && trigger.peekContext.cards.length > 0) {
    const { targetPlayerId, cards } = trigger.peekContext
    const targetPlayer = state.players[targetPlayerId]!
    return dismissTrigger(
      {
        ...state,
        players: {
          ...state.players,
          [targetPlayerId]: { ...targetPlayer, drawPile: [...cards, ...targetPlayer.drawPile] },
        },
      },
      playerId,
      events,
    )
  }

  return dismissTrigger(state, playerId, events)
}
