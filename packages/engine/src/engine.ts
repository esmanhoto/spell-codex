import type {
  GameState,
  GameEvent,
  Move,
  EngineResult,
  PlayerId,
  CardInstanceId,
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
} from "./utils.ts"
import {
  calculateCombatLevel,
  hasWorldMatch,
  resolveCombatRound,
  getLosingPlayer,
} from "./combat.ts"
import {
  getLegalMoves,
  getLegalRealmSlots,
  isAttackable,
  isUniqueInPlay,
  canPlayInCombat,
} from "./legal-moves.ts"
import { canChampionUseSpell, getCastPhases } from "./spell-gating.ts"
import {
  handleResolveMoveCard,
  handleResolveAttachCard,
  handleResolveRazeRealm,
  handleResolveDrawCards,
  handleResolveReturnToPool,
  handleResolveSetCardDestination,
  handleResolveDone,
  openResolutionContext,
} from "./resolution.ts"
export { EngineError } from "./errors.ts"
import { EngineError } from "./errors.ts"

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
    case "SET_COMBAT_LEVEL":
      newState = handleSetCombatLevel(state, playerId, move, events)
      break
    case "SWITCH_COMBAT_SIDE":
      newState = handleSwitchCombatSide(state, playerId, move, events)
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

  const combat = state.combatState
  if (!combat) return false

  const isDefender = playerId === combat.defendingPlayer

  if (combat.roundPhase === "AWAITING_DEFENDER" && isDefender) {
    return move.type === "DECLARE_DEFENSE" || move.type === "DECLINE_DEFENSE"
  }

  if (combat.roundPhase === "CARD_PLAY") {
    // Winning player may act out of turn only for events/combat control.
    return (
      move.type === "PLAY_EVENT" ||
      move.type === "SET_COMBAT_LEVEL" ||
      move.type === "SWITCH_COMBAT_SIDE"
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
  const discardedIds = discarded.map((c) => c.instanceId)
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

  events.push({
    type: "HOLDING_PLAYED",
    playerId,
    instanceId: card.instanceId,
    slot: move.realmSlot,
  })

  let s = {
    ...updatePlayer(state, playerId, {
      hand: newHand,
      formation: {
        ...player.formation,
        slots: {
          ...player.formation.slots,
          [move.realmSlot]: {
            ...realmSlot,
            holdings: [...realmSlot.holdings, card],
            holdingRevealedToAll: false,
          },
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
  } else if (move.type === "PLAY_EVENT" && state.phase === Phase.EndTurn) {
    throw new EngineError("WRONG_PHASE", "Cannot play events in END_TURN")
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

    if (!player.pool.some((entry) => canChampionUseSpell(card, entry.champion))) {
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

  if (state.combatState?.roundPhase === "CARD_PLAY" && move.type === "PLAY_EVENT") {
    if (playerId === state.activePlayer) {
      throw new EngineError("LOSING_PLAYER_CANNOT_PLAY_EVENT")
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
  // Auto-advance from PlayRealm, Pool, or Combat to PhaseFive
  if (
    state.phase === Phase.PlayRealm ||
    state.phase === Phase.Pool ||
    state.phase === Phase.Combat
  ) {
    state = advanceToPhase(state, playerId, Phase.PhaseFive, events)
  }
  assertPhase(state, Phase.PhaseFive)
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
  const poolEntry = player.pool.find((e) => e.champion.instanceId === move.championId)
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
    attackerManualLevel: null,
    defenderManualLevel: null,
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
  let defenderChampion = null

  // Check pool first
  const poolEntry = s.players[playerId]!.pool.find((e) => e.champion.instanceId === move.championId)

  if (poolEntry) {
    defenderChampion = poolEntry.champion
  } else {
    const player = s.players[playerId]!
    const handIdx = player.hand.findIndex((c) => c.instanceId === move.championId)
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
        realmSlot &&
        !realmSlot.isRazed &&
        realmSlot.realm.instanceId === move.championId &&
        realmSlot.realm.card.level != null
      ) {
        defenderChampion = realmSlot.realm
        // Realm stays in formation — not moved anywhere
      } else {
        throw new EngineError(
          "CHAMPION_NOT_FOUND",
          "Defender champion not in pool, hand, or as self-defending realm",
        )
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
    "offensive",
  )
  const defenderLevel = calculateCombatLevel(
    defenderChampion,
    [],
    hasWorldMatch(defenderChampion, realmWorldId),
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
  if (playerId !== state.activePlayer) {
    throw new EngineError("NOT_ACTIVE_PLAYER", "Only the losing player can play combat cards")
  }
  const combat = state.combatState!
  const isAttacker = playerId === combat.attackingPlayer

  const player = state.players[playerId]!
  const [card, newHand] = removeFromHand(player.hand, move.cardInstanceId)
  const activeChampion = isAttacker ? combat.attacker : combat.defender
  if (!canPlayInCombat(card, activeChampion)) {
    throw new EngineError("INVALID_COMBAT_CARD", "Card cannot be played in combat")
  }

  events.push({ type: "COMBAT_CARD_PLAYED", playerId, instanceId: card.instanceId })

  // Add card to the appropriate side's combat cards
  const newCombat: CombatState = isAttacker
    ? { ...combat, attackerCards: [...combat.attackerCards, card] }
    : { ...combat, defenderCards: [...combat.defenderCards, card] }

  const s = updatePlayer({ ...state, combatState: newCombat }, playerId, { hand: newHand })

  // Recalculate levels and update active player (new losing side goes next)
  // Respect manual overrides — same logic as getLegalMoves/getCardPlayMoves
  const realmSlot = s.players[combat.defendingPlayer]!.formation.slots[combat.targetRealmSlot]
  const realmWorldId = realmSlot?.realm.card.worldId ?? 0
  const attackerLevel =
    newCombat.attackerManualLevel ??
    calculateCombatLevel(
      newCombat.attacker!,
      newCombat.attackerCards,
      hasWorldMatch(newCombat.attacker!, realmWorldId),
      "offensive",
    )
  const defenderLevel =
    newCombat.defenderManualLevel ??
    calculateCombatLevel(
      newCombat.defender!,
      newCombat.defenderCards,
      hasWorldMatch(newCombat.defender!, realmWorldId),
      "defensive",
    )
  const losingPlayer = getLosingPlayer(attackerLevel, defenderLevel, newCombat)

  return { ...s, activePlayer: losingPlayer }
}

function handleStopPlaying(state: GameState, playerId: PlayerId, events: GameEvent[]): GameState {
  assertCombatPhase(state, "CARD_PLAY")
  if (playerId !== state.activePlayer) {
    throw new EngineError("NOT_ACTIVE_PLAYER", "Only the losing player can stop card play")
  }
  const combat = state.combatState!

  const realmSlot = state.players[combat.defendingPlayer]!.formation.slots[combat.targetRealmSlot]
  const realmWorldId = realmSlot?.realm.card.worldId ?? 0

  // Use manual override if set, otherwise auto-compute
  const attackerLevel =
    combat.attackerManualLevel ??
    calculateCombatLevel(
      combat.attacker!,
      combat.attackerCards,
      hasWorldMatch(combat.attacker!, realmWorldId),
      "offensive",
    )
  const defenderLevel =
    combat.defenderManualLevel ??
    calculateCombatLevel(
      combat.defender!,
      combat.defenderCards,
      hasWorldMatch(combat.defender!, realmWorldId),
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
  const poolEntry = player.pool.find((e) => e.champion.instanceId === move.championId)
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

function handleEndAttack(state: GameState, playerId: PlayerId, _events: GameEvent[]): GameState {
  assertCombatPhase(state, "AWAITING_ATTACKER")
  const combat = state.combatState!
  if (playerId !== combat.attackingPlayer) {
    throw new EngineError("NOT_ATTACKER")
  }
  return endBattle(state, combat.attackingPlayer, _events)
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

  // Recalculate who is losing after the level change and update active player
  const realmSlot = state.players[combat.defendingPlayer]!.formation.slots[combat.targetRealmSlot]
  const realmWorldId = realmSlot?.realm.card.worldId ?? 0
  const newAttackerLevel =
    newCombat.attackerManualLevel ??
    calculateCombatLevel(
      newCombat.attacker!,
      newCombat.attackerCards,
      hasWorldMatch(newCombat.attacker!, realmWorldId),
      "offensive",
    )
  const newDefenderLevel =
    newCombat.defenderManualLevel ??
    calculateCombatLevel(
      newCombat.defender!,
      newCombat.defenderCards,
      hasWorldMatch(newCombat.defender!, realmWorldId),
      "defensive",
    )
  const losingPlayer = getLosingPlayer(newAttackerLevel, newDefenderLevel, newCombat)

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

  if (!inAttacker && !inDefender) {
    throw new EngineError("TARGET_NOT_FOUND", "Card is not in active combat")
  }

  const card = (inAttacker ? combat.attackerCards : combat.defenderCards).find(
    (c) => c.instanceId === cardInstanceId,
  )!

  const from = inAttacker ? "attacker_combat" : "defender_combat"
  const to = inAttacker ? "defender_combat" : "attacker_combat"

  events.push({
    type: "COMBAT_CARD_SWITCHED",
    playerId: inAttacker ? combat.attackingPlayer : combat.defendingPlayer,
    instanceId: cardInstanceId,
    from,
    to,
  })

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
  const isRealmDefender =
    !defendingPlayer.pool.some((e) => e.champion.instanceId === combat.defender!.instanceId) &&
    targetRealmSlot?.realm.instanceId === combat.defender!.instanceId

  // Discard attacker's combat cards (allies/spells); their champion stays in pool
  const attackerDiscards = combat.attackerCards
  if (attackerDiscards.length > 0) {
    events.push({
      type: "CARDS_DISCARDED",
      playerId: combat.attackingPlayer,
      instanceIds: attackerDiscards.map((c) => c.instanceId),
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
        instanceIds: defenderCardDiscards.map((c) => c.instanceId),
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
    (e) => e.champion.instanceId === combat.defender!.instanceId,
  )
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
  const newDefenderPool = s.players[combat.defendingPlayer]!.pool.filter(
    (e) => e.champion.instanceId !== combat.defender!.instanceId,
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

function handleDefenderWins(state: GameState, combat: CombatState, events: GameEvent[]): GameState {
  const attackingPlayer = state.players[combat.attackingPlayer]!

  // Discard attacker champion + pool entry attachments + all combat cards
  const attackerEntry = attackingPlayer.pool.find(
    (e) => e.champion.instanceId === combat.attacker!.instanceId,
  )

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
  const newAttackerPool = attackingPlayer.pool.filter(
    (e) => e.champion.instanceId !== combat.attacker!.instanceId,
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
    throw new EngineError(
      "WRONG_COMBAT_PHASE",
      `Expected ${phase}, got ${state.combatState.roundPhase}`,
    )
  }
}
