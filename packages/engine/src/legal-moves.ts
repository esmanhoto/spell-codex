import type {
  GameState,
  Move,
  PlayerId,
  FormationSlot,
  CardInstance,
  CardData,
  CardInstanceId,
  PoolEntry,
  PlayerState,
  CombatState,
  Formation,
  TriggerEntry,
} from "./types.ts"
import { Phase } from "./types.ts"
import {
  CardTypeId,
  COSMOS_TYPE_IDS,
  HAND_SIZES,
  COMBAT_SUPPORT_TYPE_IDS,
  PROTECTED_BY,
} from "./constants.ts"
import { isChampionType, isSpellType } from "./utils.ts"
import { getLosingPlayer, getPoolAttachments, getCombatLevels } from "./combat.ts"
import {
  canChampionUseSpell,
  canCastWithSupport,
  getEffectiveSupportIds,
  getCastPhases,
} from "./spell-gating.ts"
import type { SpellCastContext } from "./spell-gating.ts"

/**
 * Returns all legal moves for the given player in the current state.
 * Called after every applyMove to populate EngineResult.legalMoves.
 *
 * Priority chain:
 * 1. Active combat → combat-specific moves
 * 2. Normal: StartOfTurn shows Draw (PASS) + events/rules.
 *    PlayRealm through Combat: collects moves from current phase + all forward phases.
 *    Players can skip phases freely (forward only). Engine auto-advances phase on action.
 */
export function getLegalMoves(state: GameState, playerId: PlayerId): Move[] {
  if (state.winner !== null) return []

  const player = state.players[playerId]
  if (!player) return []

  // 0a. Pending triggers — only the owning player may act, with RESOLVE_TRIGGER_* moves only
  if (state.pendingTriggers.length > 0) {
    const trigger = state.pendingTriggers[0]!
    if (playerId === trigger.owningPlayerId) {
      return dedupeMoves(getTriggerMoves(state, trigger, playerId))
    }
    return []
  }

  // 0b. Resolution context — only the resolving player may act, with RESOLVE_* moves only
  if (state.resolutionContext) {
    if (playerId === state.resolutionContext.resolvingPlayer) {
      return dedupeMoves(getResolutionMoves(state, playerId))
    }
    // Non-resolving player: during counter window they may acknowledge or use a counter card
    if (state.resolutionContext.counterWindowOpen) {
      const isCounter = (e: { type: string }) =>
        e.type === "counter_event" || e.type === "counter_spell"
      const moves: Move[] = [{ type: "PASS_COUNTER" }]
      // Hand counter cards (Calm, Dispel Magic, etc.) — played and discarded
      for (const inst of player.hand) {
        if (inst.card.effects.some(isCounter)) {
          moves.push({ type: "PLAY_EVENT", cardInstanceId: inst.instanceId })
        }
      }
      // Pool counter cards (Rod of Dispel Magic, Dori's Cape, Delsenora) — stay in pool
      for (const entry of player.pool) {
        if (entry.champion.card.effects.some(isCounter)) {
          moves.push({ type: "USE_POOL_COUNTER", cardInstanceId: entry.champion.instanceId })
        }
        for (const att of entry.attachments) {
          if (att.card.effects.some(isCounter)) {
            moves.push({ type: "USE_POOL_COUNTER", cardInstanceId: att.instanceId })
          }
        }
      }
      return moves
    }
    return []
  }

  // 1. During active combat, use combat-specific move set
  if (state.combatState) {
    return dedupeMoves(getCombatMoves(state, playerId))
  }

  // Spoil may be claimed at any time outside combat/resolution (even when not active player)
  const spoilMove: Move[] = state.pendingSpoil === playerId ? [{ type: "CLAIM_SPOIL" }] : []

  // 2. Out-of-combat: non-active player may play events at any phase
  if (state.activePlayer !== playerId) {
    return dedupeMoves([...spoilMove, ...getEventMoves(state.players[playerId]!)])
  }

  // Active player may always return cards from any discard pile
  const returnFromDiscardMoves: Move[] = []
  for (const [ownerId, player] of Object.entries(state.players)) {
    for (const card of player.discardPile) {
      returnFromDiscardMoves.push({
        type: "RETURN_FROM_DISCARD",
        playerId: ownerId,
        cardInstanceId: card.instanceId,
        destination: "hand",
      })
      returnFromDiscardMoves.push({
        type: "RETURN_FROM_DISCARD",
        playerId: ownerId,
        cardInstanceId: card.instanceId,
        destination: "deck",
      })
      if (isChampionType(card.card.typeId)) {
        returnFromDiscardMoves.push({
          type: "RETURN_FROM_DISCARD",
          playerId: ownerId,
          cardInstanceId: card.instanceId,
          destination: "pool",
        })
      }
    }
  }

  switch (state.phase) {
    case Phase.StartOfTurn:
      return dedupeMoves([
        ...spoilMove,
        ...returnFromDiscardMoves,
        ...getStartOfTurnMoves(state, playerId),
      ])
    case Phase.Draw:
      return dedupeMoves([
        ...spoilMove,
        ...returnFromDiscardMoves,
        ...getEventMoves(state.players[playerId]!),
      ])
    case Phase.PlayRealm:
      return dedupeMoves([
        ...spoilMove,
        ...returnFromDiscardMoves,
        ...getForwardPhaseMoves(state, playerId, Phase.PlayRealm),
      ])
    case Phase.Pool:
      return dedupeMoves([
        ...spoilMove,
        ...returnFromDiscardMoves,
        ...getForwardPhaseMoves(state, playerId, Phase.Pool),
      ])
    case Phase.Combat:
      return dedupeMoves([
        ...spoilMove,
        ...returnFromDiscardMoves,
        ...getForwardPhaseMoves(state, playerId, Phase.Combat),
      ])
    case Phase.PhaseFive:
      return dedupeMoves([
        ...spoilMove,
        ...returnFromDiscardMoves,
        ...getPhaseFiveMoves(state, playerId),
      ])
    case Phase.EndTurn:
      return dedupeMoves([
        ...spoilMove,
        ...returnFromDiscardMoves,
        ...getEventMoves(state.players[playerId]!),
      ])
    default:
      return []
  }
}

function dedupeMoves(moves: Move[]): Move[] {
  const seen = new Set<string>()
  const out: Move[] = []
  for (const move of moves) {
    const key = JSON.stringify(move)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(move)
  }
  return out
}

// ─── Resolution Moves ────────────────────────────────────────────────────────

function getResolutionMoves(state: GameState, _playerId: PlayerId): Move[] {
  const moves: Move[] = [{ type: "RESOLVE_DONE" }]

  // Destination choices for the resolved card
  for (const dest of ["discard", "abyss", "void", "in_play"] as const) {
    moves.push({ type: "RESOLVE_SET_CARD_DESTINATION", destination: dest })
  }

  // Raze any unrazed realm
  for (const [ownerId, player] of Object.entries(state.players)) {
    for (const [slot, realmSlot] of Object.entries(player.formation.slots)) {
      if (realmSlot && !realmSlot.isRazed) {
        moves.push({
          type: "RESOLVE_RAZE_REALM",
          playerId: ownerId,
          slot: slot as FormationSlot,
        })
      }
    }
  }

  // Rebuild any razed realm
  for (const [ownerId, player] of Object.entries(state.players)) {
    for (const [slot, realmSlot] of Object.entries(player.formation.slots)) {
      if (realmSlot && realmSlot.isRazed) {
        moves.push({
          type: "RESOLVE_REBUILD_REALM",
          playerId: ownerId,
          slot: slot as FormationSlot,
        })
      }
    }
  }

  // Return champions from any discard pile to pool
  for (const [, player] of Object.entries(state.players)) {
    for (const card of player.discardPile) {
      if (isChampionType(card.card.typeId)) {
        moves.push({ type: "RESOLVE_RETURN_TO_POOL", cardInstanceId: card.instanceId })
      }
    }
  }

  // Draw cards (1–4) for each player
  for (const ownerId of Object.keys(state.players)) {
    for (let n = 1; n <= 4; n++) {
      moves.push({ type: "RESOLVE_DRAW_CARDS", playerId: ownerId, count: n })
    }
  }

  // Move pool champions to discard / limbo / abyss
  for (const [ownerId, player] of Object.entries(state.players)) {
    for (const entry of player.pool) {
      moves.push({
        type: "RESOLVE_MOVE_CARD",
        cardInstanceId: entry.champion.instanceId,
        destination: { zone: "discard", playerId: ownerId },
      })
      moves.push({
        type: "RESOLVE_MOVE_CARD",
        cardInstanceId: entry.champion.instanceId,
        destination: {
          zone: "limbo",
          playerId: ownerId,
          returnsOnTurn: state.currentTurn + 1,
        },
      })
      moves.push({
        type: "RESOLVE_MOVE_CARD",
        cardInstanceId: entry.champion.instanceId,
        destination: { zone: "abyss", playerId: ownerId },
      })

      // Pool attachments (allies, items, artifacts) to discard / abyss
      for (const att of entry.attachments) {
        moves.push({
          type: "RESOLVE_MOVE_CARD",
          cardInstanceId: att.instanceId,
          destination: { zone: "discard", playerId: ownerId },
        })
        moves.push({
          type: "RESOLVE_MOVE_CARD",
          cardInstanceId: att.instanceId,
          destination: { zone: "abyss", playerId: ownerId },
        })
      }
    }

    // Formation holdings to discard / abyss
    for (const realmSlot of Object.values(player.formation.slots)) {
      if (!realmSlot) continue
      for (const holding of realmSlot.holdings) {
        moves.push({
          type: "RESOLVE_MOVE_CARD",
          cardInstanceId: holding.instanceId,
          destination: { zone: "discard", playerId: ownerId },
        })
        moves.push({
          type: "RESOLVE_MOVE_CARD",
          cardInstanceId: holding.instanceId,
          destination: { zone: "abyss", playerId: ownerId },
        })
      }
    }

    // Lasting effects to discard / abyss
    for (const card of player.lastingEffects) {
      moves.push({
        type: "RESOLVE_MOVE_CARD",
        cardInstanceId: card.instanceId,
        destination: { zone: "discard", playerId: ownerId },
      })
      moves.push({
        type: "RESOLVE_MOVE_CARD",
        cardInstanceId: card.instanceId,
        destination: { zone: "abyss", playerId: ownerId },
      })
    }

    // Move discard / abyss cards back to hand
    for (const card of player.discardPile) {
      moves.push({
        type: "RESOLVE_MOVE_CARD",
        cardInstanceId: card.instanceId,
        destination: { zone: "hand", playerId: ownerId },
      })
    }
    for (const card of player.abyss) {
      moves.push({
        type: "RESOLVE_MOVE_CARD",
        cardInstanceId: card.instanceId,
        destination: { zone: "hand", playerId: ownerId },
      })
    }
  }

  return moves
}

// ─── Forward Phase Composition ───────────────────────────────────────────────

/** Phase order for forward-move collection */
const PHASE_ORDER = [Phase.PlayRealm, Phase.Pool, Phase.Combat] as const

/**
 * Collects moves from the given phase and all forward phases.
 * This lets players skip phases freely — the engine auto-advances
 * the phase field when a handler from a later phase executes.
 *
 * Also adds: PLAY_EVENT, TOGGLE_HOLDING_REVEAL, DISCARD_CARD, END_TURN.
 */
function getForwardPhaseMoves(state: GameState, playerId: PlayerId, fromPhase: Phase): Move[] {
  const player = state.players[playerId]!
  const moves: Move[] = []
  const startIdx = PHASE_ORDER.indexOf(fromPhase as (typeof PHASE_ORDER)[number])

  // Collect moves from current phase onward
  for (let i = startIdx; i < PHASE_ORDER.length; i++) {
    switch (PHASE_ORDER[i]) {
      case Phase.PlayRealm:
        moves.push(...getRealmOnlyMoves(state, playerId))
        break
      case Phase.Pool:
        moves.push(...getPoolOnlyMoves(state, player))
        break
      case Phase.Combat:
        moves.push(...getCombatDeclOnlyMoves(state, playerId))
        break
    }
  }

  // Available from any post-draw phase
  moves.push(...getEventMoves(player))
  moves.push(...getHoldingRevealMoves(player))
  moves.push(...getDiscardMoves(player))
  moves.push(...getRazeOwnRealmMoves(player, playerId))

  const { maxEnd } = HAND_SIZES[state.deckSize]!
  if (player.hand.length <= maxEnd) {
    moves.push({ type: "END_TURN" })
  }

  return moves
}

/** Discard moves — one per hand card */
function getDiscardMoves(player: PlayerState): Move[] {
  return player.hand.map((card) => ({
    type: "DISCARD_CARD" as const,
    cardInstanceId: card.instanceId,
  }))
}

// ─── Phase Move Generators ────────────────────────────────────────────────────

function getStartOfTurnMoves(state: GameState, playerId: PlayerId): Move[] {
  const moves: Move[] = [{ type: "PASS" }]
  const player = state.players[playerId]!

  // END_TURN is available from START_OF_TURN (draws cards then ends the turn in one step)
  const { maxEnd } = HAND_SIZES[state.deckSize]!
  if (player.hand.length <= maxEnd) {
    moves.push({ type: "END_TURN" })
  }

  for (const card of player.hand) {
    if (card.card.typeId === CardTypeId.Rule) {
      moves.push({ type: "PLAY_RULE_CARD", cardInstanceId: card.instanceId })
    }
  }
  moves.push(...getEventMoves(player))
  moves.push(...getHoldingRevealMoves(player))
  // Allow realm/holding plays during draw phase — engine will auto-draw when applied
  moves.push(...getRealmOnlyMoves(state, playerId))
  moves.push(...getRazeOwnRealmMoves(player, playerId))

  return moves
}

/** RAZE_OWN_REALM — all unrazed own realms (for card special powers like The Scarlet Brotherhood). */
function getRazeOwnRealmMoves(player: PlayerState, _playerId: PlayerId): Move[] {
  const moves: Move[] = []
  for (const [slot, s] of Object.entries(player.formation.slots)) {
    if (s && !s.isRazed) {
      moves.push({ type: "RAZE_OWN_REALM", slot: slot as FormationSlot })
    }
  }
  return moves
}

/** Realm-only moves: play/rebuild realm, play holding */
function getRealmOnlyMoves(state: GameState, playerId: PlayerId): Move[] {
  const moves: Move[] = []
  const player = state.players[playerId]!
  const legalSlots = getLegalRealmSlots(player.formation)

  if (!state.hasPlayedRealmThisTurn) {
    for (const card of player.hand) {
      if (card.card.typeId === CardTypeId.Realm) {
        if (!isUniqueInPlay(card.card, state)) continue
        for (const slot of legalSlots) {
          if (!player.formation.slots[slot]) {
            moves.push({ type: "PLAY_REALM", cardInstanceId: card.instanceId, slot })
          }
        }
        for (const [slot, realmSlot] of Object.entries(player.formation.slots)) {
          if (realmSlot?.isRazed) {
            moves.push({
              type: "PLAY_REALM",
              cardInstanceId: card.instanceId,
              slot: slot as FormationSlot,
            })
          }
        }
      }
    }

    if (player.hand.length >= 3) {
      const defaultIds = player.hand.slice(0, 3).map((c) => c.instanceId) as [
        CardInstanceId,
        CardInstanceId,
        CardInstanceId,
      ]
      for (const [slot, realmSlot] of Object.entries(player.formation.slots)) {
        if (realmSlot?.isRazed) {
          moves.push({
            type: "REBUILD_REALM",
            slot: slot as FormationSlot,
            cardInstanceIds: defaultIds,
          })
        }
      }
    }

    for (const [slot, realmSlot] of Object.entries(player.formation.slots)) {
      if (realmSlot?.isRazed) {
        moves.push({ type: "DISCARD_RAZED_REALM", slot: slot as FormationSlot })
      }
    }

    for (const card of player.hand) {
      if (card.card.typeId === CardTypeId.Holding) {
        if (!isUniqueInPlay(card.card, state)) continue
        const isRebuilder = card.card.effects.some((e) => e.type === "rebuild_realm")
        for (const [slot, realmSlot] of Object.entries(player.formation.slots)) {
          if (!realmSlot) continue
          if (realmSlot.isRazed && !isRebuilder) continue
          if (!realmSlot.isRazed && realmSlot.holdings.length > 0) continue
          if (!worldCompatible(card.card, realmSlot.realm.card)) continue
          moves.push({
            type: "PLAY_HOLDING",
            cardInstanceId: card.instanceId,
            realmSlot: slot as FormationSlot,
          })
        }
      }
    }
  }

  return moves
}

/** Pool-only moves: place champion, attach items, phase 3 spells */
function getPoolOnlyMoves(state: GameState, player: PlayerState): Move[] {
  const moves: Move[] = []

  const hasUnrazedRealm = Object.values(player.formation.slots).some(
    (slot) => slot && !slot.isRazed,
  )
  if (hasUnrazedRealm) {
    for (const card of player.hand) {
      if (isChampionType(card.card.typeId)) {
        if (!isUniqueInPlay(card.card, state)) continue
        moves.push({ type: "PLACE_CHAMPION", cardInstanceId: card.instanceId })
      }
    }
  }

  for (const card of player.hand) {
    if (card.card.typeId === CardTypeId.Artifact) {
      if (!isUniqueInPlay(card.card, state)) continue
      for (const entry of player.pool) {
        const alreadyHasArtifact = entry.attachments.some(
          (a) => a.card.typeId === CardTypeId.Artifact,
        )
        if (alreadyHasArtifact) continue
        if (!worldCompatible(card.card, entry.champion.card)) continue
        moves.push({
          type: "ATTACH_ITEM",
          cardInstanceId: card.instanceId,
          championId: entry.champion.instanceId,
        })
      }
    }
  }

  for (const card of player.hand) {
    if (card.card.typeId === CardTypeId.MagicalItem) {
      for (const entry of player.pool) {
        moves.push({
          type: "ATTACH_ITEM",
          cardInstanceId: card.instanceId,
          championId: entry.champion.instanceId,
        })
      }
    }
  }

  if (player.pool.length > 0) {
    for (const card of player.hand) {
      if (isPhase3Card(card.card.typeId)) {
        if (isSpellType(card.card.typeId)) {
          if (!getCastPhases(card).includes(3)) continue
          if (!poolHasSpellCaster(player.pool, card)) continue
          moves.push({ type: "PLAY_PHASE3_CARD", cardInstanceId: card.instanceId })
          continue
        }
        if (poolHasChampionFor(player.pool, card, "o")) {
          moves.push({ type: "PLAY_PHASE3_CARD", cardInstanceId: card.instanceId })
        }
      }
    }
  }

  return moves
}

/** Combat declaration-only moves: declare attack */
function getCombatDeclOnlyMoves(state: GameState, playerId: PlayerId): Move[] {
  const moves: Move[] = []
  const player = state.players[playerId]!

  const isRoundOne = state.currentTurn <= state.playerOrder.length
  if (isRoundOne || state.hasAttackedThisTurn) return moves

  // Candidates: pool champions + hand champions
  const poolChampions = player.pool.map((e) => e.champion)
  const handChampions = player.hand
    .filter((c) => isChampionType(c.card.typeId) && isUniqueInPlay(c.card, state))
    .map((c) => c)

  if (poolChampions.length === 0 && handChampions.length === 0) return moves

  for (const [otherPlayerId, otherPlayer] of Object.entries(state.players)) {
    if (otherPlayerId === playerId) continue
    for (const [slot, realmSlot] of Object.entries(otherPlayer.formation.slots)) {
      if (!realmSlot || realmSlot.isRazed) continue
      for (const champ of poolChampions) {
        if (!isAttackable(otherPlayer.formation, slot as FormationSlot, champ)) continue
        moves.push({
          type: "DECLARE_ATTACK",
          championId: champ.instanceId,
          targetRealmSlot: slot as FormationSlot,
          targetPlayerId: otherPlayerId,
        })
      }
      for (const card of handChampions) {
        if (!isAttackable(otherPlayer.formation, slot as FormationSlot, card)) continue
        moves.push({
          type: "DECLARE_ATTACK",
          championId: card.instanceId,
          targetRealmSlot: slot as FormationSlot,
          targetPlayerId: otherPlayerId,
        })
      }
    }
  }

  return moves
}

function getCombatMoves(state: GameState, playerId: PlayerId): Move[] {
  const combat = state.combatState!

  switch (combat.roundPhase) {
    case "AWAITING_ATTACKER":
      return getAttackerContinueMoves(state, playerId, combat)

    case "AWAITING_DEFENDER":
      return getDefenderMoves(state, playerId, combat)

    case "CARD_PLAY":
      return getCardPlayMoves(state, playerId, combat)

    default:
      return []
  }
}

function getAttackerContinueMoves(
  state: GameState,
  playerId: PlayerId,
  combat: CombatState,
): Move[] {
  // Defending player may play events while attacker is choosing next champion
  if (playerId === combat.defendingPlayer) {
    return [...getEventMoves(state.players[playerId]!), { type: "INTERRUPT_COMBAT" }]
  }
  if (playerId !== combat.attackingPlayer) return []

  const moves: Move[] = [{ type: "END_ATTACK" }, { type: "INTERRUPT_COMBAT" }]
  const player = state.players[playerId]!

  for (const entry of player.pool) {
    if (combat.championsUsedThisBattle.includes(entry.champion.instanceId)) continue
    moves.push({ type: "CONTINUE_ATTACK", championId: entry.champion.instanceId })
  }

  for (const card of player.hand) {
    if (!isChampionType(card.card.typeId)) continue
    if (!isUniqueInPlay(card.card, state)) continue
    if (combat.championsUsedThisBattle.includes(card.instanceId)) continue
    moves.push({ type: "CONTINUE_ATTACK", championId: card.instanceId })
  }

  return moves
}

function getDefenderMoves(state: GameState, playerId: PlayerId, combat: CombatState): Move[] {
  // Attacking player may play events while defender is choosing their response
  if (playerId === combat.attackingPlayer) {
    return [...getEventMoves(state.players[playerId]!), { type: "INTERRUPT_COMBAT" }]
  }
  if (playerId !== combat.defendingPlayer) return []

  const moves: Move[] = [{ type: "DECLINE_DEFENSE" }, { type: "INTERRUPT_COMBAT" }]
  const player = state.players[playerId]!

  // Defend with pool champion
  for (const entry of player.pool) {
    if (combat.championsUsedThisBattle.includes(entry.champion.instanceId)) continue
    moves.push({ type: "DECLARE_DEFENSE", championId: entry.champion.instanceId })
  }

  // Defend with champion from hand (played directly into combat)
  for (const card of player.hand) {
    if (isChampionType(card.card.typeId)) {
      if (!isUniqueInPlay(card.card, state)) continue
      moves.push({ type: "DECLARE_DEFENSE", championId: card.instanceId })
    }
  }

  // Self-defending realm — realm can act as its own defender if it has a level
  const targetSlot = player.formation.slots[combat.targetRealmSlot]
  if (
    targetSlot &&
    !targetSlot.isRazed &&
    targetSlot.realm.card.level != null &&
    !combat.championsUsedThisBattle.includes(targetSlot.realm.instanceId)
  ) {
    moves.push({ type: "DECLARE_DEFENSE", championId: targetSlot.realm.instanceId })
  }

  return moves
}

function getCardPlayMoves(state: GameState, playerId: PlayerId, combat: CombatState): Move[] {
  // Determine who is losing to know who may play freely
  const isAttacker = playerId === combat.attackingPlayer
  const isDefender = playerId === combat.defendingPlayer
  if (!isAttacker && !isDefender) return []

  const { attackerLevel, defenderLevel } = getCombatLevels(state, combat)
  const losingPlayer = getLosingPlayer(attackerLevel, defenderLevel, combat)
  const isLosing = playerId === losingPlayer

  const moves: Move[] = []

  const player = state.players[playerId]!
  const combatRealmSlot =
    state.players[combat.defendingPlayer]!.formation.slots[combat.targetRealmSlot]

  if (isLosing) {
    // Losing player can play any combat-legal support card
    const activeChampion = isAttacker ? combat.attacker : combat.defender

    // Build spell-casting context: attachments always; defending realm only for the defender
    const activePoolEntry = activeChampion
      ? player.pool.find((e) => e.champion.instanceId === activeChampion.instanceId)
      : null
    let spellContext: SpellCastContext = {
      attachments: activePoolEntry?.attachments.map((a) => a.card) ?? [],
    }
    if (!isAttacker && activeChampion) {
      if (combatRealmSlot) {
        spellContext = {
          ...spellContext,
          defendingRealm: combatRealmSlot.realm.card,
          holdingsOnRealm: combatRealmSlot.holdings.map((h) => h.card),
        }
      }
    }

    for (const card of player.hand) {
      if (canPlayInCombat(card, activeChampion, spellContext)) {
        moves.push({ type: "PLAY_COMBAT_CARD", cardInstanceId: card.instanceId })
      }
    }
    moves.push({ type: "STOP_PLAYING" })
  }
  // Both players may play events during card play
  moves.push(...getEventMoves(player))
  moves.push(...getHoldingRevealMoves(player))

  // Either participant may interrupt (no winner, champions return intact)
  if (isAttacker || isDefender) {
    moves.push({ type: "INTERRUPT_COMBAT" })
  }

  // Either combat participant may set level, switch or discard card sides during CARD_PLAY
  if (isAttacker || isDefender) {
    moves.push({
      type: "SET_COMBAT_LEVEL",
      playerId,
      level: isAttacker ? attackerLevel : defenderLevel,
    })
    for (const card of combat.attackerCards) {
      moves.push({ type: "SWITCH_COMBAT_SIDE", cardInstanceId: card.instanceId })
      moves.push({ type: "DISCARD_COMBAT_CARD", cardInstanceId: card.instanceId })
    }
    for (const card of combat.defenderCards) {
      moves.push({ type: "SWITCH_COMBAT_SIDE", cardInstanceId: card.instanceId })
      moves.push({ type: "DISCARD_COMBAT_CARD", cardInstanceId: card.instanceId })
    }
    // Pool attachments on active champions also count toward combat level and can be switched/discarded
    if (combat.attacker) {
      for (const card of getPoolAttachments(
        state,
        combat.attackingPlayer,
        combat.attacker.instanceId,
      )) {
        moves.push({ type: "SWITCH_COMBAT_SIDE", cardInstanceId: card.instanceId })
        moves.push({ type: "DISCARD_COMBAT_CARD", cardInstanceId: card.instanceId })
      }
    }
    if (combat.defender) {
      for (const card of getPoolAttachments(
        state,
        combat.defendingPlayer,
        combat.defender.instanceId,
      )) {
        moves.push({ type: "SWITCH_COMBAT_SIDE", cardInstanceId: card.instanceId })
        moves.push({ type: "DISCARD_COMBAT_CARD", cardInstanceId: card.instanceId })
      }
    }
  }

  return moves
}

function getPhaseFiveMoves(state: GameState, playerId: PlayerId): Move[] {
  const player = state.players[playerId]!
  const { maxEnd } = HAND_SIZES[state.deckSize]!

  const moves: Move[] = []

  // Must discard to meet hand limit before ending turn; voluntary discard is always allowed
  for (const card of player.hand) {
    moves.push({ type: "DISCARD_CARD" as const, cardInstanceId: card.instanceId })
  }

  if (player.hand.length > maxEnd) {
    // Forced discard — only discard moves are legal
    return moves
  }

  // Hand is within limit — player can end turn or play events
  moves.push({ type: "END_TURN" })

  for (const card of player.hand) {
    if (
      card.card.typeId === CardTypeId.Event ||
      (isSpellType(card.card.typeId) &&
        getCastPhases(card).includes(5) &&
        poolHasSpellCaster(player.pool, card))
    ) {
      moves.push({ type: "PLAY_PHASE5_CARD", cardInstanceId: card.instanceId })
    }
  }
  moves.push(...getHoldingRevealMoves(player))
  moves.push(...getRazeOwnRealmMoves(player, playerId))

  return moves
}

// ─── Formation Helpers ────────────────────────────────────────────────────────

/**
 * Returns the set of formation slots a realm can legally be placed into.
 * Enforces the pyramid placement order: A → B/C → D/E/F.
 */
export function getLegalRealmSlots(formation: Formation): FormationSlot[] {
  const { slots } = formation

  if (!slots["A"]) return ["A"] // A must be placed first

  const legal: FormationSlot[] = []

  // B and C require A to be filled
  if (!slots["B"]) legal.push("B")
  if (!slots["C"]) legal.push("C")

  // D, E, F require both B and C to be filled
  if (slots["B"] && slots["C"]) {
    if (!slots["D"]) legal.push("D")
    if (!slots["E"]) legal.push("E")
    if (!slots["F"]) legal.push("F")
  }

  // 8/10 realm slots — simplified; extend when implementing larger formations
  if (formation.size >= 8 && slots["D"] && slots["E"] && slots["F"]) {
    if (!slots["G"]) legal.push("G")
    if (!slots["H"]) legal.push("H")
  }
  if (formation.size >= 10 && slots["G"] && slots["H"]) {
    if (!slots["I"]) legal.push("I")
    if (!slots["J"]) legal.push("J")
  }

  return legal
}

/**
 * Returns true if a realm in the given slot can be attacked by the champion.
 * Applies protection rules and movement types (Flyer bypasses protection).
 */
export function isAttackable(
  formation: Formation,
  slot: FormationSlot,
  champion: CardInstance,
): boolean {
  const isFlyer = champion.card.attributes.includes("Flyer")
  if (isFlyer) return true // Flyers can attack any realm

  const isSwimmer = champion.card.attributes.includes("Swimmer")
  const targetRealm = formation.slots[slot]?.realm
  const isCoastal = targetRealm?.card.attributes.includes("Coast") ?? false
  if (isSwimmer && isCoastal) return true // Swimmers attack any coastal realm

  // Standard protection: all protecting slots must be razed or empty
  const protectors = PROTECTED_BY[slot] ?? []
  return protectors.every((p) => {
    const s = formation.slots[p as FormationSlot]
    return !s || s.isRazed
  })
}

// ─── Rule of the Cosmos ───────────────────────────────────────────────────────

/**
 * Returns true if the card CAN be played (no identical card already in play).
 * Applies only to COSMOS_TYPE_IDS — all other types always return true.
 *
 * "In play" includes: pool, formation (including razed realms), attachments.
 * "Not in play": Limbo (intentionally excluded per rules).
 */
export function isUniqueInPlay(card: CardData, state: GameState): boolean {
  if (!COSMOS_TYPE_IDS.has(card.typeId)) return true

  for (const player of Object.values(state.players)) {
    // Pool champions
    if (player.pool.some((e) => nameAndTypeMatch(e.champion.card, card))) return false
    // Pool attachments (artifacts)
    for (const e of player.pool) {
      if (e.attachments.some((a) => nameAndTypeMatch(a.card, card))) return false
    }
    // Formation (including razed realms)
    for (const realmSlot of Object.values(player.formation.slots)) {
      if (!realmSlot) continue
      if (nameAndTypeMatch(realmSlot.realm.card, card)) return false
      if (realmSlot.holdings.some((h) => nameAndTypeMatch(h.card, card))) return false
    }
    // Limbo intentionally not checked — limbo champions are NOT in play
  }

  return true
}

function nameAndTypeMatch(a: CardData, b: CardData): boolean {
  return a.name === b.name && a.typeId === b.typeId
}

// ─── Support / Spell Helpers ──────────────────────────────────────────────────

/** Returns PLAY_EVENT moves for all event cards in hand. */
function getEventMoves(player: PlayerState): Move[] {
  return player.hand
    .filter((c) => c.card.typeId === CardTypeId.Event)
    .map((c) => ({ type: "PLAY_EVENT" as const, cardInstanceId: c.instanceId }))
}

/** Returns TOGGLE_HOLDING_REVEAL moves for every own realm with at least one holding. */
function getHoldingRevealMoves(player: PlayerState): Move[] {
  const moves: Move[] = []
  for (const [slot, realmSlot] of Object.entries(player.formation.slots)) {
    if (!realmSlot || realmSlot.isRazed || realmSlot.holdings.length === 0) continue
    moves.push({ type: "TOGGLE_HOLDING_REVEAL", realmSlot: slot as FormationSlot })
  }
  return moves
}

/** Returns true if the card type is playable in Phase 3 */
function isPhase3Card(typeId: number): boolean {
  return isSpellType(typeId) || typeId === CardTypeId.BloodAbility
}

/**
 * Returns true if at least one pool champion can use the given support card.
 * @param dir - "o" for offensive (phase 3), "d" or "o" for combat
 */
function poolHasChampionFor(pool: PoolEntry[], card: CardInstance, dir: "d" | "o"): boolean {
  const typeRef = card.card.typeId
  const dirRef = `${dir}${typeRef}`

  return pool.some((entry) => {
    const { supportIds } = entry.champion.card
    if (isSpellType(typeRef)) {
      return supportIds.includes(dirRef) || supportIds.includes(typeRef)
    }
    return supportIds.includes(typeRef)
  })
}

function poolHasSpellCaster(pool: PoolEntry[], card: CardInstance): boolean {
  return pool.some((entry) =>
    canChampionUseSpell(card, entry.champion, {
      attachments: entry.attachments.map((a) => a.card),
    }),
  )
}

/**
 * Returns true if a card can be played during CARD_PLAY phase.
 * The active champion determines spell access. Spell direction is card-defined.
 * Pass context to include attachments and defending realm/holdings in the check.
 */
export function canPlayInCombat(
  card: CardInstance,
  activeChampion: CardInstance | null,
  context: SpellCastContext = {},
): boolean {
  const { typeId } = card.card
  if (!COMBAT_SUPPORT_TYPE_IDS.has(typeId)) return false

  // Allies and magical items can always be played (no spell access check)
  if (typeId === CardTypeId.Ally || typeId === CardTypeId.MagicalItem) return true

  // Spells must be castable in phase 4 and usable by this champion.
  if (isSpellType(typeId)) {
    if (!activeChampion) return false
    if (!getCastPhases(card).includes(4)) return false
    return canCastWithSupport(card, getEffectiveSupportIds(activeChampion.card, context))
  }

  return false
}

/** Returns true if the two cards are world-compatible (one is world-agnostic or same world) */
function worldCompatible(card: CardData, other: CardData): boolean {
  return card.worldId === 0 || other.worldId === 0 || card.worldId === other.worldId
}

// ─── Trigger Move Generator ───────────────────────────────────────────────────

/**
 * Returns generic trigger tool moves while a turn trigger is pending.
 * All tools are always available (filtered only by physical possibility).
 * Players decide which tools apply to their card's text.
 */
function getTriggerMoves(state: GameState, _trigger: TriggerEntry, playerId: PlayerId): Move[] {
  const trigger = state.pendingTriggers[0]!
  const moves: Move[] = []

  if (trigger.peekContext) {
    // Peek is open — offer discard options for draw_pile peeks, then done
    if (trigger.peekContext.source === "draw_pile") {
      for (const card of trigger.peekContext.cards) {
        moves.push({ type: "RESOLVE_TRIGGER_DISCARD_PEEKED", cardInstanceId: card.instanceId })
      }
    }
    moves.push({ type: "RESOLVE_TRIGGER_DONE" })
    return moves
  }

  // No peek open — offer all tools
  for (const pid of state.playerOrder) {
    const p = state.players[pid]!
    if (p.drawPile.length > 0) {
      moves.push({
        type: "RESOLVE_TRIGGER_PEEK",
        targetPlayerId: pid,
        source: "draw_pile",
        count: 1,
      })
      if (p.drawPile.length >= 3) {
        moves.push({
          type: "RESOLVE_TRIGGER_PEEK",
          targetPlayerId: pid,
          source: "draw_pile",
          count: 3,
        })
      }
    }
    if (p.hand.length > 0) {
      moves.push({ type: "RESOLVE_TRIGGER_PEEK", targetPlayerId: pid, source: "hand" })
    }
    if (pid !== playerId && p.hand.length > 0) {
      moves.push({ type: "RESOLVE_TRIGGER_DISCARD_FROM_HAND", targetPlayerId: pid })
    }
  }

  // Done is always available — player may simply close the trigger
  moves.push({ type: "RESOLVE_TRIGGER_DONE" })
  return moves
}
