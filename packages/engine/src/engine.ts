import type {
  GameState, GameEvent, Move, EngineResult,
  PlayerId, CardInstanceId, FormationSlot,
  CombatState, PoolEntry, LimboEntry,
  PendingEffect,
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
    case "PLAY_EVENT":
      newState = handlePlaySpellCard(state, playerId, move, events)
      break
    case "RESOLVE_EFFECT":
      newState = handleResolveEffect(state, playerId, move, events)
      break
    case "SKIP_EFFECT":
      newState = handleSkipEffect(state, playerId, events)
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
      move.type === "PLAY_EVENT"
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
      s = checkWinCondition(s, events)

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

  return updatePlayer(
    { ...state, pendingEffects: [...state.pendingEffects, effect], activePlayer: playerId },
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

  return {
    ...updatePlayer(state, playerId, {
      hand: newHand,
      discardPile: newDiscardPile,
      formation: {
        ...player.formation,
        slots: {
          ...player.formation.slots,
          [move.slot]: { realm: card, isRazed: false, holdings: [] },
        },
      },
    }),
    hasPlayedRealmThisTurn: true,
  }
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

  return {
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

  return {
    ...updatePlayer(state, playerId, {
      hand: newHand,
      formation: {
        ...player.formation,
        slots: {
          ...player.formation.slots,
          [move.realmSlot]: { ...realmSlot, holdings: [...realmSlot.holdings, card] },
        },
      },
    }),
    hasPlayedRealmThisTurn: true,
  }
}

function handlePlaceChampion(
  state: GameState,
  playerId: PlayerId,
  move: Extract<Move, { type: "PLACE_CHAMPION" }>,
  events: GameEvent[],
): GameState {
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
    s = { ...s, pendingEffects: [...s.pendingEffects, effect], activePlayer: playerId }
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
    // Check hand — champion played directly from hand to defend
    const player = s.players[playerId]!
    const handIdx = player.hand.findIndex(c => c.instanceId === move.championId)
    if (handIdx === -1) {
      throw new EngineError("CHAMPION_NOT_FOUND", "Defender champion not in pool or hand")
    }
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

  const attackerLevel = calculateCombatLevel(
    combat.attacker!,
    combat.attackerCards,
    hasWorldMatch(combat.attacker!, realmWorldId),
    combat.effectSpecs,
    "offensive",
  )
  const defenderLevel = calculateCombatLevel(
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
  const newDefenderPool = defendingPlayer.pool.filter(
    e => e.champion.instanceId !== combat.defender!.instanceId,
  )

  // Discard attacker's combat cards (allies/spells); their champion stays in pool
  const attackerDiscards = combat.attackerCards
  if (attackerDiscards.length > 0) {
    events.push({
      type: "CARDS_DISCARDED",
      playerId: combat.attackingPlayer,
      instanceIds: attackerDiscards.map(c => c.instanceId),
    })
  }

  let s = updatePlayer(state, combat.defendingPlayer, {
    pool: newDefenderPool,
    discardPile: [...defendingPlayer.discardPile, ...defenderDiscardCards],
  })

  const attackingPlayer = s.players[combat.attackingPlayer]!
  s = updatePlayer(s, combat.attackingPlayer, {
    discardPile: [...attackingPlayer.discardPile, ...attackerDiscards],
  })

  // Transition to AWAITING_ATTACKER for potential next round
  const newCombat: CombatState = {
    ...combat,
    roundPhase: "AWAITING_ATTACKER",
    attacker: null,
    defender: null,
    attackerCards: [],
    defenderCards: [],
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
  // A player wins when their opponent has ALL realms razed (and has placed at least one)
  for (const [winnerId, _] of Object.entries(state.players)) {
    const opponentId = state.playerOrder.find(id => id !== winnerId)!
    const opponent = state.players[opponentId]!

    const slots = Object.values(opponent.formation.slots).filter(Boolean)
    if (slots.length === 0) continue  // opponent hasn't placed any realms yet

    const allRazed = slots.every(slot => slot!.isRazed)
    if (allRazed) {
      events.push({ type: "GAME_OVER", winner: winnerId })
      return { ...state, winner: winnerId }
    }
  }

  return state
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
