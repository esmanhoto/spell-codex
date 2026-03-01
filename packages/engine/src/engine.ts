import type {
  GameState, GameEvent, Move, EngineResult,
  PlayerId, CardInstanceId, FormationSlot,
  CombatState, CardInstance, PoolEntry, LimboEntry,
  PendingEffect, ResponseWindow, ManualAction,
} from "./types.ts"
import { Phase } from "./types.ts"
import { CardTypeId, HAND_SIZES } from "./constants.ts"
import {
  updatePlayer, removeFromHand, takeCards, nextPlayer,
  requiresManualResolution, isChampionType,
} from "./utils.ts"
import { calculateCombatLevel, hasWorldMatch, resolveCombatRound, getLosingPlayer } from "./combat.ts"
import { getLegalMoves, getLegalRealmSlots, isAttackable, isUniqueInPlay } from "./legal-moves.ts"

// ─── Public API ───────────────────────────────────────────────────────────────

export class EngineError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code)
    this.name = "EngineError"
  }
}

/**
 * The core engine function. Pure — no side effects.
 * Validates the move, applies it, and returns the new state with events and legal moves.
 */
export function applyMove(state: GameState, playerId: PlayerId, move: Move): EngineResult {
  if (state.winner !== null) {
    throw new EngineError("GAME_OVER", "Game is already over")
  }

  // Validate turn ownership — some moves are valid out of turn (combat defense)
  if (state.activePlayer !== playerId) {
    if (!isValidOutOfTurnMove(state, playerId, move)) {
      throw new EngineError("NOT_YOUR_TURN", `It is ${state.activePlayer}'s turn`)
    }
  }

  const events: GameEvent[] = []
  let newState: GameState

  switch (move.type) {
    case "PASS":
      newState = handlePass(state, playerId, events)
      break
    case "PLAY_RULE_CARD":
      newState = handlePlayRuleCard(state, playerId, move, events)
      break
    case "PLAY_REALM":
      newState = handlePlayRealm(state, playerId, move, events)
      break
    case "REBUILD_REALM":
      newState = handleRebuildRealm(state, playerId, move, events)
      break
    case "PLAY_HOLDING":
      newState = handlePlayHolding(state, playerId, move, events)
      break
    case "TOGGLE_HOLDING_REVEAL":
      newState = handleToggleHoldingReveal(state, playerId, move, events)
      break
    case "PLACE_CHAMPION":
      newState = handlePlaceChampion(state, playerId, move, events)
      break
    case "ATTACH_ITEM":
      newState = handleAttachItem(state, playerId, move, events)
      break
    case "PLAY_PHASE3_CARD":
      newState = handlePlaySpellCard(state, playerId, move, events)
      break
    case "DECLARE_ATTACK":
      newState = handleDeclareAttack(state, playerId, move, events)
      break
    case "DECLARE_DEFENSE":
      newState = handleDeclareDefense(state, playerId, move, events)
      break
    case "DECLINE_DEFENSE":
      newState = handleDeclineDefense(state, playerId, events)
      break
    case "PLAY_COMBAT_CARD":
      newState = handlePlayCombatCard(state, playerId, move, events)
      break
    case "STOP_PLAYING":
      newState = handleStopPlaying(state, playerId, events)
      break
    case "CONTINUE_ATTACK":
      newState = handleContinueAttack(state, playerId, move, events)
      break
    case "END_ATTACK":
      newState = handleEndAttack(state, playerId, events)
      break
    case "PLAY_PHASE5_CARD":
      newState = handlePlaySpellCard(state, playerId, move, events)
      break
    case "DISCARD_CARD":
      newState = handleDiscardCard(state, playerId, move, events)
      break
    case "END_TURN":
      newState = handleEndTurn(state, playerId, events)
      break
    case "PLAY_EVENT":
      newState = handlePlaySpellCard(state, playerId, move, events)
      break
    case "RESOLVE_EFFECT":
      newState = handleResolveEffect(state, playerId, move, events)
      break
    case "SKIP_EFFECT":
      newState = handleSkipEffect(state, playerId, events)
      break
    case "PASS_RESPONSE":
      newState = handlePassResponse(state, playerId, events)
      break
    case "MANUAL_DISCARD":
      newState = handleManualDiscard(state, playerId, move, events)
      break
    case "MANUAL_TO_LIMBO":
      newState = handleManualToLimbo(state, playerId, move, events)
      break
    case "MANUAL_TO_ABYSS":
      newState = handleManualToAbyss(state, playerId, move, events)
      break
    case "MANUAL_TO_HAND":
      newState = handleManualToHand(state, playerId, move, events)
      break
    case "MANUAL_RAZE_REALM":
      newState = handleManualRazeRealm(state, playerId, move, events)
      break
    case "MANUAL_DRAW_CARDS":
      newState = handleManualDrawCards(state, playerId, move, events)
      break
    case "MANUAL_RETURN_TO_POOL":
      newState = handleManualReturnToPool(state, playerId, move, events)
      break
    case "MANUAL_AFFECT_OPPONENT":
      newState = handleManualAffectOpponent(state, playerId, move, events)
      break
    case "MANUAL_SET_COMBAT_LEVEL":
      newState = handleManualSetCombatLevel(state, playerId, move, events)
      break
    case "MANUAL_SWITCH_COMBAT_SIDE":
      newState = handleManualSwitchCombatSide(state, playerId, move, events)
      break
    default:
      throw new EngineError("UNKNOWN_MOVE", `Unrecognised move type`)
  }

  return {
    newState,
    events,
    legalMoves: getLegalMoves(newState, newState.activePlayer),
  }
}

// ─── Out-of-turn validation ───────────────────────────────────────────────────

function isValidOutOfTurnMove(state: GameState, playerId: PlayerId, move: Move): boolean {
  // Response window: the responding player acts (even though they may not be activePlayer
  // in normal turns). Validate that here.
  if (state.responseWindow !== null) {
    if (state.responseWindow.respondingPlayerId === playerId) {
      return move.type === "PASS_RESPONSE" || move.type === "PLAY_EVENT"
    }
  }

  // Pending effects (no response window): triggering player acts
  if (state.pendingEffects.length > 0 && state.responseWindow === null) {
    const effect = state.pendingEffects[0]!
    if (effect.triggeringPlayerId === playerId) {
      const manualMoveTypes = new Set([
        "SKIP_EFFECT", "RESOLVE_EFFECT",
        "MANUAL_DISCARD", "MANUAL_TO_LIMBO", "MANUAL_TO_ABYSS",
        "MANUAL_TO_HAND", "MANUAL_RAZE_REALM", "MANUAL_DRAW_CARDS",
        "MANUAL_RETURN_TO_POOL", "MANUAL_AFFECT_OPPONENT",
      ])
      return manualMoveTypes.has(move.type)
    }
  }

  const combat = state.combatState
  if (!combat) return false

  const isDefender = playerId === combat.defendingPlayer

  if (combat.roundPhase === "AWAITING_DEFENDER" && isDefender) {
    return move.type === "DECLARE_DEFENSE" || move.type === "DECLINE_DEFENSE"
  }

  if (combat.roundPhase === "CARD_PLAY") {
    // Either player may play during CARD_PLAY (losing player freely, winning player with events only)
    return (
      move.type === "PLAY_COMBAT_CARD" ||
      move.type === "STOP_PLAYING" ||
      move.type === "PLAY_EVENT" ||
      move.type === "MANUAL_SET_COMBAT_LEVEL" ||
      move.type === "MANUAL_SWITCH_COMBAT_SIDE"
    )
  }

  return false
}

// ─── Phase Handlers ───────────────────────────────────────────────────────────

function handlePass(state: GameState, playerId: PlayerId, events: GameEvent[]): GameState {
  assertNotInCombat(state)

  switch (state.phase) {
    case Phase.StartOfTurn: {
      const player = state.players[playerId]!
      const { drawPerTurn } = HAND_SIZES[state.deckSize]!
      const [drawn, remainingDraw] = takeCards(player.drawPile, drawPerTurn)

      events.push({ type: "CARDS_DRAWN", playerId, count: drawn.length })
      let s = updatePlayer(state, playerId, {
        hand: [...player.hand, ...drawn],
        drawPile: remainingDraw,
      })
      s = { ...s, phase: Phase.PlayRealm }
      events.push({ type: "PHASE_CHANGED", phase: Phase.PlayRealm })
      return s
    }

    case Phase.PlayRealm: {
      let s = { ...state, phase: Phase.Pool }
      events.push({ type: "PHASE_CHANGED", phase: Phase.Pool })
      s = processLimboReturns(s, playerId, events)
      return s
    }

    case Phase.Pool: {
      const s = { ...state, phase: Phase.Combat }
      events.push({ type: "PHASE_CHANGED", phase: Phase.Combat })
      return s
    }

    case Phase.Combat: {
      const s = { ...state, phase: Phase.PhaseFive }
      events.push({ type: "PHASE_CHANGED", phase: Phase.PhaseFive })
      return s
    }

    case Phase.PhaseFive: {
      const player = state.players[playerId]!
      const { maxEnd } = HAND_SIZES[state.deckSize]!
      if (player.hand.length > maxEnd) {
        throw new EngineError("HAND_TOO_LARGE", `Discard down to ${maxEnd} cards before passing`)
      }

      events.push({ type: "TURN_ENDED", playerId })
      let s = { ...state, phase: Phase.EndTurn }
      s = checkZeroRealmCondition(s, events)

      if (s.winner) return s

      const nextId = nextPlayer(s)
      s = {
        ...s,
        activePlayer: nextId,
        currentTurn: s.currentTurn + 1,
        phase: Phase.StartOfTurn,
        hasAttackedThisTurn: false,
        hasPlayedRealmThisTurn: false,
      }
      events.push({ type: "TURN_STARTED", playerId: nextId, turn: s.currentTurn })
      events.push({ type: "PHASE_CHANGED", phase: Phase.StartOfTurn })
      // Win condition: next player wins if they have a full formation of unrazed realms
      s = checkWinCondition(s, events)
      return s
    }

    default:
      throw new EngineError("INVALID_PASS", `Cannot PASS in phase ${state.phase}`)
  }
}

function handlePlayRuleCard(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "PLAY_RULE_CARD" }>,
  events: GameEvent[],
): GameState {
  assertPhase(state, Phase.StartOfTurn)
  const player = state.players[playerId]!
  const [card, newHand] = removeFromHand(player.hand, move.cardInstanceId)

  if (card.card.typeId !== CardTypeId.Rule) {
    throw new EngineError("NOT_A_RULE_CARD")
  }

  // Rule cards always require manual resolution — their effects are too varied to auto-handle
  const effect: PendingEffect = {
    cardInstanceId:     card.instanceId,
    cardName:           card.card.name,
    cardDescription:    card.card.description,
    triggeringPlayerId: playerId,
    targetScope:        "none",
  }
  events.push({ type: "EFFECT_QUEUED", effect })

  const respondingPlayerId = state.playerOrder.find(id => id !== playerId)!
  const responseWindow: ResponseWindow = {
    triggeringPlayerId:   playerId,
    respondingPlayerId,
    effectCardInstanceId: card.instanceId,
    effectCardName:       card.card.name,
    effectCardDescription: card.card.description,
  }
  events.push({ type: "RESPONSE_WINDOW_OPENED", respondingPlayerId })

  return updatePlayer(
    { ...state, pendingEffects: [...state.pendingEffects, effect], activePlayer: respondingPlayerId, responseWindow },
    playerId,
    { hand: newHand, discardPile: [...player.discardPile, card] },
  )
}

function handlePlayRealm(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "PLAY_REALM" }>,
  events: GameEvent[],
): GameState {
  assertPhase(state, Phase.PlayRealm)
  const player = state.players[playerId]!
  const [card, newHand] = removeFromHand(player.hand, move.cardInstanceId)

  if (card.card.typeId !== CardTypeId.Realm) {
    throw new EngineError("NOT_A_REALM")
  }
  if (!isUniqueInPlay(card.card, state)) {
    throw new EngineError("COSMOS_VIOLATION", `${card.card.name} is already in play`)
  }

  const existingSlot = player.formation.slots[move.slot]
  if (existingSlot && !existingSlot.isRazed) {
    throw new EngineError("SLOT_OCCUPIED", `Slot ${move.slot} already has an active realm`)
  }
  if (!existingSlot && !getLegalRealmSlots(player.formation).includes(move.slot)) {
    throw new EngineError("ILLEGAL_SLOT", `Slot ${move.slot} cannot be filled yet`)
  }

  events.push({ type: "REALM_PLAYED", playerId, instanceId: card.instanceId, slot: move.slot })

  // When replacing a razed realm, discard the old realm
  const newDiscardPile = existingSlot
    ? [...player.discardPile, existingSlot.realm]
    : player.discardPile

  let s = {
    ...updatePlayer(state, playerId, {
      hand: newHand,
      discardPile: newDiscardPile,
      formation: {
        ...player.formation,
        slots: {
          ...player.formation.slots,
          [move.slot]: { realm: card, isRazed: false, holdings: [], holdingRevealedToAll: false },
        },
      },
    }),
    hasPlayedRealmThisTurn: true,
  }

  // Auto-advance to Pool phase after playing a realm
  if (s.phase === Phase.PlayRealm) {
    s = advanceToPhase(s, playerId, Phase.Pool, events)
  }
  return s
}

function handleRebuildRealm(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "REBUILD_REALM" }>,
  events: GameEvent[],
): GameState {
  assertPhase(state, Phase.PlayRealm)
  const player = state.players[playerId]!
  const realmSlot = player.formation.slots[move.slot]

  if (!realmSlot?.isRazed) {
    throw new EngineError("NOT_RAZED", `Slot ${move.slot} is not a razed realm`)
  }
  if (player.hand.length < 3) {
    throw new EngineError("INSUFFICIENT_CARDS", "Rebuilding costs 3 cards from hand")
  }

  const discarded = player.hand.slice(0, 3)
  const discardedIds = discarded.map(c => c.instanceId)
  events.push({ type: "REALM_REBUILT", playerId, slot: move.slot, discardedIds })

  let s = {
    ...updatePlayer(state, playerId, {
      hand: player.hand.slice(3),
      discardPile: [...player.discardPile, ...discarded],
      formation: {
        ...player.formation,
        slots: {
          ...player.formation.slots,
          [move.slot]: { ...realmSlot, isRazed: false },
        },
      },
    }),
    hasPlayedRealmThisTurn: true,
  }

  // Auto-advance to Pool phase after rebuilding
  if (s.phase === Phase.PlayRealm) {
    s = advanceToPhase(s, playerId, Phase.Pool, events)
  }
  return s
}

function handlePlayHolding(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "PLAY_HOLDING" }>,
  events: GameEvent[],
): GameState {
  assertPhase(state, Phase.PlayRealm)
  const player = state.players[playerId]!
  const [card, newHand] = removeFromHand(player.hand, move.cardInstanceId)
  const realmSlot = player.formation.slots[move.realmSlot]

  if (card.card.typeId !== CardTypeId.Holding) {
    throw new EngineError("NOT_A_HOLDING")
  }
  if (!realmSlot || realmSlot.isRazed) {
    throw new EngineError("INVALID_REALM", "Target realm must be in play and unrazed")
  }
  if (realmSlot.holdings.length > 0) {
    throw new EngineError("HOLDING_OCCUPIED", "Realm already has a holding")
  }
  if (!isUniqueInPlay(card.card, state)) {
    throw new EngineError("COSMOS_VIOLATION", `${card.card.name} is already in play`)
  }

  events.push({ type: "HOLDING_PLAYED", playerId, instanceId: card.instanceId, slot: move.realmSlot })

  let s = {
    ...updatePlayer(state, playerId, {
      hand: newHand,
      formation: {
        ...player.formation,
        slots: {
          ...player.formation.slots,
          [move.realmSlot]: { ...realmSlot, holdings: [...realmSlot.holdings, card], holdingRevealedToAll: false },
        },
      },
    }),
    hasPlayedRealmThisTurn: true,
  }

  // Auto-advance to Pool phase after playing a holding
  if (s.phase === Phase.PlayRealm) {
    s = advanceToPhase(s, playerId, Phase.Pool, events)
  }
  return s
}

function handleToggleHoldingReveal(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "TOGGLE_HOLDING_REVEAL" }>,
  events: GameEvent[],
): GameState {
  const player = state.players[playerId]!
  const realmSlot = player.formation.slots[move.realmSlot]

  if (!realmSlot || realmSlot.isRazed) {
    throw new EngineError("INVALID_REALM", "Target realm must be in play and unrazed")
  }
  if (realmSlot.holdings.length === 0) {
    throw new EngineError("NO_HOLDING", "Realm has no holding to reveal")
  }

  const revealedToAll = !(realmSlot.holdingRevealedToAll ?? false)
  events.push({ type: "HOLDING_REVEAL_TOGGLED", playerId, slot: move.realmSlot, revealedToAll })

  return updatePlayer(state, playerId, {
    formation: {
      ...player.formation,
      slots: {
        ...player.formation.slots,
        [move.realmSlot]: { ...realmSlot, holdingRevealedToAll: revealedToAll },
      },
    },
  })
}

function handlePlaceChampion(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "PLACE_CHAMPION" }>,
  events: GameEvent[],
): GameState {
  // Auto-advance from PlayRealm to Pool
  if (state.phase === Phase.PlayRealm) {
    state = advanceToPhase(state, playerId, Phase.Pool, events)
  }
  assertPhase(state, Phase.Pool)
  const player = state.players[playerId]!
  const [card, newHand] = removeFromHand(player.hand, move.cardInstanceId)

  if (!isChampionType(card.card.typeId)) {
    throw new EngineError("NOT_A_CHAMPION")
  }
  if (!isUniqueInPlay(card.card, state)) {
    throw new EngineError("COSMOS_VIOLATION", `${card.card.name} is already in play`)
  }

  events.push({ type: "CHAMPION_PLACED", playerId, instanceId: card.instanceId })

  return updatePlayer(state, playerId, {
    hand: newHand,
    pool: [...player.pool, { champion: card, attachments: [] }],
  })
}

function handleAttachItem(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "ATTACH_ITEM" }>,
  events: GameEvent[],
): GameState {
  // Auto-advance from PlayRealm to Pool
  if (state.phase === Phase.PlayRealm) {
    state = advanceToPhase(state, playerId, Phase.Pool, events)
  }
  assertPhase(state, Phase.Pool)
  const player = state.players[playerId]!
  const [card, newHand] = removeFromHand(player.hand, move.cardInstanceId)

  const entryIdx = player.pool.findIndex(e => e.champion.instanceId === move.championId)
  if (entryIdx === -1) {
    throw new EngineError("CHAMPION_NOT_IN_POOL")
  }

  const entry = player.pool[entryIdx]!

  if (card.card.typeId === CardTypeId.Artifact) {
    if (!isUniqueInPlay(card.card, state)) {
      throw new EngineError("COSMOS_VIOLATION", `${card.card.name} is already in play`)
    }
    if (entry.attachments.some(a => a.card.typeId === CardTypeId.Artifact)) {
      throw new EngineError("ARTIFACT_ALREADY_ATTACHED", "Champion already has an artifact")
    }
  }

  events.push({ type: "ITEM_ATTACHED", playerId, itemId: card.instanceId, championId: move.championId })

  const newPool = [...player.pool]
  newPool[entryIdx] = { ...entry, attachments: [...entry.attachments, card] }

  return updatePlayer(state, playerId, { hand: newHand, pool: newPool })
}

/**
 * Generic handler for cards that may need manual resolution:
 * Phase 3 spells, Phase 5 cards, events.
 */
function handlePlaySpellCard(
  state: GameState,
  playerId: PlayerId,
  move:
    | Extract<Move, { type: "PLAY_PHASE3_CARD" }>
    | Extract<Move, { type: "PLAY_PHASE5_CARD" }>
    | Extract<Move, { type: "PLAY_EVENT" }>,
  events: GameEvent[],
): GameState {
  // Auto-advance PLAY_PHASE3_CARD from PlayRealm to Pool
  if (move.type === "PLAY_PHASE3_CARD" && state.phase === Phase.PlayRealm) {
    state = advanceToPhase(state, playerId, Phase.Pool, events)
  }
  const player = state.players[playerId]!
  const [card, newHand] = removeFromHand(player.hand, move.cardInstanceId)

  // Events sent to Abyss, all other cards to discard pile
  const isEvent = card.card.typeId === CardTypeId.Event
  const newDiscardPile = isEvent ? player.discardPile : [...player.discardPile, card]
  const newAbyss = isEvent ? [...player.abyss, card] : player.abyss

  let s = updatePlayer(state, playerId, {
    hand: newHand,
    discardPile: newDiscardPile,
    abyss: newAbyss,
  })

  // If playing during an active response window (responder countering), don't queue
  // a new pending effect — the card acts as a counter and the window stays open.
  if (s.responseWindow !== null) {
    return s
  }

  // Queue a manual effect if no Tier 1 spec covers this card
  if (requiresManualResolution(card, s.combatState?.effectSpecs ?? [])) {
    const effect: PendingEffect = {
      cardInstanceId:     card.instanceId,
      cardName:           card.card.name,
      cardDescription:    card.card.description,
      triggeringPlayerId: playerId,
      targetScope:        "none",  // out-of-combat plays default to "none"; extend per card later
    }
    events.push({ type: "EFFECT_QUEUED", effect })

    // Outside combat with no existing response window: open one for the opponent
    if (!s.combatState) {
      const respondingPlayerId = s.playerOrder.find(id => id !== playerId)!
      const responseWindow: ResponseWindow = {
        triggeringPlayerId:   playerId,
        respondingPlayerId,
        effectCardInstanceId: card.instanceId,
        effectCardName:       card.card.name,
        effectCardDescription: card.card.description,
      }
      events.push({ type: "RESPONSE_WINDOW_OPENED", respondingPlayerId })
      s = { ...s, pendingEffects: [...s.pendingEffects, effect], activePlayer: respondingPlayerId, responseWindow }
    } else {
      // During combat: triggering player stays active to resolve
      s = { ...s, pendingEffects: [...s.pendingEffects, effect], activePlayer: playerId }
    }
  }
  // else: TODO apply Tier 1 effects from card.card.effects

  return s
}

function handleDiscardCard(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "DISCARD_CARD" }>,
  events: GameEvent[],
): GameState {
  // Auto-advance from PlayRealm, Pool, or Combat to PhaseFive
  if (state.phase === Phase.PlayRealm || state.phase === Phase.Pool || state.phase === Phase.Combat) {
    state = advanceToPhase(state, playerId, Phase.PhaseFive, events)
  }
  assertPhase(state, Phase.PhaseFive)
  const player = state.players[playerId]!
  const [card, newHand] = removeFromHand(player.hand, move.cardInstanceId)

  const isEvent = card.card.typeId === CardTypeId.Event
  events.push({
    type: isEvent ? "CARD_TO_ABYSS" : "CARDS_DISCARDED",
    playerId,
    ...(isEvent
      ? { instanceId: card.instanceId }
      : { instanceIds: [card.instanceId] }),
  } as GameEvent)

  return updatePlayer(state, playerId, {
    hand: newHand,
    discardPile: isEvent ? player.discardPile : [...player.discardPile, card],
    abyss: isEvent ? [...player.abyss, card] : player.abyss,
  })
}

// ─── Combat Handlers ──────────────────────────────────────────────────────────

function handleDeclareAttack(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "DECLARE_ATTACK" }>,
  events: GameEvent[],
): GameState {
  // Auto-advance from PlayRealm or Pool to Combat phase
  if (state.phase === Phase.PlayRealm || state.phase === Phase.Pool) {
    state = advanceToPhase(state, playerId, Phase.Combat, events)
  }
  assertPhase(state, Phase.Combat)
  if (state.hasAttackedThisTurn) {
    throw new EngineError("ALREADY_ATTACKED", "Only one attack per turn")
  }

  const player = state.players[playerId]!
  const targetPlayer = state.players[move.targetPlayerId]
  if (!targetPlayer) throw new EngineError("INVALID_TARGET_PLAYER")

  const realmSlot = targetPlayer.formation.slots[move.targetRealmSlot]
  if (!realmSlot || realmSlot.isRazed) {
    throw new EngineError("INVALID_TARGET_REALM", "Target realm is not in play")
  }

  // Find attacker champion — must be in pool
  const poolEntry = player.pool.find(e => e.champion.instanceId === move.championId)
  if (!poolEntry) {
    throw new EngineError("CHAMPION_NOT_IN_POOL", "Attacker champion must be in pool")
  }

  if (!isAttackable(targetPlayer.formation, move.targetRealmSlot, poolEntry.champion)) {
    throw new EngineError("REALM_PROTECTED", "Target realm is protected")
  }

  events.push({
    type: "ATTACK_DECLARED",
    attackingPlayer: playerId,
    defendingPlayer: move.targetPlayerId,
    slot: move.targetRealmSlot,
    championId: move.championId,
  })

  const combatState: CombatState = {
    attackingPlayer: playerId,
    defendingPlayer: move.targetPlayerId,
    targetRealmSlot: move.targetRealmSlot,
    roundPhase: "AWAITING_DEFENDER",
    attacker: poolEntry.champion,
    defender: null,
    attackerCards: [],
    defenderCards: [],
    championsUsedThisBattle: [move.championId],
    effectSpecs: [],
    attackerManualLevel: null,
    defenderManualLevel: null,
  }

  return {
    ...state,
    activePlayer: move.targetPlayerId,  // defender must respond
    combatState,
    hasAttackedThisTurn: true,
  }
}

function handleDeclareDefense(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "DECLARE_DEFENSE" }>,
  events: GameEvent[],
): GameState {
  assertCombatPhase(state, "AWAITING_DEFENDER")
  const combat = state.combatState!
  if (playerId !== combat.defendingPlayer) {
    throw new EngineError("NOT_DEFENDER")
  }

  let s = state
  let defenderChampion = null

  // Check pool first
  const poolEntry = s.players[playerId]!.pool.find(
    e => e.champion.instanceId === move.championId,
  )

  if (poolEntry) {
    defenderChampion = poolEntry.champion
  } else {
    const player = s.players[playerId]!
    const handIdx = player.hand.findIndex(c => c.instanceId === move.championId)
    if (handIdx !== -1) {
      // Check hand — champion played directly from hand to defend
      const [card, newHand] = removeFromHand(player.hand, move.championId)
      if (!isChampionType(card.card.typeId)) {
        throw new EngineError("NOT_A_CHAMPION")
      }
      // Move from hand into pool
      s = updatePlayer(s, playerId, {
        hand: newHand,
        pool: [...player.pool, { champion: card, attachments: [] }],
      })
      defenderChampion = card
    } else {
      // Check self-defending realm in formation
      const realmSlot = s.players[playerId]!.formation.slots[combat.targetRealmSlot]
      if (
        realmSlot && !realmSlot.isRazed &&
        realmSlot.realm.instanceId === move.championId &&
        realmSlot.realm.card.level != null
      ) {
        defenderChampion = realmSlot.realm
        // Realm stays in formation — not moved anywhere
      } else {
        throw new EngineError("CHAMPION_NOT_FOUND", "Defender champion not in pool, hand, or as self-defending realm")
      }
    }
  }

  if (combat.championsUsedThisBattle.includes(defenderChampion.instanceId)) {
    throw new EngineError("CHAMPION_ALREADY_USED", "This champion already fought in this battle")
  }

  events.push({ type: "DEFENSE_DECLARED", playerId, championId: defenderChampion.instanceId })

  const newCombat: CombatState = {
    ...combat,
    roundPhase: "CARD_PLAY",
    defender: defenderChampion,
    championsUsedThisBattle: [...combat.championsUsedThisBattle, defenderChampion.instanceId],
  }

  // Set active player to the one currently losing
  const realmSlot = s.players[combat.defendingPlayer]!.formation.slots[combat.targetRealmSlot]
  const realmWorldId = realmSlot?.realm.card.worldId ?? 0
  const attackerLevel = calculateCombatLevel(
    combat.attacker!,
    [],
    hasWorldMatch(combat.attacker!, realmWorldId),
    combat.effectSpecs,
    "offensive",
  )
  const defenderLevel = calculateCombatLevel(
    defenderChampion,
    [],
    hasWorldMatch(defenderChampion, realmWorldId),
    combat.effectSpecs,
    "defensive",
  )
  const losingPlayer = getLosingPlayer(attackerLevel, defenderLevel, newCombat)

  return { ...s, activePlayer: losingPlayer, combatState: newCombat }
}

function handleDeclineDefense(
  state: GameState,
  playerId: PlayerId,
  events: GameEvent[],
): GameState {
  assertCombatPhase(state, "AWAITING_DEFENDER")
  const combat = state.combatState!
  if (playerId !== combat.defendingPlayer) {
    throw new EngineError("NOT_DEFENDER")
  }

  events.push({ type: "DEFENSE_DECLINED", playerId })

  // Raze the realm
  let s = razeRealm(state, combat.defendingPlayer, combat.targetRealmSlot, events)

  // Attacker earns spoils (draw 1 card)
  s = earnSpoils(s, combat.attackingPlayer, events)

  // End battle
  return endBattle(s, combat.attackingPlayer, events)
}

function handlePlayCombatCard(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "PLAY_COMBAT_CARD" }>,
  events: GameEvent[],
): GameState {
  assertCombatPhase(state, "CARD_PLAY")
  const combat = state.combatState!
  const isAttacker = playerId === combat.attackingPlayer

  const player = state.players[playerId]!
  const [card, newHand] = removeFromHand(player.hand, move.cardInstanceId)

  events.push({ type: "COMBAT_CARD_PLAYED", playerId, instanceId: card.instanceId })

  // Add card to the appropriate side's combat cards
  const newCombat: CombatState = isAttacker
    ? { ...combat, attackerCards: [...combat.attackerCards, card] }
    : { ...combat, defenderCards: [...combat.defenderCards, card] }

  let s = updatePlayer({ ...state, combatState: newCombat }, playerId, { hand: newHand })

  // Queue a manual effect if card has no Tier 1 spec
  if (requiresManualResolution(card, newCombat.effectSpecs)) {
    const effect: PendingEffect = {
      cardInstanceId:     card.instanceId,
      cardName:           card.card.name,
      cardDescription:    card.card.description,
      triggeringPlayerId: playerId,
      // Combat cards may affect any card in play — offer targeting for all combat cards
      targetScope:        "any_combat_card",
    }
    events.push({ type: "EFFECT_QUEUED", effect })
    return { ...s, activePlayer: playerId, pendingEffects: [...s.pendingEffects, effect] }
  }

  // Recalculate levels and update active player (new losing side goes next)
  const realmSlot = s.players[combat.defendingPlayer]!.formation.slots[combat.targetRealmSlot]
  const realmWorldId = realmSlot?.realm.card.worldId ?? 0
  const attackerLevel = calculateCombatLevel(
    newCombat.attacker!,
    newCombat.attackerCards,
    hasWorldMatch(newCombat.attacker!, realmWorldId),
    newCombat.effectSpecs,
    "offensive",
  )
  const defenderLevel = calculateCombatLevel(
    newCombat.defender!,
    newCombat.defenderCards,
    hasWorldMatch(newCombat.defender!, realmWorldId),
    newCombat.effectSpecs,
    "defensive",
  )
  const losingPlayer = getLosingPlayer(attackerLevel, defenderLevel, newCombat)

  return { ...s, activePlayer: losingPlayer }
}

function handleStopPlaying(
  state: GameState,
  playerId: PlayerId,
  events: GameEvent[],
): GameState {
  assertCombatPhase(state, "CARD_PLAY")
  const combat = state.combatState!

  const realmSlot = state.players[combat.defendingPlayer]!.formation.slots[combat.targetRealmSlot]
  const realmWorldId = realmSlot?.realm.card.worldId ?? 0

  // Use manual override if set, otherwise auto-compute
  const attackerLevel = combat.attackerManualLevel ?? calculateCombatLevel(
    combat.attacker!,
    combat.attackerCards,
    hasWorldMatch(combat.attacker!, realmWorldId),
    combat.effectSpecs,
    "offensive",
  )
  const defenderLevel = combat.defenderManualLevel ?? calculateCombatLevel(
    combat.defender!,
    combat.defenderCards,
    hasWorldMatch(combat.defender!, realmWorldId),
    combat.effectSpecs,
    "defensive",
  )

  const outcome = resolveCombatRound(attackerLevel, defenderLevel)
  events.push({ type: "COMBAT_RESOLVED", outcome, attackerLevel, defenderLevel })

  if (outcome === "ATTACKER_WINS") {
    return handleAttackerWins(state, combat, playerId, events)
  } else {
    return handleDefenderWins(state, combat, events)
  }
}

function handleContinueAttack(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "CONTINUE_ATTACK" }>,
  _events: GameEvent[],
): GameState {
  assertCombatPhase(state, "AWAITING_ATTACKER")
  const combat = state.combatState!
  if (playerId !== combat.attackingPlayer) {
    throw new EngineError("NOT_ATTACKER")
  }

  const player = state.players[playerId]!
  const poolEntry = player.pool.find(e => e.champion.instanceId === move.championId)
  if (!poolEntry) {
    throw new EngineError("CHAMPION_NOT_IN_POOL")
  }
  if (combat.championsUsedThisBattle.includes(move.championId)) {
    throw new EngineError("CHAMPION_ALREADY_USED", "Cannot reuse a champion in the same battle")
  }

  const newCombat: CombatState = {
    ...combat,
    roundPhase: "AWAITING_DEFENDER",
    attacker: poolEntry.champion,
    defender: null,
    attackerCards: [],
    defenderCards: [],
    championsUsedThisBattle: [...combat.championsUsedThisBattle, move.championId],
    attackerManualLevel: null,
    defenderManualLevel: null,
  }

  return {
    ...state,
    activePlayer: combat.defendingPlayer,
    combatState: newCombat,
  }
}

function handleEndAttack(
  state: GameState,
  playerId: PlayerId,
  _events: GameEvent[],
): GameState {
  assertCombatPhase(state, "AWAITING_ATTACKER")
  const combat = state.combatState!
  if (playerId !== combat.attackingPlayer) {
    throw new EngineError("NOT_ATTACKER")
  }
  return endBattle(state, combat.attackingPlayer, _events)
}

// ─── Pending Effect Handlers ──────────────────────────────────────────────────

/**
 * Resolves the first pending effect by targeting a specific card.
 * Only valid when targetScope !== "none". Removes the targeted card from
 * its current combat slot and discards it, then pops the effect queue.
 */
function handleResolveEffect(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "RESOLVE_EFFECT" }>,
  events: GameEvent[],
): GameState {
  const [effect, ...remaining] = state.pendingEffects
  if (!effect) throw new EngineError("NO_PENDING_EFFECT", "No effect awaiting resolution")
  if (effect.triggeringPlayerId !== playerId) {
    throw new EngineError("NOT_YOUR_EFFECT", "Only the triggering player may resolve this effect")
  }
  if (effect.targetScope === "none") {
    throw new EngineError("NO_TARGET_SCOPE", "This effect has no targetable component — use SKIP_EFFECT")
  }
  if (!state.combatState) {
    throw new EngineError("NOT_IN_COMBAT", "RESOLVE_EFFECT with a target requires active combat")
  }

  events.push({ type: "EFFECT_RESOLVED", cardInstanceId: effect.cardInstanceId, targetId: move.targetId })

  let s = removeCardFromCombat(state, move.targetId, events)
  s = { ...s, pendingEffects: remaining }

  // Once the queue is empty and we're still in CARD_PLAY, re-establish the losing player
  if (remaining.length === 0 && s.combatState?.roundPhase === "CARD_PLAY") {
    s = recalculateCombatActivePlayer(s)
  }

  return s
}

/**
 * Waives the first pending effect — it produces no mechanical consequence.
 * Always valid when effects are queued, regardless of targetScope.
 */
function handleSkipEffect(
  state: GameState,
  playerId: PlayerId,
  events: GameEvent[],
): GameState {
  const [effect, ...remaining] = state.pendingEffects
  if (!effect) throw new EngineError("NO_PENDING_EFFECT", "No effect awaiting resolution")
  if (effect.triggeringPlayerId !== playerId) {
    throw new EngineError("NOT_YOUR_EFFECT", "Only the triggering player may skip this effect")
  }

  events.push({ type: "EFFECT_RESOLVED", cardInstanceId: effect.cardInstanceId, targetId: null })

  let s = { ...state, pendingEffects: remaining }

  // Once the queue is empty and we're still in CARD_PLAY, re-establish the losing player
  if (remaining.length === 0 && s.combatState?.roundPhase === "CARD_PLAY") {
    s = recalculateCombatActivePlayer(s)
  }

  return s
}

// ─── Response Window Handler ──────────────────────────────────────────────────

function handlePassResponse(
  state: GameState,
  playerId: PlayerId,
  events: GameEvent[],
): GameState {
  if (!state.responseWindow) {
    throw new EngineError("NO_RESPONSE_WINDOW", "No response window is currently open")
  }
  if (state.responseWindow.respondingPlayerId !== playerId) {
    throw new EngineError("NOT_RESPONDER", "Only the responding player can pass the response")
  }

  events.push({ type: "RESPONSE_WINDOW_CLOSED" })

  // Give turn back to triggering player to execute the effect manually
  return { ...state, responseWindow: null, activePlayer: state.responseWindow.triggeringPlayerId }
}

// ─── Manual Board Control Handlers ───────────────────────────────────────────

/**
 * Searches all zones of a player's board for a card by instanceId.
 * Returns the card and a mutation function that removes it from its zone.
 */
function findAndRemoveFromOwnZones(
  state: GameState,
  ownerId: PlayerId,
  cardId: CardInstanceId,
): { card: CardInstance; newState: GameState } | null {
  const player = state.players[ownerId]!

  // Hand
  const handIdx = player.hand.findIndex(c => c.instanceId === cardId)
  if (handIdx !== -1) {
    const card = player.hand[handIdx]!
    return {
      card,
      newState: updatePlayer(state, ownerId, {
        hand: player.hand.filter((_, i) => i !== handIdx),
      }),
    }
  }

  // Pool (champion)
  const poolEntryIdx = player.pool.findIndex(e => e.champion.instanceId === cardId)
  if (poolEntryIdx !== -1) {
    const entry = player.pool[poolEntryIdx]!
    const card = entry.champion
    const newPool = player.pool.filter((_, i) => i !== poolEntryIdx)
    return {
      card,
      newState: updatePlayer(state, ownerId, {
        pool: newPool,
        // Attachments are discarded when champion is removed
        discardPile: [...player.discardPile, ...entry.attachments],
      }),
    }
  }

  // Pool (attachment)
  for (let ei = 0; ei < player.pool.length; ei++) {
    const entry = player.pool[ei]!
    const attIdx = entry.attachments.findIndex(a => a.instanceId === cardId)
    if (attIdx !== -1) {
      const card = entry.attachments[attIdx]!
      const newPool = [...player.pool]
      newPool[ei] = { ...entry, attachments: entry.attachments.filter((_, i) => i !== attIdx) }
      return { card, newState: updatePlayer(state, ownerId, { pool: newPool }) }
    }
  }

  // Discard pile
  const discardIdx = player.discardPile.findIndex(c => c.instanceId === cardId)
  if (discardIdx !== -1) {
    const card = player.discardPile[discardIdx]!
    return {
      card,
      newState: updatePlayer(state, ownerId, {
        discardPile: player.discardPile.filter((_, i) => i !== discardIdx),
      }),
    }
  }

  // Abyss
  const abyssIdx = player.abyss.findIndex(c => c.instanceId === cardId)
  if (abyssIdx !== -1) {
    const card = player.abyss[abyssIdx]!
    return {
      card,
      newState: updatePlayer(state, ownerId, {
        abyss: player.abyss.filter((_, i) => i !== abyssIdx),
      }),
    }
  }

  // Formation holdings
  for (const [slot, realmSlot] of Object.entries(player.formation.slots)) {
    if (!realmSlot) continue
    const holdingIdx = realmSlot.holdings.findIndex(h => h.instanceId === cardId)
    if (holdingIdx !== -1) {
      const card = realmSlot.holdings[holdingIdx]!
      const newSlots = {
        ...player.formation.slots,
        [slot]: { ...realmSlot, holdings: realmSlot.holdings.filter((_, i) => i !== holdingIdx) },
      }
      return {
        card,
        newState: updatePlayer(state, ownerId, {
          formation: { ...player.formation, slots: newSlots },
        }),
      }
    }
  }

  return null
}

function handleManualDiscard(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "MANUAL_DISCARD" }>,
  events: GameEvent[],
): GameState {
  const result = findAndRemoveFromOwnZones(state, playerId, move.cardInstanceId)
  if (!result) throw new EngineError("CARD_NOT_FOUND", "Card not found in any own zone")

  events.push({ type: "MANUAL_ZONE_MOVE", playerId, instanceId: move.cardInstanceId, from: "board", to: "discard" })

  const player = result.newState.players[playerId]!
  return updatePlayer(result.newState, playerId, {
    discardPile: [...player.discardPile, result.card],
  })
}

function handleManualToLimbo(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "MANUAL_TO_LIMBO" }>,
  events: GameEvent[],
): GameState {
  const player = state.players[playerId]!

  // Champion must be in pool
  const poolEntryIdx = player.pool.findIndex(e => e.champion.instanceId === move.cardInstanceId)
  if (poolEntryIdx === -1) throw new EngineError("CHAMPION_NOT_IN_POOL", "Only pool champions can be sent to limbo")

  const entry = player.pool[poolEntryIdx]!
  const returnsInTurns = move.returnsInTurns ?? 3
  const limboEntry: LimboEntry = {
    champion:     entry.champion,
    attachments:  entry.attachments,
    returnsOnTurn: state.currentTurn + returnsInTurns,
  }

  events.push({ type: "CHAMPION_TO_LIMBO", playerId, instanceId: entry.champion.instanceId, returnsOnTurn: limboEntry.returnsOnTurn })

  return updatePlayer(state, playerId, {
    pool:  player.pool.filter((_, i) => i !== poolEntryIdx),
    limbo: [...player.limbo, limboEntry],
  })
}

function handleManualToAbyss(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "MANUAL_TO_ABYSS" }>,
  events: GameEvent[],
): GameState {
  const result = findAndRemoveFromOwnZones(state, playerId, move.cardInstanceId)
  if (!result) throw new EngineError("CARD_NOT_FOUND", "Card not found in any own zone")

  events.push({ type: "CARD_TO_ABYSS", playerId, instanceId: move.cardInstanceId })

  const player = result.newState.players[playerId]!
  return updatePlayer(result.newState, playerId, {
    abyss: [...player.abyss, result.card],
  })
}

function handleManualToHand(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "MANUAL_TO_HAND" }>,
  events: GameEvent[],
): GameState {
  const player = state.players[playerId]!

  // Search discard pile
  const discardIdx = player.discardPile.findIndex(c => c.instanceId === move.cardInstanceId)
  if (discardIdx !== -1) {
    const card = player.discardPile[discardIdx]!
    events.push({ type: "MANUAL_ZONE_MOVE", playerId, instanceId: move.cardInstanceId, from: "discard", to: "hand" })
    return updatePlayer(state, playerId, {
      discardPile: player.discardPile.filter((_, i) => i !== discardIdx),
      hand: [...player.hand, card],
    })
  }

  // Search abyss
  const abyssIdx = player.abyss.findIndex(c => c.instanceId === move.cardInstanceId)
  if (abyssIdx !== -1) {
    const card = player.abyss[abyssIdx]!
    events.push({ type: "MANUAL_ZONE_MOVE", playerId, instanceId: move.cardInstanceId, from: "abyss", to: "hand" })
    return updatePlayer(state, playerId, {
      abyss: player.abyss.filter((_, i) => i !== abyssIdx),
      hand: [...player.hand, card],
    })
  }

  throw new EngineError("CARD_NOT_FOUND", "Card not found in discard or abyss")
}

function handleManualRazeRealm(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "MANUAL_RAZE_REALM" }>,
  events: GameEvent[],
): GameState {
  const player = state.players[playerId]!
  const realmSlot = player.formation.slots[move.slot]
  if (!realmSlot || realmSlot.isRazed) {
    throw new EngineError("INVALID_REALM", "Target slot has no active realm to raze")
  }

  events.push({ type: "MANUAL_REALM_RAZED", playerId, slot: move.slot })

  const discarded = realmSlot.holdings
  const newSlot = { ...realmSlot, isRazed: true, holdings: [] }
  let s = updatePlayer(state, playerId, {
    discardPile: [...player.discardPile, ...discarded],
    formation: {
      ...player.formation,
      slots: { ...player.formation.slots, [move.slot]: newSlot },
    },
  })

  s = checkZeroRealmCondition(s, events)
  return s
}

function handleManualDrawCards(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "MANUAL_DRAW_CARDS" }>,
  events: GameEvent[],
): GameState {
  const count = Math.max(0, Math.min(move.count, 20))  // safety cap: max 20
  const player = state.players[playerId]!
  const [drawn, remaining] = takeCards(player.drawPile, count)

  if (drawn.length === 0) return state

  events.push({ type: "MANUAL_CARDS_DRAWN", playerId, count: drawn.length })
  return updatePlayer(state, playerId, {
    hand:     [...player.hand, ...drawn],
    drawPile: remaining,
  })
}

function handleManualReturnToPool(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "MANUAL_RETURN_TO_POOL" }>,
  events: GameEvent[],
): GameState {
  const player = state.players[playerId]!
  const discardIdx = player.discardPile.findIndex(c => c.instanceId === move.cardInstanceId)
  if (discardIdx === -1) throw new EngineError("CARD_NOT_FOUND", "Champion not found in discard pile")

  const card = player.discardPile[discardIdx]!
  events.push({ type: "CHAMPION_PLACED", playerId, instanceId: card.instanceId })

  return updatePlayer(state, playerId, {
    discardPile: player.discardPile.filter((_, i) => i !== discardIdx),
    pool: [...player.pool, { champion: card, attachments: [] }],
  })
}

function handleManualAffectOpponent(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "MANUAL_AFFECT_OPPONENT" }>,
  events: GameEvent[],
): GameState {
  if (state.pendingEffects.length === 0) {
    throw new EngineError("NO_PENDING_EFFECT", "Can only affect opponent cards while a pending effect is active")
  }

  const opponentId = state.playerOrder.find(id => id !== playerId)!

  switch (move.action as ManualAction) {
    case "discard": {
      const result = findAndRemoveFromOwnZones(state, opponentId, move.cardInstanceId)
      if (!result) throw new EngineError("CARD_NOT_FOUND", "Card not found on opponent's board")
      events.push({ type: "MANUAL_ZONE_MOVE", playerId: opponentId, instanceId: move.cardInstanceId, from: "board", to: "discard" })
      const opp = result.newState.players[opponentId]!
      return updatePlayer(result.newState, opponentId, { discardPile: [...opp.discardPile, result.card] })
    }

    case "to_limbo": {
      const oppPlayer = state.players[opponentId]!
      const poolEntryIdx = oppPlayer.pool.findIndex(e => e.champion.instanceId === move.cardInstanceId)
      if (poolEntryIdx === -1) throw new EngineError("CHAMPION_NOT_IN_POOL", "Opponent champion not in pool")
      const entry = oppPlayer.pool[poolEntryIdx]!
      const limboEntry: LimboEntry = {
        champion:      entry.champion,
        attachments:   entry.attachments,
        returnsOnTurn: state.currentTurn + 3,
      }
      events.push({ type: "CHAMPION_TO_LIMBO", playerId: opponentId, instanceId: entry.champion.instanceId, returnsOnTurn: limboEntry.returnsOnTurn })
      return updatePlayer(state, opponentId, {
        pool:  oppPlayer.pool.filter((_, i) => i !== poolEntryIdx),
        limbo: [...oppPlayer.limbo, limboEntry],
      })
    }

    case "to_abyss": {
      const result = findAndRemoveFromOwnZones(state, opponentId, move.cardInstanceId)
      if (!result) throw new EngineError("CARD_NOT_FOUND", "Card not found on opponent's board")
      events.push({ type: "CARD_TO_ABYSS", playerId: opponentId, instanceId: move.cardInstanceId })
      const opp = result.newState.players[opponentId]!
      return updatePlayer(result.newState, opponentId, { abyss: [...opp.abyss, result.card] })
    }

    case "raze_realm": {
      // Find which formation slot contains this realm
      const oppPlayer = state.players[opponentId]!
      const slotEntry = Object.entries(oppPlayer.formation.slots)
        .find(([, s]) => s && s.realm.instanceId === move.cardInstanceId)
      if (!slotEntry) throw new EngineError("CARD_NOT_FOUND", "Opponent realm not found in formation")
      const [slot, realmSlotData] = slotEntry
      if (realmSlotData!.isRazed) throw new EngineError("ALREADY_RAZED", "Realm is already razed")

      events.push({ type: "REALM_RAZED", playerId: opponentId, slot: slot as FormationSlot })
      const discarded = realmSlotData!.holdings
      let s = updatePlayer(state, opponentId, {
        discardPile: [...oppPlayer.discardPile, ...discarded],
        formation: {
          ...oppPlayer.formation,
          slots: { ...oppPlayer.formation.slots, [slot]: { ...realmSlotData!, isRazed: true, holdings: [] } },
        },
      })
      s = checkZeroRealmCondition(s, events)
      return s
    }

    default:
      throw new EngineError("UNKNOWN_ACTION", `Unknown manual action: ${move.action}`)
  }
}

function handleManualSetCombatLevel(
  state: GameState,
  _playerId: PlayerId,
  move: Extract<Move, { type: "MANUAL_SET_COMBAT_LEVEL" }>,
  events: GameEvent[],
): GameState {
  if (!state.combatState) {
    throw new EngineError("NOT_IN_COMBAT", "MANUAL_SET_COMBAT_LEVEL requires active combat")
  }
  const combat = state.combatState
  const isAttacker = combat.attackingPlayer === move.playerId
  const isDefender = combat.defendingPlayer === move.playerId

  if (!isAttacker && !isDefender) {
    throw new EngineError("INVALID_PLAYER", "Player is not a combat participant")
  }

  events.push({ type: "COMBAT_LEVEL_SET", playerId: move.playerId, level: move.level })

  const newCombat: CombatState = isAttacker
    ? { ...combat, attackerManualLevel: move.level }
    : { ...combat, defenderManualLevel: move.level }

  return { ...state, combatState: newCombat }
}

function handleManualSwitchCombatSide(
  state: GameState,
  _playerId: PlayerId,
  move: Extract<Move, { type: "MANUAL_SWITCH_COMBAT_SIDE" }>,
  events: GameEvent[],
): GameState {
  if (!state.combatState) {
    throw new EngineError("NOT_IN_COMBAT", "MANUAL_SWITCH_COMBAT_SIDE requires active combat")
  }
  const combat = state.combatState
  const { cardInstanceId } = move

  const inAttacker = combat.attackerCards.some(c => c.instanceId === cardInstanceId)
  const inDefender = combat.defenderCards.some(c => c.instanceId === cardInstanceId)

  if (!inAttacker && !inDefender) {
    throw new EngineError("TARGET_NOT_FOUND", "Card is not in active combat")
  }

  const card = (inAttacker ? combat.attackerCards : combat.defenderCards)
    .find(c => c.instanceId === cardInstanceId)!

  events.push({
    type: "MANUAL_ZONE_MOVE",
    playerId: inAttacker ? combat.attackingPlayer : combat.defendingPlayer,
    instanceId: cardInstanceId,
    from: inAttacker ? "attacker_combat" : "defender_combat",
    to:   inAttacker ? "defender_combat" : "attacker_combat",
  })

  const newCombat: CombatState = inAttacker
    ? {
        ...combat,
        attackerCards: combat.attackerCards.filter(c => c.instanceId !== cardInstanceId),
        defenderCards: [...combat.defenderCards, card],
      }
    : {
        ...combat,
        defenderCards: combat.defenderCards.filter(c => c.instanceId !== cardInstanceId),
        attackerCards: [...combat.attackerCards, card],
      }

  return { ...state, combatState: newCombat }
}

/** Removes a card from the active combat (either side) and discards it. */
function removeCardFromCombat(
  state: GameState,
  targetId: CardInstanceId,
  events: GameEvent[],
): GameState {
  const combat = state.combatState!

  const isAttackerCard = combat.attackerCards.some(c => c.instanceId === targetId)
  const isDefenderCard = combat.defenderCards.some(c => c.instanceId === targetId)

  if (!isAttackerCard && !isDefenderCard) {
    throw new EngineError("TARGET_NOT_FOUND", "Target card is not in active combat")
  }

  const ownerId = isAttackerCard ? combat.attackingPlayer : combat.defendingPlayer
  const owner = state.players[ownerId]!
  const card = (isAttackerCard ? combat.attackerCards : combat.defenderCards)
    .find(c => c.instanceId === targetId)!

  events.push({ type: "CARDS_DISCARDED", playerId: ownerId, instanceIds: [targetId] })

  const newCombat: CombatState = isAttackerCard
    ? { ...combat, attackerCards: combat.attackerCards.filter(c => c.instanceId !== targetId) }
    : { ...combat, defenderCards: combat.defenderCards.filter(c => c.instanceId !== targetId) }

  return updatePlayer(
    { ...state, combatState: newCombat },
    ownerId,
    { discardPile: [...owner.discardPile, card] },
  )
}

/** Re-establishes activePlayer as the losing side after effects resolve in CARD_PLAY. */
function recalculateCombatActivePlayer(state: GameState): GameState {
  const combat = state.combatState!
  const realmSlot = state.players[combat.defendingPlayer]!.formation.slots[combat.targetRealmSlot]
  const realmWorldId = realmSlot?.realm.card.worldId ?? 0

  const attackerLevel = calculateCombatLevel(
    combat.attacker!, combat.attackerCards,
    hasWorldMatch(combat.attacker!, realmWorldId), combat.effectSpecs, "offensive",
  )
  const defenderLevel = calculateCombatLevel(
    combat.defender!, combat.defenderCards,
    hasWorldMatch(combat.defender!, realmWorldId), combat.effectSpecs, "defensive",
  )
  const losingPlayer = getLosingPlayer(attackerLevel, defenderLevel, combat)
  return { ...state, activePlayer: losingPlayer }
}

// ─── Combat Resolution Helpers ────────────────────────────────────────────────

function handleAttackerWins(
  state: GameState,
  combat: CombatState,
  _playerId: PlayerId,
  events: GameEvent[],
): GameState {
  const defendingPlayer = state.players[combat.defendingPlayer]!

  // Check if the defender is the self-defending realm (not a pool champion)
  const targetRealmSlot = defendingPlayer.formation.slots[combat.targetRealmSlot]
  const isRealmDefender = !defendingPlayer.pool.some(
    e => e.champion.instanceId === combat.defender!.instanceId,
  ) && targetRealmSlot?.realm.instanceId === combat.defender!.instanceId

  // Discard attacker's combat cards (allies/spells); their champion stays in pool
  const attackerDiscards = combat.attackerCards
  if (attackerDiscards.length > 0) {
    events.push({
      type: "CARDS_DISCARDED",
      playerId: combat.attackingPlayer,
      instanceIds: attackerDiscards.map(c => c.instanceId),
    })
  }

  let s = state
  const attackingPlayer = s.players[combat.attackingPlayer]!
  s = updatePlayer(s, combat.attackingPlayer, {
    discardPile: [...attackingPlayer.discardPile, ...attackerDiscards],
  })

  if (isRealmDefender) {
    // Realm self-defended and lost — raze the realm, discard any combat cards, end battle
    const defenderCardDiscards = combat.defenderCards
    if (defenderCardDiscards.length > 0) {
      events.push({
        type: "CARDS_DISCARDED",
        playerId: combat.defendingPlayer,
        instanceIds: defenderCardDiscards.map(c => c.instanceId),
      })
      const dp = s.players[combat.defendingPlayer]!
      s = updatePlayer(s, combat.defendingPlayer, {
        discardPile: [...dp.discardPile, ...defenderCardDiscards],
      })
    }
    s = razeRealm(s, combat.defendingPlayer, combat.targetRealmSlot, events)
    s = earnSpoils(s, combat.attackingPlayer, events)
    return endBattle(s, combat.attackingPlayer, events)
  }

  // Discard defender champion + pool entry attachments + all combat cards
  const defenderEntry = defendingPlayer.pool.find(
    e => e.champion.instanceId === combat.defender!.instanceId,
  )
  const allDefenderDiscards: CardInstanceId[] = []

  if (defenderEntry) {
    allDefenderDiscards.push(
      defenderEntry.champion.instanceId,
      ...defenderEntry.attachments.map(a => a.instanceId),
    )
    events.push({ type: "CHAMPION_DISCARDED", playerId: combat.defendingPlayer, instanceId: defenderEntry.champion.instanceId })
  }
  allDefenderDiscards.push(...combat.defenderCards.map(c => c.instanceId))

  const defenderDiscardCards = [
    ...(defenderEntry ? [defenderEntry.champion, ...defenderEntry.attachments] : []),
    ...combat.defenderCards,
  ]
  const newDefenderPool = s.players[combat.defendingPlayer]!.pool.filter(
    e => e.champion.instanceId !== combat.defender!.instanceId,
  )
  const dp2 = s.players[combat.defendingPlayer]!
  s = updatePlayer(s, combat.defendingPlayer, {
    pool: newDefenderPool,
    discardPile: [...dp2.discardPile, ...defenderDiscardCards],
  })

  // Transition to AWAITING_ATTACKER for potential next round
  const newCombat: CombatState = {
    ...combat,
    roundPhase: "AWAITING_ATTACKER",
    attacker: null,
    defender: null,
    attackerCards: [],
    defenderCards: [],
    championsUsedThisBattle: [...combat.championsUsedThisBattle, combat.defender!.instanceId],
  }

  return {
    ...s,
    activePlayer: combat.attackingPlayer,
    combatState: newCombat,
  }
}

function handleDefenderWins(
  state: GameState,
  combat: CombatState,
  events: GameEvent[],
): GameState {
  const attackingPlayer = state.players[combat.attackingPlayer]!

  // Discard attacker champion + pool entry attachments + all combat cards
  const attackerEntry = attackingPlayer.pool.find(
    e => e.champion.instanceId === combat.attacker!.instanceId,
  )

  if (attackerEntry) {
    events.push({ type: "CHAMPION_DISCARDED", playerId: combat.attackingPlayer, instanceId: attackerEntry.champion.instanceId })
  }

  const attackerDiscardCards = [
    ...(attackerEntry ? [attackerEntry.champion, ...attackerEntry.attachments] : []),
    ...combat.attackerCards,
  ]
  const newAttackerPool = attackingPlayer.pool.filter(
    e => e.champion.instanceId !== combat.attacker!.instanceId,
  )

  // Discard defender's combat cards; their champion stays in pool
  const defenderDiscards = combat.defenderCards

  let s = updatePlayer(state, combat.attackingPlayer, {
    pool: newAttackerPool,
    discardPile: [...attackingPlayer.discardPile, ...attackerDiscardCards],
  })

  const defendingPlayer = s.players[combat.defendingPlayer]!
  s = updatePlayer(s, combat.defendingPlayer, {
    discardPile: [...defendingPlayer.discardPile, ...defenderDiscards],
  })

  // Defender earns spoils
  s = earnSpoils(s, combat.defendingPlayer, events)

  return endBattle(s, combat.attackingPlayer, events)
}

// ─── Shared Combat / Turn Helpers ─────────────────────────────────────────────

function razeRealm(
  state: GameState,
  ownerId: PlayerId,
  slot: FormationSlot,
  events: GameEvent[],
): GameState {
  const player = state.players[ownerId]!
  const realmSlot = player.formation.slots[slot]
  if (!realmSlot) return state

  events.push({ type: "REALM_RAZED", playerId: ownerId, slot })

  // Holdings are discarded when realm is razed
  const discarded = realmSlot.holdings
  const newSlot = { ...realmSlot, isRazed: true, holdings: [] }

  let s = updatePlayer(state, ownerId, {
    discardPile: [...player.discardPile, ...discarded],
    formation: {
      ...player.formation,
      slots: { ...player.formation.slots, [slot]: newSlot },
    },
  })

  // If the owner now has no unrazed realms, their pool is immediately lost.
  s = checkZeroRealmCondition(s, events)
  return s
}

function earnSpoils(state: GameState, playerId: PlayerId, events: GameEvent[]): GameState {
  events.push({ type: "SPOILS_EARNED", playerId })

  const player = state.players[playerId]!
  if (player.drawPile.length === 0) return state

  const [drawn, remaining] = takeCards(player.drawPile, 1)
  return updatePlayer(state, playerId, {
    hand: [...player.hand, ...drawn],
    drawPile: remaining,
  })
}

function endBattle(state: GameState, nextActivePlayer: PlayerId, _events: GameEvent[]): GameState {
  return {
    ...state,
    activePlayer: nextActivePlayer,
    phase: Phase.Combat,
    combatState: null,
  }
}

function processLimboReturns(
  state: GameState,
  playerId: PlayerId,
  events: GameEvent[],
): GameState {
  const player = state.players[playerId]!
  const returning = player.limbo.filter(e => e.returnsOnTurn <= state.currentTurn)
  const remaining = player.limbo.filter(e => e.returnsOnTurn > state.currentTurn)

  if (returning.length === 0) return state

  for (const entry of returning) {
    events.push({ type: "CHAMPION_FROM_LIMBO", playerId, instanceId: entry.champion.instanceId })
  }

  // If an identical champion is already in play, discard the returning one instead
  let s = state
  const toReturn: PoolEntry[] = []
  const toDiscard: LimboEntry[] = []

  for (const entry of returning) {
    const alreadyInPlay = s.players[playerId]!.pool.some(
      p => p.champion.card.name === entry.champion.card.name &&
        p.champion.card.typeId === entry.champion.card.typeId,
    )
    if (alreadyInPlay) {
      toDiscard.push(entry)
    } else {
      toReturn.push({ champion: entry.champion, attachments: entry.attachments })
    }
  }

  const discardedCards = toDiscard.flatMap(e => [e.champion, ...e.attachments])
  const returnedPool = [...s.players[playerId]!.pool, ...toReturn]

  return updatePlayer(s, playerId, {
    pool: returnedPool,
    limbo: remaining,
    discardPile: [...s.players[playerId]!.discardPile, ...discardedCards],
  })
}

function checkZeroRealmCondition(state: GameState, events: GameEvent[]): GameState {
  let s = state

  for (const [playerId, player] of Object.entries(state.players)) {
    const hasAnyRealm = Object.values(player.formation.slots).some(slot => slot !== undefined)
    if (!hasAnyRealm) continue

    const hasUnrazed = Object.values(player.formation.slots).some(
      slot => slot && !slot.isRazed,
    )
    if (hasUnrazed) continue

    // All realms are razed — discard all pool champions
    if (player.pool.length === 0) continue

    const discarded = player.pool.flatMap(e => [e.champion, ...e.attachments])
    events.push({ type: "POOL_CLEARED", playerId })
    s = updatePlayer(s, playerId, {
      pool: [],
      discardPile: [...player.discardPile, ...discarded],
    })
  }

  return s
}

function checkWinCondition(state: GameState, events: GameEvent[]): GameState {
  // A player wins when they have a full formation of unrazed realms at the start of their turn.
  const playerId = state.activePlayer
  const player = state.players[playerId]!

  const unrazedCount = Object.values(player.formation.slots)
    .filter(slot => slot && !slot.isRazed).length

  if (unrazedCount >= player.formation.size) {
    events.push({ type: "GAME_OVER", winner: playerId })
    return { ...state, winner: playerId }
  }

  return state
}

// ─── Phase Advancement Helper ─────────────────────────────────────────────────

/** Phase order for auto-advancement */
const PHASE_ORDER = [Phase.PlayRealm, Phase.Pool, Phase.Combat, Phase.PhaseFive] as const

/**
 * Advances through intermediate phases from the current phase to the target phase,
 * running each phase's PASS side-effects (limbo returns, etc.) along the way.
 */
function advanceToPhase(
  state: GameState,
  playerId: PlayerId,
  targetPhase: Phase,
  events: GameEvent[],
): GameState {
  let s = state
  const startIdx = PHASE_ORDER.indexOf(s.phase as typeof PHASE_ORDER[number])
  const endIdx = PHASE_ORDER.indexOf(targetPhase as typeof PHASE_ORDER[number])

  if (startIdx < 0 || endIdx < 0 || startIdx >= endIdx) return s

  // Walk through each intermediate phase via handlePass
  for (let i = startIdx; i < endIdx; i++) {
    s = handlePass(s, playerId, events)
  }
  return s
}

/**
 * Handles END_TURN move — skips remaining phases and ends the turn.
 * Only valid when hand ≤ maxEnd (no forced discards needed).
 */
function handleEndTurn(
  state: GameState,
  playerId: PlayerId,
  events: GameEvent[],
): GameState {
  assertNotInCombat(state)

  const player = state.players[playerId]!
  const { maxEnd } = HAND_SIZES[state.deckSize]!
  if (player.hand.length > maxEnd) {
    throw new EngineError("HAND_TOO_LARGE", `Discard down to ${maxEnd} cards before ending turn`)
  }

  // Advance to PhaseFive first (running side-effects for skipped phases)
  let s = state
  if (s.phase !== Phase.PhaseFive) {
    s = advanceToPhase(s, playerId, Phase.PhaseFive, events)
  }

  // Now do the PhaseFive → EndTurn transition (same as PASS from PhaseFive)
  return handlePass(s, playerId, events)
}

// ─── Assertions ───────────────────────────────────────────────────────────────

function assertPhase(state: GameState, phase: Phase): void {
  if (state.phase !== phase) {
    throw new EngineError("WRONG_PHASE", `Expected ${phase}, got ${state.phase}`)
  }
}

function assertNotInCombat(state: GameState): void {
  if (state.combatState !== null) {
    throw new EngineError("IN_COMBAT", "Cannot PASS during active combat")
  }
}

function assertCombatPhase(state: GameState, phase: CombatState["roundPhase"]): void {
  if (!state.combatState) {
    throw new EngineError("NOT_IN_COMBAT")
  }
  if (state.combatState.roundPhase !== phase) {
    throw new EngineError("WRONG_COMBAT_PHASE", `Expected ${phase}, got ${state.combatState.roundPhase}`)
  }
}
