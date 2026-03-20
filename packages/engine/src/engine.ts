import type {
  GameState,
  GameEvent,
  Move,
  EngineResult,
  PlayerId,
  CardInstanceId,
  CardInstance,
  FormationSlot,
  CombatState,
  PoolEntry,
  LimboEntry,
} from "./types.ts"
import { Phase } from "./types.ts"
import { CardTypeId, HAND_SIZES } from "./constants.ts"
import {
  updatePlayer,
  removeFromHand,
  takeCards,
  nextPlayer,
  isChampionType,
  isSpellType,
  findOrPromoteChampion,
} from "./utils.ts"
import {
  calculateCombatLevel,
  hasWorldMatch,
  getLosingPlayer,
  getPoolAttachments,
  getCombatLevels,
} from "./combat.ts"
import {
  getLegalMoves,
  getLegalRealmSlots,
  isAttackable,
  isUniqueInPlay,
  canPlayInCombat,
} from "./legal-moves.ts"
import { canChampionUseSpell, getCastPhases } from "./spell-gating.ts"
import type { SpellCastContext } from "./spell-gating.ts"
import {
  handleResolveMoveCard,
  handleResolveAttachCard,
  handleResolveRazeRealm,
  handleResolveRebuildRealm,
  handleResolveDrawCards,
  handleResolveReturnToPool,
  handleResolveSetCardDestination,
  handleResolveDone,
  openResolutionContext,
  handlePassCounter,
  handleCounterPlay,
  handlePoolCounter,
} from "./resolution.ts"
import {
  populateTriggers,
  handleResolveTriggerPeek,
  handleResolveTriggerDiscardPeeked,
  handleResolveTriggerDiscardFromHand,
  handleResolveTriggerDone,
} from "./triggers.ts"
export { EngineError } from "./errors.ts"
import { EngineError } from "./errors.ts"

/**
 * The core engine function. Pure — no side effects.
 * Validates the move, applies it, and returns the new state with events and legal moves.
 */
export function applyMove(
  state: GameState,
  playerId: PlayerId,
  move: Move,
  opts?: { devMode?: boolean },
): EngineResult {
  if (state.winner !== null) {
    throw new EngineError("GAME_OVER", "Game is already over")
  }

  // Dev-only: bypass all validation, add a card directly to any player's hand
  if (move.type === "DEV_GIVE_CARD") {
    if (!opts?.devMode) {
      throw new EngineError("DEV_ONLY", "DEV_GIVE_CARD is not allowed outside dev mode")
    }
    const target = state.players[move.playerId]
    if (!target) throw new EngineError("INVALID_PLAYER", "Player not found")
    const newState: GameState = {
      ...state,
      players: {
        ...state.players,
        [move.playerId]: {
          ...target,
          hand: [...target.hand, { instanceId: move.instanceId, card: move.card }],
        },
      },
    }
    return { newState, events: [], legalMoves: getLegalMoves(newState, state.activePlayer) }
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
    case "RAZE_OWN_REALM":
      newState = handleRazeOwnRealm(state, playerId, move, events)
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
    case "INTERRUPT_COMBAT":
      newState = handleInterruptCombat(state, playerId, events)
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
    case "CLAIM_SPOIL":
      newState = handleClaimSpoil(state, playerId, events)
      break
    case "PLAY_EVENT":
      // If a counter window is open and this player is not the resolving player,
      // treat this as a counter play (cancels original resolution, places both cards).
      if (
        state.resolutionContext?.counterWindowOpen &&
        playerId !== state.resolutionContext.resolvingPlayer
      ) {
        newState = handleCounterPlay(state, playerId, move.cardInstanceId, events)
      } else {
        newState = handlePlaySpellCard(state, playerId, move, events)
      }
      break
    case "SET_COMBAT_LEVEL":
      newState = handleSetCombatLevel(state, playerId, move, events)
      break
    case "SWITCH_COMBAT_SIDE":
      newState = handleSwitchCombatSide(state, playerId, move, events)
      break
    case "RETURN_COMBAT_CARD_TO_POOL":
      newState = handleReturnCombatCardToPool(state, playerId, move, events)
      break
    case "RETURN_COMBAT_CARD_TO_HAND":
      newState = handleReturnCombatCardToHand(state, playerId, move, events)
      break
    case "SWAP_COMBAT_CHAMPION":
      newState = handleSwapCombatChampion(state, playerId, move, events)
      break
    case "REQUIRE_NEW_CHAMPION":
      newState = handleRequireNewChampion(state, playerId, move, events)
      break
    case "ALLOW_CHAMPION_REUSE":
      newState = handleAllowChampionReuse(state, playerId, move, events)
      break
    case "RETURN_FROM_DISCARD":
      newState = handleReturnFromDiscard(state, playerId, move, events)
      break
    case "RESOLVE_MOVE_CARD":
      newState = handleResolveMoveCard(state, playerId, move, events)
      break
    case "RESOLVE_ATTACH_CARD":
      newState = handleResolveAttachCard(state, playerId, move, events)
      break
    case "RESOLVE_RAZE_REALM":
      newState = handleResolveRazeRealm(state, playerId, move, events)
      break
    case "RESOLVE_REBUILD_REALM":
      newState = handleResolveRebuildRealm(state, playerId, move, events)
      break
    case "RESOLVE_DRAW_CARDS":
      newState = handleResolveDrawCards(state, playerId, move, events)
      break
    case "RESOLVE_RETURN_TO_POOL":
      newState = handleResolveReturnToPool(state, playerId, move, events)
      break
    case "RESOLVE_SET_CARD_DESTINATION":
      newState = handleResolveSetCardDestination(state, playerId, move, events)
      break
    case "RESOLVE_DONE":
      newState = handleResolveDone(state, playerId, events)
      break
    case "RESOLVE_TRIGGER_PEEK":
      newState = handleResolveTriggerPeek(state, playerId, move, events)
      break
    case "RESOLVE_TRIGGER_DISCARD_PEEKED":
      newState = handleResolveTriggerDiscardPeeked(state, playerId, move, events)
      break
    case "RESOLVE_TRIGGER_DISCARD_FROM_HAND":
      newState = handleResolveTriggerDiscardFromHand(state, playerId, move, events)
      break
    case "RESOLVE_TRIGGER_DONE":
      newState = handleResolveTriggerDone(state, playerId, events)
      break
    case "PASS_COUNTER":
      newState = handlePassCounter(state, playerId)
      break
    case "USE_POOL_COUNTER":
      newState = handlePoolCounter(state, playerId, move.cardInstanceId, events)
      break
    default:
      throw new EngineError("UNKNOWN_MOVE", `Unrecognised move type`)
  }

  const newStateWithEvents: GameState = {
    ...newState,
    events: [...state.events, ...events],
  }

  return {
    newState: newStateWithEvents,
    events,
    legalMoves: getLegalMoves(newStateWithEvents, newStateWithEvents.activePlayer),
  }
}

// ─── Out-of-turn validation ───────────────────────────────────────────────────

function isValidOutOfTurnMove(state: GameState, playerId: PlayerId, move: Move): boolean {
  // During resolution, the resolving player can make RESOLVE_* moves even out of turn
  if (state.resolutionContext && playerId === state.resolutionContext.resolvingPlayer) {
    return move.type.startsWith("RESOLVE_")
  }

  // Non-resolving player may pass or play counter cards during the counter window
  if (
    state.resolutionContext?.counterWindowOpen &&
    playerId !== state.resolutionContext.resolvingPlayer
  ) {
    if (move.type === "PASS_COUNTER") return true
    if (move.type === "PLAY_EVENT") return true
    if (move.type === "USE_POOL_COUNTER") return true
  }

  // Discard and raze are always available for any player
  if (move.type === "DISCARD_CARD") return true
  if (move.type === "RAZE_OWN_REALM") return true

  // Events are always playable by any player out of combat
  if (move.type === "PLAY_EVENT" && !state.combatState) {
    return true
  }

  const combat = state.combatState
  if (!combat) return false

  const isAttacker = playerId === combat.attackingPlayer
  const isDefender = playerId === combat.defendingPlayer
  const isCombatParticipant = isAttacker || isDefender

  // Events and interrupt are always playable by any combat participant at any combat phase
  if (isCombatParticipant && move.type === "PLAY_EVENT") return true
  if (isCombatParticipant && move.type === "INTERRUPT_COMBAT") return true

  if (combat.roundPhase === "AWAITING_DEFENDER" && isDefender) {
    return move.type === "DECLARE_DEFENSE" || move.type === "DECLINE_DEFENSE"
  }

  if (combat.roundPhase === "CARD_PLAY" && isCombatParticipant) {
    return (
      move.type === "SET_COMBAT_LEVEL" ||
      move.type === "SWITCH_COMBAT_SIDE" ||
      move.type === "PLAY_COMBAT_CARD" ||
      move.type === "STOP_PLAYING" ||
      move.type === "RETURN_COMBAT_CARD_TO_POOL" ||
      move.type === "RETURN_COMBAT_CARD_TO_HAND" ||
      move.type === "SWAP_COMBAT_CHAMPION" ||
      move.type === "REQUIRE_NEW_CHAMPION" ||
      move.type === "ALLOW_CHAMPION_REUSE"
    )
  }

  return false
}

function isPhase3Card(typeId: number): boolean {
  return isSpellType(typeId) || typeId === CardTypeId.BloodAbility
}

// ─── Phase Handlers ───────────────────────────────────────────────────────────

function handlePass(state: GameState, playerId: PlayerId, events: GameEvent[]): GameState {
  assertNotInCombat(state)

  switch (state.phase) {
    case Phase.StartOfTurn: {
      const player = state.players[playerId]!
      const drawCount = HAND_SIZES[state.deckSize]!.drawPerTurn
      const [drawn, remainingDraw] = takeCards(player.drawPile, drawCount)

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

      // Queue end-of-turn triggers once; return early so player can resolve them
      if (!state.endTriggersPopulated) {
        let s = { ...state, endTriggersPopulated: true }
        s = populateTriggers(s, "end", events)
        if (s.pendingTriggers.length > 0) return s
        // No end triggers — fall through to normal turn-end
        state = s
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
        pendingSpoil: null,
        endTriggersPopulated: false,
      }
      events.push({ type: "TURN_STARTED", playerId: nextId, turn: s.currentTurn })
      events.push({ type: "PHASE_CHANGED", phase: Phase.StartOfTurn })
      // Win condition: next player wins if they have a full unrazed formation
      s = checkWinCondition(s, events)
      if (s.winner) return s
      // Queue start-of-turn triggers for the new active player
      s = populateTriggers(s, "start", events)
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

  events.push({ type: "CARDS_DISCARDED", playerId, instanceIds: [card.instanceId] })
  return updatePlayer(state, playerId, {
    hand: newHand,
    discardPile: [...player.discardPile, card],
  })
}

function handlePlayRealm(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "PLAY_REALM" }>,
  events: GameEvent[],
): GameState {
  // Skip draw phase without drawing — player chose to play realm instead of drawing
  if (state.phase === Phase.StartOfTurn) {
    state = { ...state, phase: Phase.PlayRealm }
    events.push({ type: "PHASE_CHANGED", phase: Phase.PlayRealm })
  }
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

  const ids = move.cardInstanceIds
  const unique = new Set(ids)
  if (unique.size !== 3) {
    throw new EngineError("DUPLICATE_CARDS", "Must discard 3 distinct cards")
  }
  const discarded = ids.map((id) => {
    const c = player.hand.find((h) => h.instanceId === id)
    if (!c) throw new EngineError("CARD_NOT_IN_HAND", `Card ${id} is not in hand`)
    return c
  })
  const discardedIds = ids
  events.push({
    type: "REALM_REBUILT",
    playerId,
    slot: move.slot,
    realmName: realmSlot.realm.card.name,
    discardedIds,
  })

  const discardSet = new Set(ids)
  let s = {
    ...updatePlayer(state, playerId, {
      hand: player.hand.filter((c) => !discardSet.has(c.instanceId)),
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

function handleRazeOwnRealm(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "RAZE_OWN_REALM" }>,
  events: GameEvent[],
): GameState {
  const player = state.players[playerId]!
  const realmSlot = player.formation.slots[move.slot]
  if (!realmSlot || realmSlot.isRazed) {
    throw new EngineError("NOT_RAZEABLE", `Slot ${move.slot} is not an unrazed realm`)
  }

  events.push({
    type: "REALM_RAZED",
    playerId,
    slot: move.slot,
    realmName: realmSlot.realm.card.name,
  })

  const newSlot = { ...realmSlot, isRazed: true, holdings: [] }
  return updatePlayer(state, playerId, {
    discardPile: [...player.discardPile, ...realmSlot.holdings],
    formation: {
      ...player.formation,
      slots: { ...player.formation.slots, [move.slot]: newSlot },
    },
  })
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
  if (!realmSlot) {
    throw new EngineError("INVALID_REALM", "No realm in that slot")
  }
  const isRebuilder = card.card.effects.some((e) => e.type === "rebuild_realm")
  if (realmSlot.isRazed && !isRebuilder) {
    throw new EngineError("INVALID_REALM", "Target realm must be in play and unrazed")
  }
  if (!realmSlot.isRazed && realmSlot.holdings.length > 0) {
    throw new EngineError("HOLDING_OCCUPIED", "Realm already has a holding")
  }
  if (!isUniqueInPlay(card.card, state)) {
    throw new EngineError("COSMOS_VIOLATION", `${card.card.name} is already in play`)
  }

  if (isRebuilder && realmSlot.isRazed) {
    events.push({
      type: "REALM_REBUILT",
      playerId,
      slot: move.realmSlot,
      realmName: realmSlot.realm.card.name,
      discardedIds: [],
    })
  }
  events.push({
    type: "HOLDING_PLAYED",
    playerId,
    instanceId: card.instanceId,
    slot: move.realmSlot,
  })

  const updatedSlot = {
    ...realmSlot,
    isRazed: isRebuilder && realmSlot.isRazed ? false : realmSlot.isRazed,
    holdings: [...realmSlot.holdings, card],
    holdingRevealedToAll: isRebuilder && realmSlot.isRazed ? true : false,
  }

  let s = {
    ...updatePlayer(state, playerId, {
      hand: newHand,
      formation: {
        ...player.formation,
        slots: {
          ...player.formation.slots,
          [move.realmSlot]: updatedSlot,
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
  // Auto-advance to Pool from earlier phases
  if (state.phase === Phase.StartOfTurn) {
    state = advanceToPhase(state, playerId, Phase.PlayRealm, events)
  }
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
  // Auto-advance to Pool from earlier phases
  if (state.phase === Phase.StartOfTurn) {
    state = advanceToPhase(state, playerId, Phase.PlayRealm, events)
  }
  if (state.phase === Phase.PlayRealm) {
    state = advanceToPhase(state, playerId, Phase.Pool, events)
  }
  assertPhase(state, Phase.Pool)
  const player = state.players[playerId]!
  const [card, newHand] = removeFromHand(player.hand, move.cardInstanceId)

  const entryIdx = player.pool.findIndex((e) => e.champion.instanceId === move.championId)
  if (entryIdx === -1) {
    throw new EngineError("CHAMPION_NOT_IN_POOL")
  }

  const entry = player.pool[entryIdx]!

  if (card.card.typeId === CardTypeId.Artifact) {
    if (!isUniqueInPlay(card.card, state)) {
      throw new EngineError("COSMOS_VIOLATION", `${card.card.name} is already in play`)
    }
    if (entry.attachments.some((a) => a.card.typeId === CardTypeId.Artifact)) {
      throw new EngineError("ARTIFACT_ALREADY_ATTACHED", "Champion already has an artifact")
    }
  }

  events.push({
    type: "ITEM_ATTACHED",
    playerId,
    itemId: card.instanceId,
    championId: move.championId,
  })

  const newPool = [...player.pool]
  newPool[entryIdx] = { ...entry, attachments: [...entry.attachments, card] }

  return updatePlayer(state, playerId, { hand: newHand, pool: newPool })
}

/** Generic handler for Phase 3 spells, Phase 5 cards, and events. */
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
  if (move.type === "PLAY_PHASE3_CARD") {
    assertPhase(state, Phase.Pool)
  } else if (move.type === "PLAY_PHASE5_CARD") {
    assertPhase(state, Phase.PhaseFive)
  }

  const player = state.players[playerId]!
  const [card, newHand] = removeFromHand(player.hand, move.cardInstanceId)

  if (move.type === "PLAY_EVENT" && card.card.typeId !== CardTypeId.Event) {
    throw new EngineError("NOT_AN_EVENT")
  }

  if (move.type === "PLAY_PHASE3_CARD" && !isPhase3Card(card.card.typeId)) {
    throw new EngineError("NOT_A_PHASE3_CARD")
  }

  if (
    move.type === "PLAY_PHASE5_CARD" &&
    card.card.typeId !== CardTypeId.Event &&
    !isSpellType(card.card.typeId)
  ) {
    throw new EngineError("NOT_A_PHASE5_CARD")
  }

  if (isSpellType(card.card.typeId)) {
    if (move.type === "PLAY_PHASE3_CARD") {
      if (!getCastPhases(card).includes(3)) {
        throw new EngineError("SPELL_NOT_PLAYABLE_IN_PHASE", "Spell cannot be cast in phase 3")
      }
    } else if (move.type === "PLAY_PHASE5_CARD") {
      if (!getCastPhases(card).includes(5)) {
        throw new EngineError("SPELL_NOT_PLAYABLE_IN_PHASE", "Spell cannot be cast in phase 5")
      }
    } else {
      throw new EngineError("WRONG_MOVE_TYPE", "Use PLAY_COMBAT_CARD for combat spells")
    }

    if (
      !player.pool.some((entry) =>
        canChampionUseSpell(card, entry.champion, {
          attachments: entry.attachments.map((a) => a.card),
        }),
      )
    ) {
      throw new EngineError("CHAMPION_CANNOT_CAST_SPELL")
    }

    if (move.type === "PLAY_PHASE3_CARD") {
      events.push({
        type: "PHASE3_SPELL_CAST",
        playerId,
        instanceId: card.instanceId,
        setId: card.card.setId,
        cardNumber: card.card.cardNumber,
        cardName: card.card.name,
        cardTypeId: card.card.typeId,
        ...(move.casterInstanceId != null ? { casterInstanceId: move.casterInstanceId } : {}),
        ...(move.targetCardInstanceId != null
          ? { targetCardInstanceId: move.targetCardInstanceId }
          : {}),
        ...(move.targetOwner != null ? { targetOwner: move.targetOwner } : {}),
      })
    }
  }

  // Remove card from hand; open resolution context (player decides destination)
  const isEvent = card.card.typeId === CardTypeId.Event
  const defaultDestination = isEvent ? "void" : "discard"

  let s = updatePlayer(state, playerId, { hand: newHand })
  s = openResolutionContext(s, playerId, card, defaultDestination, events)

  return s
}

function handleDiscardCard(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "DISCARD_CARD" }>,
  events: GameEvent[],
): GameState {
  const { cardInstanceId } = move

  // 1. Hand
  const player = state.players[playerId]!
  const handIdx = player.hand.findIndex((c) => c.instanceId === cardInstanceId)
  if (handIdx >= 0) {
    return discardFromHand(state, playerId, move, events)
  }

  // 2. Pool (champion or attachment)
  for (const entry of player.pool) {
    if (entry.champion.instanceId === cardInstanceId) {
      return discardPoolChampion(state, playerId, entry, events)
    }
    const attIdx = entry.attachments.findIndex((a) => a.instanceId === cardInstanceId)
    if (attIdx >= 0) {
      return discardPoolAttachment(state, playerId, entry, cardInstanceId, events)
    }
  }

  // 3. Combat zone (attackerCards / defenderCards)
  if (state.combatState) {
    const combat = state.combatState
    const inAttacker = combat.attackerCards.some((c) => c.instanceId === cardInstanceId)
    const inDefender = combat.defenderCards.some((c) => c.instanceId === cardInstanceId)
    if (inAttacker || inDefender) {
      return discardCombatCard(state, cardInstanceId, inAttacker, events)
    }
  }

  // 4. Formation (razed realm)
  for (const [slot, s] of Object.entries(player.formation.slots)) {
    if (s?.realm.instanceId === cardInstanceId) {
      if (!s.isRazed) {
        throw new EngineError("NOT_RAZED", `Realm in slot ${slot} is not razed — use RAZE_OWN_REALM first`)
      }
      return discardRazedRealm(state, playerId, slot as FormationSlot, s, events)
    }
  }

  throw new EngineError("TARGET_NOT_FOUND", `Card ${cardInstanceId} not found in hand, pool, combat, or formation`)
}

function discardFromHand(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "DISCARD_CARD" }>,
  events: GameEvent[],
): GameState {
  // Auto-advance to PhaseFive when discarding from hand (only for active player, not during combat)
  if (playerId === state.activePlayer && !state.combatState) {
    if (state.phase === Phase.StartOfTurn) {
      state = advanceToPhase(state, playerId, Phase.PlayRealm, events)
    }
    if (state.phase === Phase.PlayRealm) {
      state = advanceToPhase(state, playerId, Phase.Pool, events)
    }
    if (state.phase === Phase.Pool) {
      state = advanceToPhase(state, playerId, Phase.Combat, events)
    }
    if (state.phase === Phase.Combat) {
      state = advanceToPhase(state, playerId, Phase.PhaseFive, events)
    }
  }

  const player = state.players[playerId]!
  const [card, newHand] = removeFromHand(player.hand, move.cardInstanceId)

  const isEvent = card.card.typeId === CardTypeId.Event
  events.push({
    type: isEvent ? "CARD_TO_ABYSS" : "CARDS_DISCARDED",
    playerId,
    ...(isEvent ? { instanceId: card.instanceId } : { instanceIds: [card.instanceId] }),
  } as GameEvent)

  return updatePlayer(state, playerId, {
    hand: newHand,
    discardPile: isEvent ? player.discardPile : [...player.discardPile, card],
    abyss: isEvent ? [...player.abyss, card] : player.abyss,
  })
}

function discardPoolChampion(
  state: GameState,
  playerId: PlayerId,
  entry: { champion: CardInstance; attachments: CardInstance[] },
  events: GameEvent[],
): GameState {
  const allCards = [entry.champion, ...entry.attachments]
  const player = state.players[playerId]!

  events.push({
    type: "CARDS_DISCARDED",
    playerId,
    instanceIds: allCards.map((c) => c.instanceId),
  })

  return updatePlayer(state, playerId, {
    pool: player.pool.filter((e) => e.champion.instanceId !== entry.champion.instanceId),
    discardPile: [...player.discardPile, ...allCards],
  })
}

function discardPoolAttachment(
  state: GameState,
  playerId: PlayerId,
  entry: { champion: CardInstance; attachments: CardInstance[] },
  cardInstanceId: CardInstanceId,
  events: GameEvent[],
): GameState {
  const card = entry.attachments.find((a) => a.instanceId === cardInstanceId)!
  const player = state.players[playerId]!

  events.push({ type: "CARDS_DISCARDED", playerId, instanceIds: [cardInstanceId] })

  const newPool = player.pool.map((e) =>
    e.champion.instanceId === entry.champion.instanceId
      ? { ...e, attachments: e.attachments.filter((a) => a.instanceId !== cardInstanceId) }
      : e,
  )

  return updatePlayer(state, playerId, {
    pool: newPool,
    discardPile: [...player.discardPile, card],
  })
}

function discardCombatCard(
  state: GameState,
  cardInstanceId: CardInstanceId,
  inAttacker: boolean,
  events: GameEvent[],
): GameState {
  const combat = state.combatState!
  const ownerId = inAttacker ? combat.attackingPlayer : combat.defendingPlayer
  const cards = inAttacker ? combat.attackerCards : combat.defenderCards
  const card = cards.find((c) => c.instanceId === cardInstanceId)!
  const owner = state.players[ownerId]!

  events.push({ type: "CARDS_DISCARDED", playerId: ownerId, instanceIds: [cardInstanceId] })

  const newCombat: CombatState = inAttacker
    ? { ...combat, attackerCards: combat.attackerCards.filter((c) => c.instanceId !== cardInstanceId) }
    : { ...combat, defenderCards: combat.defenderCards.filter((c) => c.instanceId !== cardInstanceId) }

  return {
    ...updatePlayer(state, ownerId, { discardPile: [...owner.discardPile, card] }),
    combatState: newCombat,
  }
}

function discardRazedRealm(
  state: GameState,
  playerId: PlayerId,
  slot: FormationSlot,
  realmSlot: { realm: CardInstance; isRazed: boolean; holdings: CardInstance[] },
  events: GameEvent[],
): GameState {
  const player = state.players[playerId]!

  events.push({ type: "CARDS_DISCARDED", playerId, instanceIds: [realmSlot.realm.instanceId] })

  const newSlots = { ...player.formation.slots }
  delete newSlots[slot]

  return updatePlayer(state, playerId, {
    discardPile: [...player.discardPile, realmSlot.realm],
    formation: { ...player.formation, slots: newSlots },
  })
}

// ─── Combat Handlers ──────────────────────────────────────────────────────────

function handleDeclareAttack(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "DECLARE_ATTACK" }>,
  events: GameEvent[],
): GameState {
  // Auto-advance to Combat from earlier phases
  if (state.phase === Phase.StartOfTurn) {
    state = advanceToPhase(state, playerId, Phase.PlayRealm, events)
  }
  if (state.phase === Phase.PlayRealm) {
    state = advanceToPhase(state, playerId, Phase.Pool, events)
  }
  if (state.phase === Phase.Pool) {
    state = advanceToPhase(state, playerId, Phase.Combat, events)
  }
  assertPhase(state, Phase.Combat)
  if (state.hasAttackedThisTurn) {
    throw new EngineError("ALREADY_ATTACKED", "Only one attack per turn")
  }

  const targetPlayer = state.players[move.targetPlayerId]
  if (!targetPlayer) throw new EngineError("INVALID_TARGET_PLAYER")

  const realmSlot = targetPlayer.formation.slots[move.targetRealmSlot]
  if (!realmSlot || realmSlot.isRazed) {
    throw new EngineError("INVALID_TARGET_REALM", "Target realm is not in play")
  }

  const [attackerChampion, s0] = findOrPromoteChampion(
    state,
    playerId,
    move.championId,
    "Attacker champion not in pool or hand",
  )
  state = s0

  if (!isAttackable(targetPlayer.formation, move.targetRealmSlot, attackerChampion)) {
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
    attacker: attackerChampion,
    defender: null,
    attackerCards: [],
    defenderCards: [],
    championsUsedThisBattle: [move.championId],
    attackerWins: 0,
    attackerManualLevel: null,
    defenderManualLevel: null,
    stoppedPlayers: [],
  }

  return {
    ...state,
    activePlayer: move.targetPlayerId, // defender must respond
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
  let defenderChampion: CardInstance
  const sourcePlayerId = move.fromPlayerId ?? playerId
  // Pool or hand promotion
  const poolEntry = s.players[sourcePlayerId]!.pool.find(
    (e) => e.champion.instanceId === move.championId,
  )
  if (poolEntry) {
    defenderChampion = poolEntry.champion
    // Cross-player: remove from source player's pool
    if (sourcePlayerId !== playerId) {
      s = updatePlayer(s, sourcePlayerId, {
        pool: s.players[sourcePlayerId]!.pool.filter(
          (e) => e.champion.instanceId !== move.championId,
        ),
      })
      s = updatePlayer(s, playerId, {
        pool: [...s.players[playerId]!.pool, { champion: defenderChampion, attachments: poolEntry.attachments }],
      })
    }
  } else if (sourcePlayerId === playerId) {
    const player = s.players[playerId]!
    const handIdx = player.hand.findIndex((c) => c.instanceId === move.championId)
    if (handIdx !== -1) {
      const [card, newHand] = removeFromHand(player.hand, move.championId)
      if (!isChampionType(card.card.typeId)) throw new EngineError("NOT_A_CHAMPION")
      s = updatePlayer(s, playerId, {
        hand: newHand,
        pool: [...player.pool, { champion: card, attachments: [] }],
      })
      defenderChampion = card
    } else {
      // Self-defending realm in formation
      const realmSlot = s.players[playerId]!.formation.slots[combat.targetRealmSlot]
      if (
        realmSlot &&
        !realmSlot.isRazed &&
        realmSlot.realm.instanceId === move.championId &&
        realmSlot.realm.card.level != null
      ) {
        defenderChampion = realmSlot.realm
      } else {
        throw new EngineError(
          "CHAMPION_NOT_FOUND",
          "Defender champion not in pool, hand, or as self-defending realm",
        )
      }
    }
  } else {
    throw new EngineError(
      "CHAMPION_NOT_FOUND",
      "Champion not found in source player's pool",
    )
  }

  events.push({ type: "DEFENSE_DECLARED", playerId, championId: defenderChampion.instanceId })

  // Add to championsUsedThisBattle (if not already there — reuse is allowed via More Actions)
  const usedList = combat.championsUsedThisBattle.includes(defenderChampion.instanceId)
    ? combat.championsUsedThisBattle
    : [...combat.championsUsedThisBattle, defenderChampion.instanceId]

  const newCombat: CombatState = {
    ...combat,
    roundPhase: "CARD_PLAY",
    defender: defenderChampion,
    championsUsedThisBattle: usedList,
  }

  // Set active player to the one currently losing
  const realmSlot = s.players[combat.defendingPlayer]!.formation.slots[combat.targetRealmSlot]
  const realmWorldId = realmSlot?.realm.card.worldId ?? 0
  const attackerLevel = calculateCombatLevel(
    combat.attacker!,
    combat.attackerCards,
    hasWorldMatch(combat.attacker!, realmWorldId),
    "offensive",
    getPoolAttachments(s, combat.attackingPlayer, combat.attacker!.instanceId),
  )
  const defenderIsRealm = realmSlot?.realm.instanceId === defenderChampion.instanceId
  const defenderLevel = calculateCombatLevel(
    defenderChampion,
    [],
    !defenderIsRealm && hasWorldMatch(defenderChampion, realmWorldId),
    "defensive",
    getPoolAttachments(s, combat.defendingPlayer, defenderChampion.instanceId),
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
  const isParticipant = isAttacker || playerId === combat.defendingPlayer
  if (!isParticipant) {
    throw new EngineError(
      "NOT_COMBAT_PARTICIPANT",
      "Only combat participants can play combat cards",
    )
  }

  const player = state.players[playerId]!
  const [card, newHand] = removeFromHand(player.hand, move.cardInstanceId)
  const activeChampion = isAttacker ? combat.attacker : combat.defender

  const activePoolEntry = activeChampion
    ? player.pool.find((e) => e.champion.instanceId === activeChampion.instanceId)
    : null
  let spellContext: SpellCastContext = {
    attachments: activePoolEntry?.attachments.map((a) => a.card) ?? [],
  }
  if (!isAttacker && activeChampion) {
    const targetSlot =
      state.players[combat.defendingPlayer]!.formation.slots[combat.targetRealmSlot]
    if (targetSlot) {
      spellContext = {
        ...spellContext,
        defendingRealm: targetSlot.realm.card,
        holdingsOnRealm: targetSlot.holdings.map((h) => h.card),
      }
    }
  }
  const myCombatCards = isAttacker ? combat.attackerCards : combat.defenderCards
  if (!canPlayInCombat(card, activeChampion, spellContext, myCombatCards)) {
    throw new EngineError("INVALID_COMBAT_CARD", "Card cannot be played in combat")
  }

  events.push({ type: "COMBAT_CARD_PLAYED", playerId, instanceId: card.instanceId })

  // Add card to the appropriate side's combat cards
  const newCombat: CombatState = isAttacker
    ? { ...combat, attackerCards: [...combat.attackerCards, card] }
    : { ...combat, defenderCards: [...combat.defenderCards, card] }

  const s = updatePlayer({ ...state, combatState: newCombat }, playerId, { hand: newHand })

  const { attackerLevel, defenderLevel } = getCombatLevels(s, newCombat)
  const losingPlayer = getLosingPlayer(attackerLevel, defenderLevel, newCombat)

  return { ...s, activePlayer: losingPlayer }
}

function handleStopPlaying(state: GameState, playerId: PlayerId, events: GameEvent[]): GameState {
  assertCombatPhase(state, "CARD_PLAY")
  const combat = state.combatState!

  const isAttacker = playerId === combat.attackingPlayer
  const isDefender = playerId === combat.defendingPlayer
  if (!isAttacker && !isDefender) {
    throw new EngineError("NOT_COMBAT_PARTICIPANT", "Only combat participants can stop playing")
  }

  // Conceding player loses immediately
  if (isAttacker) {
    return handleDefenderWins(state, combat, events)
  } else {
    return handleAttackerWins(state, combat, playerId, events)
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

  const sourcePlayerId = move.fromPlayerId ?? playerId
  let continueChampion: CardInstance
  let s: GameState
  if (sourcePlayerId !== playerId) {
    // Cross-player: take from their pool
    const sourcePool = state.players[sourcePlayerId]
    if (!sourcePool) throw new EngineError("PLAYER_NOT_FOUND")
    const entry = sourcePool.pool.find((e) => e.champion.instanceId === move.championId)
    if (!entry) {
      throw new EngineError("CHAMPION_NOT_FOUND", "Champion not in source player's pool")
    }
    continueChampion = entry.champion
    s = updatePlayer(state, sourcePlayerId, {
      pool: sourcePool.pool.filter((e) => e.champion.instanceId !== move.championId),
    })
    s = updatePlayer(s, playerId, {
      pool: [...s.players[playerId]!.pool, { champion: continueChampion, attachments: entry.attachments }],
    })
  } else {
    ;[continueChampion, s] = findOrPromoteChampion(
      state,
      playerId,
      move.championId,
      "Attacker champion not in pool or hand",
    )
  }
  // Add to championsUsedThisBattle (if not already there — reuse is allowed via More Actions)
  const usedList = combat.championsUsedThisBattle.includes(move.championId)
    ? combat.championsUsedThisBattle
    : [...combat.championsUsedThisBattle, move.championId]

  const newCombat: CombatState = {
    ...combat,
    roundPhase: "AWAITING_DEFENDER",
    attacker: continueChampion,
    defender: null,
    attackerCards: [],
    defenderCards: [],
    championsUsedThisBattle: usedList,
    attackerManualLevel: null,
    defenderManualLevel: null,
    stoppedPlayers: [],
  }

  return {
    ...s,
    activePlayer: combat.defendingPlayer,
    combatState: newCombat,
  }
}

function handleEndAttack(state: GameState, playerId: PlayerId, _events: GameEvent[]): GameState {
  assertCombatPhase(state, "AWAITING_ATTACKER")
  const combat = state.combatState!
  if (playerId !== combat.attackingPlayer) {
    throw new EngineError("NOT_ATTACKER")
  }
  return endBattle(state, combat.attackingPlayer, _events)
}

function handleInterruptCombat(
  state: GameState,
  playerId: PlayerId,
  events: GameEvent[],
): GameState {
  const combat = state.combatState
  if (!combat) {
    throw new EngineError("NOT_IN_COMBAT", "INTERRUPT_COMBAT requires active combat")
  }
  const isParticipant = playerId === combat.attackingPlayer || playerId === combat.defendingPlayer
  if (!isParticipant) {
    throw new EngineError("INVALID_PLAYER", "Player is not a combat participant")
  }

  events.push({ type: "COMBAT_INTERRUPTED", playerId })

  // Both champions survive: items/artifacts from combat round re-attach; allies/spells discard
  let s = state
  const { toAttach: aItemsToKeep, toDiscard: aDiscards } = splitCombatCards(combat.attackerCards)
  const { toAttach: dItemsToKeep, toDiscard: dDiscards } = splitCombatCards(combat.defenderCards)

  if (combat.attacker) {
    s = attachToPoolChampion(s, combat.attackingPlayer, combat.attacker.instanceId, aItemsToKeep)
  }
  if (aDiscards.length > 0) {
    const ap = s.players[combat.attackingPlayer]!
    s = updatePlayer(s, combat.attackingPlayer, { discardPile: [...ap.discardPile, ...aDiscards] })
  }

  if (combat.defender) {
    s = attachToPoolChampion(s, combat.defendingPlayer, combat.defender.instanceId, dItemsToKeep)
  }
  if (dDiscards.length > 0) {
    const dp = s.players[combat.defendingPlayer]!
    s = updatePlayer(s, combat.defendingPlayer, { discardPile: [...dp.discardPile, ...dDiscards] })
  }

  return endBattle(s, combat.attackingPlayer, events)
}

function handleSetCombatLevel(
  state: GameState,
  _playerId: PlayerId,
  move: Extract<Move, { type: "SET_COMBAT_LEVEL" }>,
  events: GameEvent[],
): GameState {
  if (!state.combatState) {
    throw new EngineError("NOT_IN_COMBAT", "SET_COMBAT_LEVEL requires active combat")
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

  const { attackerLevel, defenderLevel } = getCombatLevels(state, newCombat)
  const losingPlayer = getLosingPlayer(attackerLevel, defenderLevel, newCombat)

  return { ...state, combatState: newCombat, activePlayer: losingPlayer }
}

function handleSwitchCombatSide(
  state: GameState,
  _playerId: PlayerId,
  move: Extract<Move, { type: "SWITCH_COMBAT_SIDE" }>,
  events: GameEvent[],
): GameState {
  if (!state.combatState) {
    throw new EngineError("NOT_IN_COMBAT", "SWITCH_COMBAT_SIDE requires active combat")
  }
  const combat = state.combatState
  const { cardInstanceId } = move

  const inAttacker = combat.attackerCards.some((c) => c.instanceId === cardInstanceId)
  const inDefender = combat.defenderCards.some((c) => c.instanceId === cardInstanceId)

  // Also check pool attachments on active champions
  const attackerAttachments = combat.attacker
    ? getPoolAttachments(state, combat.attackingPlayer, combat.attacker.instanceId)
    : []
  const defenderAttachments = combat.defender
    ? getPoolAttachments(state, combat.defendingPlayer, combat.defender.instanceId)
    : []
  const inAttackerPool = attackerAttachments.some((c) => c.instanceId === cardInstanceId)
  const inDefenderPool = defenderAttachments.some((c) => c.instanceId === cardInstanceId)

  if (!inAttacker && !inDefender && !inAttackerPool && !inDefenderPool) {
    throw new EngineError("TARGET_NOT_FOUND", "Card is not in active combat")
  }

  const card = (
    inAttacker
      ? combat.attackerCards
      : inDefender
        ? combat.defenderCards
        : inAttackerPool
          ? attackerAttachments
          : defenderAttachments
  ).find((c) => c.instanceId === cardInstanceId)!

  const from = inAttacker || inAttackerPool ? "attacker_combat" : "defender_combat"
  const to = inAttacker || inAttackerPool ? "defender_combat" : "attacker_combat"

  events.push({
    type: "COMBAT_CARD_SWITCHED",
    playerId: inAttacker || inAttackerPool ? combat.attackingPlayer : combat.defendingPlayer,
    instanceId: cardInstanceId,
    from,
    to,
  })

  // For pool attachments: remove from the champion's pool attachments and add to the opposing combat cards
  if (inAttackerPool) {
    const attackerId = combat.attackingPlayer
    const attackerPlayer = state.players[attackerId]!
    const newPool = attackerPlayer.pool.map((entry) =>
      entry.champion.instanceId === combat.attacker!.instanceId
        ? {
            ...entry,
            attachments: entry.attachments.filter((a) => a.instanceId !== cardInstanceId),
          }
        : entry,
    )
    return {
      ...updatePlayer(state, attackerId, { pool: newPool }),
      combatState: { ...combat, defenderCards: [...combat.defenderCards, card] },
    }
  }

  if (inDefenderPool) {
    const defenderId = combat.defendingPlayer
    const defenderPlayer = state.players[defenderId]!
    const newPool = defenderPlayer.pool.map((entry) =>
      entry.champion.instanceId === combat.defender!.instanceId
        ? {
            ...entry,
            attachments: entry.attachments.filter((a) => a.instanceId !== cardInstanceId),
          }
        : entry,
    )
    return {
      ...updatePlayer(state, defenderId, { pool: newPool }),
      combatState: { ...combat, attackerCards: [...combat.attackerCards, card] },
    }
  }

  const newCombat: CombatState = inAttacker
    ? {
        ...combat,
        attackerCards: combat.attackerCards.filter((c) => c.instanceId !== cardInstanceId),
        defenderCards: [...combat.defenderCards, card],
      }
    : {
        ...combat,
        defenderCards: combat.defenderCards.filter((c) => c.instanceId !== cardInstanceId),
        attackerCards: [...combat.attackerCards, card],
      }

  return { ...state, combatState: newCombat }
}

function handleReturnCombatCardToPool(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "RETURN_COMBAT_CARD_TO_POOL" }>,
  events: GameEvent[],
): GameState {
  if (!state.combatState) {
    throw new EngineError("NOT_IN_COMBAT", "RETURN_COMBAT_CARD_TO_POOL requires active combat")
  }
  const combat = state.combatState
  const { cardInstanceId } = move
  const isParticipant = playerId === combat.attackingPlayer || playerId === combat.defendingPlayer
  if (!isParticipant) {
    throw new EngineError("INVALID_PLAYER", "Player is not a combat participant")
  }

  const isAttackerChampion = combat.attacker?.instanceId === cardInstanceId
  const isDefenderChampion = combat.defender?.instanceId === cardInstanceId
  if (!isAttackerChampion && !isDefenderChampion) {
    throw new EngineError("TARGET_NOT_FOUND", "Card is not a main combat champion")
  }

  const ownerId = isAttackerChampion ? combat.attackingPlayer : combat.defendingPlayer
  const champion = isAttackerChampion ? combat.attacker! : combat.defender!

  events.push({
    type: "COMBAT_CHAMPION_RETURNED_TO_POOL",
    playerId: ownerId,
    instanceId: cardInstanceId,
    cardName: champion.card.name,
  })

  // Split combat cards: items/artifacts go with champion, rest stays in combat
  const combatCards = isAttackerChampion ? combat.attackerCards : combat.defenderCards
  const { toAttach, toDiscard: remaining } = splitCombatCards(combatCards)

  let s = state
  if (toAttach.length > 0) {
    s = attachToPoolChampion(s, ownerId, cardInstanceId, toAttach)
  }

  const newCombat: CombatState = {
    ...combat,
    ...(isAttackerChampion
      ? { attacker: null, attackerManualLevel: null, attackerCards: remaining }
      : { defender: null, defenderManualLevel: null, defenderCards: remaining }),
  }

  return { ...s, combatState: newCombat }
}

function handleReturnCombatCardToHand(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "RETURN_COMBAT_CARD_TO_HAND" }>,
  events: GameEvent[],
): GameState {
  if (!state.combatState) {
    throw new EngineError("NOT_IN_COMBAT", "RETURN_COMBAT_CARD_TO_HAND requires active combat")
  }
  const combat = state.combatState
  const { cardInstanceId } = move
  const isParticipant = playerId === combat.attackingPlayer || playerId === combat.defendingPlayer
  if (!isParticipant) {
    throw new EngineError("INVALID_PLAYER", "Player is not a combat participant")
  }

  const inAttacker = combat.attackerCards.find((c) => c.instanceId === cardInstanceId)
  const inDefender = combat.defenderCards.find((c) => c.instanceId === cardInstanceId)
  if (!inAttacker && !inDefender) {
    throw new EngineError("TARGET_NOT_FOUND", "Card not found in combat cards")
  }

  const card = (inAttacker ?? inDefender)!
  const ownerId = inAttacker ? combat.attackingPlayer : combat.defendingPlayer
  const owner = state.players[ownerId]!

  events.push({
    type: "COMBAT_CARD_RETURNED_TO_HAND",
    playerId: ownerId,
    instanceId: cardInstanceId,
    cardName: card.card.name,
  })

  const newCombat: CombatState = inAttacker
    ? { ...combat, attackerCards: combat.attackerCards.filter((c) => c.instanceId !== cardInstanceId) }
    : { ...combat, defenderCards: combat.defenderCards.filter((c) => c.instanceId !== cardInstanceId) }

  return {
    ...updatePlayer(state, ownerId, { hand: [...owner.hand, card] }),
    combatState: newCombat,
  }
}

function handleReturnFromDiscard(
  state: GameState,
  _playerId: PlayerId,
  move: Extract<Move, { type: "RETURN_FROM_DISCARD" }>,
  events: GameEvent[],
): GameState {
  const player = state.players[move.playerId]
  if (!player) throw new EngineError("PLAYER_NOT_FOUND")

  const card = player.discardPile.find((c) => c.instanceId === move.cardInstanceId)
  if (!card) throw new EngineError("CARD_NOT_FOUND", "Card not in discard pile")

  if (move.destination === "pool" && !isChampionType(card.card.typeId)) {
    throw new EngineError("NOT_A_CHAMPION", "Only champions can return to pool")
  }

  events.push({
    type: "RETURNED_FROM_DISCARD",
    playerId: move.playerId,
    instanceId: move.cardInstanceId,
    destination: move.destination,
  })

  const newDiscard = player.discardPile.filter((c) => c.instanceId !== move.cardInstanceId)

  if (move.destination === "hand") {
    return updatePlayer(state, move.playerId, {
      discardPile: newDiscard,
      hand: [...player.hand, card],
    })
  } else if (move.destination === "pool") {
    return updatePlayer(state, move.playerId, {
      discardPile: newDiscard,
      pool: [...player.pool, { champion: card, attachments: [] }],
    })
  } else {
    // deck — insert at random position
    const deck = [...player.drawPile]
    const pos = Math.floor(Math.random() * (deck.length + 1))
    deck.splice(pos, 0, card)
    return updatePlayer(state, move.playerId, { discardPile: newDiscard, drawPile: deck })
  }
}

// ─── Combat Champion Manipulation Handlers ──────────────────────────────────

function handleSwapCombatChampion(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "SWAP_COMBAT_CHAMPION" }>,
  events: GameEvent[],
): GameState {
  if (!state.combatState) {
    throw new EngineError("NOT_IN_COMBAT", "SWAP_COMBAT_CHAMPION requires active combat")
  }
  const combat = state.combatState
  const isParticipant = playerId === combat.attackingPlayer || playerId === combat.defendingPlayer
  if (!isParticipant) {
    throw new EngineError("INVALID_PLAYER", "Player is not a combat participant")
  }

  const isAttackerSide = move.side === "attacker"
  const oldChampion = isAttackerSide ? combat.attacker : combat.defender
  const ownerId = isAttackerSide ? combat.attackingPlayer : combat.defendingPlayer

  // Remove old champion: split combat cards (items go with champion, rest stays)
  let s = state
  const combatCards = isAttackerSide ? combat.attackerCards : combat.defenderCards
  const { toAttach, toDiscard: remaining } = splitCombatCards(combatCards)

  if (oldChampion) {
    // Send old champion + items to destination
    const oldCards = [oldChampion, ...toAttach]
    const owner = s.players[ownerId]!
    switch (move.oldChampionDestination) {
      case "pool": {
        // Re-attach to pool entry
        const existingEntry = owner.pool.find(
          (e) => e.champion.instanceId === oldChampion.instanceId,
        )
        if (existingEntry) {
          s = attachToPoolChampion(s, ownerId, oldChampion.instanceId, toAttach)
        } else {
          s = updatePlayer(s, ownerId, {
            pool: [...owner.pool, { champion: oldChampion, attachments: toAttach }],
          })
        }
        break
      }
      case "discard":
        s = updatePlayer(s, ownerId, {
          discardPile: [...owner.discardPile, ...oldCards],
          pool: owner.pool.filter((e) => e.champion.instanceId !== oldChampion.instanceId),
        })
        break
      case "abyss":
        s = updatePlayer(s, ownerId, {
          abyss: [...owner.abyss, ...oldCards],
          pool: owner.pool.filter((e) => e.champion.instanceId !== oldChampion.instanceId),
        })
        break
      case "hand":
        s = updatePlayer(s, ownerId, {
          hand: [...owner.hand, ...oldCards],
          pool: owner.pool.filter((e) => e.champion.instanceId !== oldChampion.instanceId),
        })
        break
    }
  }

  // Find and place new champion
  let newChampion: CardInstance
  switch (move.newChampionSource) {
    case "pool": {
      // Scan all players for the champion in pool
      let found = false
      for (const [pid, p] of Object.entries(s.players)) {
        const entry = p.pool.find((e) => e.champion.instanceId === move.newChampionId)
        if (entry) {
          newChampion = entry.champion
          // Bring pool attachments into combat player's pool
          if (pid !== ownerId) {
            s = updatePlayer(s, pid, {
              pool: p.pool.filter((e) => e.champion.instanceId !== move.newChampionId),
            })
            s = updatePlayer(s, ownerId, {
              pool: [...s.players[ownerId]!.pool, { champion: newChampion, attachments: entry.attachments }],
            })
          }
          found = true
          break
        }
      }
      if (!found!) throw new EngineError("CHAMPION_NOT_FOUND", "New champion not found in any pool")
      break
    }
    case "hand": {
      // Find in any player's hand, promote to pool
      let found = false
      for (const [pid, p] of Object.entries(s.players)) {
        const idx = p.hand.findIndex((c) => c.instanceId === move.newChampionId)
        if (idx !== -1) {
          const card = p.hand[idx]!
          if (!isChampionType(card.card.typeId)) throw new EngineError("NOT_A_CHAMPION")
          newChampion = card
          const newHand = p.hand.filter((c) => c.instanceId !== move.newChampionId)
          s = updatePlayer(s, pid, { hand: newHand })
          // Add to owning side's pool
          s = updatePlayer(s, ownerId, {
            pool: [...s.players[ownerId]!.pool, { champion: newChampion, attachments: [] }],
          })
          found = true
          break
        }
      }
      if (!found!) throw new EngineError("CHAMPION_NOT_FOUND", "New champion not found in any hand")
      break
    }
    case "discard": {
      let found = false
      for (const [pid, p] of Object.entries(s.players)) {
        const card = p.discardPile.find((c) => c.instanceId === move.newChampionId)
        if (card) {
          if (!isChampionType(card.card.typeId)) throw new EngineError("NOT_A_CHAMPION")
          newChampion = card
          s = updatePlayer(s, pid, {
            discardPile: p.discardPile.filter((c) => c.instanceId !== move.newChampionId),
          })
          s = updatePlayer(s, ownerId, {
            pool: [...s.players[ownerId]!.pool, { champion: newChampion, attachments: [] }],
          })
          found = true
          break
        }
      }
      if (!found!) throw new EngineError("CHAMPION_NOT_FOUND", "New champion not found in any discard")
      break
    }
  }

  events.push({
    type: "COMBAT_CHAMPION_SWAPPED",
    playerId: ownerId,
    side: move.side,
    oldChampionId: oldChampion?.instanceId ?? null,
    oldChampionName: oldChampion?.card.name ?? null,
    newChampionId: newChampion!.instanceId,
    newChampionName: newChampion!.card.name,
    source: move.newChampionSource,
  })

  const newCombat: CombatState = {
    ...combat,
    ...(isAttackerSide
      ? {
          attacker: newChampion!,
          attackerCards: remaining,
          attackerManualLevel: null,
        }
      : {
          defender: newChampion!,
          defenderCards: remaining,
          defenderManualLevel: null,
        }),
    championsUsedThisBattle: [...combat.championsUsedThisBattle, move.newChampionId],
  }

  return { ...s, combatState: newCombat }
}

function handleRequireNewChampion(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "REQUIRE_NEW_CHAMPION" }>,
  events: GameEvent[],
): GameState {
  if (!state.combatState) {
    throw new EngineError("NOT_IN_COMBAT", "REQUIRE_NEW_CHAMPION requires active combat")
  }
  const combat = state.combatState
  const isParticipant = playerId === combat.attackingPlayer || playerId === combat.defendingPlayer
  if (!isParticipant) {
    throw new EngineError("INVALID_PLAYER", "Player is not a combat participant")
  }

  const isAttackerSide = move.side === "attacker"
  const champion = isAttackerSide ? combat.attacker : combat.defender
  if (champion !== null) {
    throw new EngineError(
      "CHAMPION_PRESENT",
      "Cannot require new champion when one is already present — remove the champion first",
    )
  }

  const targetPlayer = isAttackerSide ? combat.attackingPlayer : combat.defendingPlayer

  events.push({
    type: "COMBAT_CHAMPION_REQUIRED",
    playerId: targetPlayer,
    side: move.side,
  })

  const newCombat: CombatState = {
    ...combat,
    roundPhase: isAttackerSide ? "AWAITING_ATTACKER" : "AWAITING_DEFENDER",
    stoppedPlayers: [],
  }

  return { ...state, activePlayer: targetPlayer, combatState: newCombat }
}

function handleAllowChampionReuse(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "ALLOW_CHAMPION_REUSE" }>,
  events: GameEvent[],
): GameState {
  if (!state.combatState) {
    throw new EngineError("NOT_IN_COMBAT", "ALLOW_CHAMPION_REUSE requires active combat")
  }
  const combat = state.combatState
  const isParticipant = playerId === combat.attackingPlayer || playerId === combat.defendingPlayer
  if (!isParticipant) {
    throw new EngineError("INVALID_PLAYER", "Player is not a combat participant")
  }

  if (!combat.championsUsedThisBattle.includes(move.cardInstanceId)) {
    throw new EngineError(
      "CHAMPION_NOT_USED",
      "Champion is not in championsUsedThisBattle",
    )
  }

  // Find champion name for the event
  let cardName = "Unknown"
  for (const p of Object.values(state.players)) {
    const entry = p.pool.find((e) => e.champion.instanceId === move.cardInstanceId)
    if (entry) {
      cardName = entry.champion.card.name
      break
    }
    const disc = p.discardPile.find((c) => c.instanceId === move.cardInstanceId)
    if (disc) {
      cardName = disc.card.name
      break
    }
  }

  events.push({
    type: "CHAMPION_REUSE_ALLOWED",
    playerId,
    instanceId: move.cardInstanceId,
    cardName,
  })

  const newCombat: CombatState = {
    ...combat,
    championsUsedThisBattle: combat.championsUsedThisBattle.filter(
      (id) => id !== move.cardInstanceId,
    ),
  }

  return { ...state, combatState: newCombat }
}

// ─── Combat Resolution Helpers ────────────────────────────────────────────────

/**
 * Splits cards played during a combat round:
 *   - MagicalItems and Artifacts → re-attach to the surviving champion's pool entry
 *   - Everything else (allies, spells) → discard
 */
function splitCombatCards(cards: CardInstance[]): {
  toAttach: CardInstance[]
  toDiscard: CardInstance[]
} {
  const toAttach: CardInstance[] = []
  const toDiscard: CardInstance[] = []
  for (const card of cards) {
    if (card.card.typeId === CardTypeId.MagicalItem || card.card.typeId === CardTypeId.Artifact) {
      toAttach.push(card)
    } else {
      toDiscard.push(card)
    }
  }
  return { toAttach, toDiscard }
}

/** Adds cards to a champion's pool entry attachments. */
function attachToPoolChampion(
  state: GameState,
  playerId: PlayerId,
  championInstanceId: string,
  cards: CardInstance[],
): GameState {
  if (cards.length === 0) return state
  const player = state.players[playerId]!
  const newPool = player.pool.map((entry) =>
    entry.champion.instanceId === championInstanceId
      ? { ...entry, attachments: [...entry.attachments, ...cards] }
      : entry,
  )
  return updatePlayer(state, playerId, { pool: newPool })
}

function handleAttackerWins(
  state: GameState,
  combat: CombatState,
  _playerId: PlayerId,
  events: GameEvent[],
): GameState {
  const defendingPlayer = state.players[combat.defendingPlayer]!

  // Check if the defender is the self-defending realm (not a pool champion)
  const targetRealmSlot = defendingPlayer.formation.slots[combat.targetRealmSlot]
  const isRealmDefender =
    combat.defender !== null &&
    !defendingPlayer.pool.some((e) => e.champion.instanceId === combat.defender!.instanceId) &&
    targetRealmSlot?.realm.instanceId === combat.defender!.instanceId

  // Attacker survives: items/artifacts from combat round re-attach to pool; allies/spells discard
  const { toAttach: attackerItemsToKeep, toDiscard: attackerDiscards } = splitCombatCards(
    combat.attackerCards,
  )
  if (attackerDiscards.length > 0) {
    events.push({
      type: "CARDS_DISCARDED",
      playerId: combat.attackingPlayer,
      instanceIds: attackerDiscards.map((c) => c.instanceId),
    })
  }

  let s = state
  if (combat.attacker) {
    s = attachToPoolChampion(s, combat.attackingPlayer, combat.attacker.instanceId, attackerItemsToKeep)
  }
  const attackingPlayer = s.players[combat.attackingPlayer]!
  s = updatePlayer(s, combat.attackingPlayer, {
    discardPile: [...attackingPlayer.discardPile, ...attackerDiscards],
  })

  if (isRealmDefender) {
    const defenderCardDiscards = combat.defenderCards
    if (defenderCardDiscards.length > 0) {
      events.push({
        type: "CARDS_DISCARDED",
        playerId: combat.defendingPlayer,
        instanceIds: defenderCardDiscards.map((c) => c.instanceId),
      })
      const dp = s.players[combat.defendingPlayer]!
      s = updatePlayer(s, combat.defendingPlayer, {
        discardPile: [...dp.discardPile, ...defenderCardDiscards],
      })
    }
    const newCombat: CombatState = {
      ...combat,
      roundPhase: "AWAITING_ATTACKER",
      attacker: null,
      defender: null,
      attackerCards: [],
      defenderCards: [],
      attackerWins: combat.attackerWins + 1,
    }
    return { ...s, activePlayer: combat.attackingPlayer, combatState: newCombat }
  }

  // Discard defender champion + pool entry attachments + all combat cards
  // (skip if champion was already returned to pool via RETURN_COMBAT_CARD_TO_POOL)
  const defenderEntry = combat.defender
    ? defendingPlayer.pool.find((e) => e.champion.instanceId === combat.defender!.instanceId)
    : null
  const allDefenderDiscards: CardInstanceId[] = []

  if (defenderEntry) {
    allDefenderDiscards.push(
      defenderEntry.champion.instanceId,
      ...defenderEntry.attachments.map((a) => a.instanceId),
    )
    events.push({
      type: "CHAMPION_DISCARDED",
      playerId: combat.defendingPlayer,
      instanceId: defenderEntry.champion.instanceId,
    })
  }
  allDefenderDiscards.push(...combat.defenderCards.map((c) => c.instanceId))

  const defenderDiscardCards = [
    ...(defenderEntry ? [defenderEntry.champion, ...defenderEntry.attachments] : []),
    ...combat.defenderCards,
  ]
  const newDefenderPool = combat.defender
    ? s.players[combat.defendingPlayer]!.pool.filter(
        (e) => e.champion.instanceId !== combat.defender!.instanceId,
      )
    : s.players[combat.defendingPlayer]!.pool
  const dp2 = s.players[combat.defendingPlayer]!
  s = updatePlayer(s, combat.defendingPlayer, {
    pool: newDefenderPool,
    discardPile: [...dp2.discardPile, ...defenderDiscardCards],
  })

  const newAttackerWins = combat.attackerWins + 1

  // Second win — realm is razed
  if (newAttackerWins >= 2) {
    s = razeRealm(s, combat.defendingPlayer, combat.targetRealmSlot, events)
    s = earnSpoils(s, combat.attackingPlayer, events)
    return endBattle(s, combat.attackingPlayer, events)
  }

  // First win — attacker may continue with a different champion
  const usedChampions = [...combat.championsUsedThisBattle]
  if (combat.defender) usedChampions.push(combat.defender.instanceId)

  const newCombat: CombatState = {
    ...combat,
    roundPhase: "AWAITING_ATTACKER",
    attacker: null,
    defender: null,
    attackerCards: [],
    defenderCards: [],
    championsUsedThisBattle: usedChampions,
    attackerWins: newAttackerWins,
  }

  return {
    ...s,
    activePlayer: combat.attackingPlayer,
    combatState: newCombat,
  }
}

function handleDefenderWins(state: GameState, combat: CombatState, events: GameEvent[]): GameState {
  const attackingPlayer = state.players[combat.attackingPlayer]!

  // Discard attacker champion + pool entry attachments + all combat cards
  // (skip if champion was already returned to pool via RETURN_COMBAT_CARD_TO_POOL)
  const attackerEntry = combat.attacker
    ? attackingPlayer.pool.find((e) => e.champion.instanceId === combat.attacker!.instanceId)
    : null

  if (attackerEntry) {
    events.push({
      type: "CHAMPION_DISCARDED",
      playerId: combat.attackingPlayer,
      instanceId: attackerEntry.champion.instanceId,
    })
  }

  const attackerDiscardCards = [
    ...(attackerEntry ? [attackerEntry.champion, ...attackerEntry.attachments] : []),
    ...combat.attackerCards,
  ]
  const newAttackerPool = combat.attacker
    ? attackingPlayer.pool.filter((e) => e.champion.instanceId !== combat.attacker!.instanceId)
    : attackingPlayer.pool

  // Defender survives: items/artifacts from combat round re-attach to pool; allies/spells discard
  const { toAttach: defenderItemsToKeep, toDiscard: defenderDiscards } = splitCombatCards(
    combat.defenderCards,
  )

  let s = updatePlayer(state, combat.attackingPlayer, {
    pool: newAttackerPool,
    discardPile: [...attackingPlayer.discardPile, ...attackerDiscardCards],
  })

  if (combat.defender) {
    s = attachToPoolChampion(s, combat.defendingPlayer, combat.defender.instanceId, defenderItemsToKeep)
  }
  const defendingPlayer = s.players[combat.defendingPlayer]!
  s = updatePlayer(s, combat.defendingPlayer, {
    discardPile: [...defendingPlayer.discardPile, ...defenderDiscards],
  })

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

  events.push({
    type: "REALM_RAZED",
    playerId: ownerId,
    slot,
    realmName: realmSlot.realm.card.name,
  })

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
  // Set pendingSpoil — player may optionally claim 1 card via CLAIM_SPOIL
  return { ...state, pendingSpoil: playerId }
}

function handleClaimSpoil(state: GameState, playerId: PlayerId, events: GameEvent[]): GameState {
  if (state.pendingSpoil !== playerId) {
    throw new EngineError("NO_PENDING_SPOIL", "No spoil available for this player")
  }
  const player = state.players[playerId]!
  const [drawn, remaining] = takeCards(player.drawPile, 1)
  if (drawn.length > 0) {
    events.push({ type: "CARDS_DRAWN", playerId, count: drawn.length })
  }
  return {
    ...updatePlayer(state, playerId, {
      hand: [...player.hand, ...drawn],
      drawPile: remaining,
    }),
    pendingSpoil: null,
  }
}

function endBattle(state: GameState, nextActivePlayer: PlayerId, _events: GameEvent[]): GameState {
  return {
    ...state,
    activePlayer: nextActivePlayer,
    phase: Phase.Combat,
    combatState: null,
  }
}

function processLimboReturns(state: GameState, playerId: PlayerId, events: GameEvent[]): GameState {
  const player = state.players[playerId]!
  const returning = player.limbo.filter((e) => e.returnsOnTurn <= state.currentTurn)
  const remaining = player.limbo.filter((e) => e.returnsOnTurn > state.currentTurn)

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
      (p) =>
        p.champion.card.name === entry.champion.card.name &&
        p.champion.card.typeId === entry.champion.card.typeId,
    )
    if (alreadyInPlay) {
      toDiscard.push(entry)
    } else {
      toReturn.push({ champion: entry.champion, attachments: entry.attachments })
    }
  }

  const discardedCards = toDiscard.flatMap((e) => [e.champion, ...e.attachments])
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
    const hasAnyRealm = Object.values(player.formation.slots).some((slot) => slot !== undefined)
    if (!hasAnyRealm) continue

    const hasUnrazed = Object.values(player.formation.slots).some((slot) => slot && !slot.isRazed)
    if (hasUnrazed) continue

    // All realms are razed — discard all pool champions
    if (player.pool.length === 0) continue

    const discarded = player.pool.flatMap((e) => [e.champion, ...e.attachments])
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

  const unrazedCount = Object.values(player.formation.slots).filter(
    (slot) => slot && !slot.isRazed,
  ).length

  if (unrazedCount >= player.formation.size) {
    events.push({ type: "GAME_OVER", winner: playerId })
    return { ...state, winner: playerId }
  }

  return state
}

// ─── Phase Advancement Helper ─────────────────────────────────────────────────

/** Phase order for auto-advancement */
const PHASE_ORDER = [
  Phase.StartOfTurn,
  Phase.PlayRealm,
  Phase.Pool,
  Phase.Combat,
  Phase.PhaseFive,
] as const

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
  const startIdx = PHASE_ORDER.indexOf(s.phase as (typeof PHASE_ORDER)[number])
  const endIdx = PHASE_ORDER.indexOf(targetPhase as (typeof PHASE_ORDER)[number])

  if (startIdx < 0 || endIdx < 0 || startIdx >= endIdx) return s

  // Walk through each intermediate phase via handlePass
  for (let i = startIdx; i < endIdx; i++) {
    s = handlePass(s, playerId, events)
  }
  return s
}

function handleEndTurn(state: GameState, playerId: PlayerId, events: GameEvent[]): GameState {
  assertNotInCombat(state)

  const player = state.players[playerId]!
  const { maxEnd } = HAND_SIZES[state.deckSize]!
  if (player.hand.length > maxEnd) {
    throw new EngineError("HAND_TOO_LARGE", `Discard down to ${maxEnd} cards before ending turn`)
  }

  // Advance to PhaseFive first (running side-effects for skipped phases).
  // If called from START_OF_TURN, skip drawing entirely and jump straight to PlayRealm.
  let s = state
  if (s.phase === Phase.StartOfTurn) {
    s = { ...s, phase: Phase.PlayRealm }
  }
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
    throw new EngineError(
      "WRONG_COMBAT_PHASE",
      `Expected ${phase}, got ${state.combatState.roundPhase}`,
    )
  }
}
