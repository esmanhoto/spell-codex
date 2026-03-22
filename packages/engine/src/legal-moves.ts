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
} from "./constants.ts"
import { isChampionType, isSpellType } from "./utils.ts"
import { getPoolAttachments, getCombatLevels } from "./combat.ts"
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

  // 0b. Resolution context — resolver gets RESOLVE_* moves, others get nothing
  if (state.resolutionContext) {
    if (playerId === state.resolutionContext.resolvingPlayer) {
      return dedupeMoves(getResolutionMoves(state, playerId))
    }
    return []
  }

  // 0c. Pending spoil card — player must choose: play, keep, or return
  if (state.pendingSpoilCard) {
    if (playerId === state.pendingSpoil) {
      return dedupeMoves(getSpoilMoves(state, playerId))
    }
    return []
  }

  // 1. During active combat, use combat-specific move set
  if (state.combatState) {
    return dedupeMoves(getCombatMoves(state, playerId))
  }

  // Spoils are drawn automatically in earnSpoils — no CLAIM_SPOIL needed
  const spoilMove: Move[] = []

  // 2. Out-of-combat: non-active player may play events, discard, and raze realms at any phase
  if (state.activePlayer !== playerId) {
    return dedupeMoves([
      ...spoilMove,
      ...getEventMoves(state.players[playerId]!),
      ...getDiscardMoves(state.players[playerId]!),
      ...getRazeOwnRealmMoves(state.players[playerId]!, playerId),
    ])
  }

  // Active player may always return cards from any discard pile
  const returnFromDiscardMoves: Move[] = []
  for (const [ownerId, player] of Object.entries(state.players)) {
    if (player.discardPile.length > 0) {
      returnFromDiscardMoves.push({
        type: "SHUFFLE_DISCARD_INTO_DRAW_PILE",
        playerId: ownerId,
      })
    }
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

/** Returns the effective max hand size for a player, respecting per-player override. */
function getMaxHandSize(state: GameState, playerId: PlayerId): number {
  return state.players[playerId]?.maxHandSizeOverride ?? HAND_SIZES[state.deckSize]!.maxEnd
}

/** Manual-mode tool moves — always available to active player outside combat/resolution/triggers. */
function getManualToolMoves(state: GameState, playerId: PlayerId): Move[] {
  return [
    { type: "DRAW_EXTRA_CARDS", count: 1 },
    { type: "CHANGE_HAND_SIZE", newSize: getMaxHandSize(state, playerId) },
  ]
}

// ─── Resolution Moves ────────────────────────────────────────────────────────

function getResolutionMoves(state: GameState, playerId: PlayerId): Move[] {
  const moves: Move[] = [{ type: "RESOLVE_DONE" }]

  // Destination choices for the resolved card
  for (const dest of ["discard", "abyss", "void", "in_play"] as const) {
    moves.push({ type: "RESOLVE_SET_CARD_DESTINATION", destination: dest })
  }

  // Self-affecting RESOLVE_* moves — only for the resolving player's own cards.
  // Opponent-affecting actions are declared via RESOLVE_DONE { declarations } instead.

  // Raze own unrazed realms only
  const self = state.players[playerId]!
  for (const [slot, realmSlot] of Object.entries(self.formation.slots)) {
    if (realmSlot && !realmSlot.isRazed) {
      moves.push({
        type: "RESOLVE_RAZE_REALM",
        playerId,
        slot: slot as FormationSlot,
      })
    }
  }

  // Rebuild own razed realms only
  for (const [slot, realmSlot] of Object.entries(self.formation.slots)) {
    if (realmSlot && realmSlot.isRazed) {
      moves.push({
        type: "RESOLVE_REBUILD_REALM",
        playerId,
        slot: slot as FormationSlot,
      })
    }
  }

  // Return own champions from own discard pile to pool
  for (const card of self.discardPile) {
    if (isChampionType(card.card.typeId)) {
      moves.push({ type: "RESOLVE_RETURN_TO_POOL", cardInstanceId: card.instanceId })
    }
  }

  // Draw cards for self only
  for (let n = 1; n <= 4; n++) {
    moves.push({ type: "RESOLVE_DRAW_CARDS", playerId, count: n })
  }

  // Move own pool champions to discard / limbo / abyss
  for (const entry of self.pool) {
    moves.push({
      type: "RESOLVE_MOVE_CARD",
      cardInstanceId: entry.champion.instanceId,
      destination: { zone: "discard", playerId },
    })
    moves.push({
      type: "RESOLVE_MOVE_CARD",
      cardInstanceId: entry.champion.instanceId,
      destination: {
        zone: "limbo",
        playerId,
        returnsOnTurn: state.currentTurn + 1,
      },
    })
    moves.push({
      type: "RESOLVE_MOVE_CARD",
      cardInstanceId: entry.champion.instanceId,
      destination: { zone: "abyss", playerId },
    })

    for (const att of entry.attachments) {
      moves.push({
        type: "RESOLVE_MOVE_CARD",
        cardInstanceId: att.instanceId,
        destination: { zone: "discard", playerId },
      })
      moves.push({
        type: "RESOLVE_MOVE_CARD",
        cardInstanceId: att.instanceId,
        destination: { zone: "abyss", playerId },
      })
    }
  }

  // Own formation holdings to discard / abyss
  for (const realmSlot of Object.values(self.formation.slots)) {
    if (!realmSlot) continue
    for (const holding of realmSlot.holdings) {
      moves.push({
        type: "RESOLVE_MOVE_CARD",
        cardInstanceId: holding.instanceId,
        destination: { zone: "discard", playerId },
      })
      moves.push({
        type: "RESOLVE_MOVE_CARD",
        cardInstanceId: holding.instanceId,
        destination: { zone: "abyss", playerId },
      })
    }
  }

  // Own lasting effects to discard / abyss
  for (const card of self.lastingEffects) {
    moves.push({
      type: "RESOLVE_MOVE_CARD",
      cardInstanceId: card.instanceId,
      destination: { zone: "discard", playerId },
    })
    moves.push({
      type: "RESOLVE_MOVE_CARD",
      cardInstanceId: card.instanceId,
      destination: { zone: "abyss", playerId },
    })
  }

  // Move own discard / abyss cards back to hand
  for (const card of self.discardPile) {
    moves.push({
      type: "RESOLVE_MOVE_CARD",
      cardInstanceId: card.instanceId,
      destination: { zone: "hand", playerId },
    })
  }
  for (const card of self.abyss) {
    moves.push({
      type: "RESOLVE_MOVE_CARD",
      cardInstanceId: card.instanceId,
      destination: { zone: "hand", playerId },
    })
  }

  return moves
}

// ─── Spoil Moves ─────────────────────────────────────────────────────────────

function getSpoilMoves(state: GameState, playerId: PlayerId): Move[] {
  const card = state.pendingSpoilCard!
  const moves: Move[] = [{ type: "SPOIL_KEEP" }, { type: "SPOIL_RETURN" }]
  const typeId = card.card.typeId
  const player = state.players[playerId]!

  if (typeId === CardTypeId.Realm) {
    if (isUniqueInPlay(card.card, state)) {
      const legalSlots = getLegalRealmSlots(player.formation)
      for (const slot of legalSlots) {
        if (!player.formation.slots[slot]) {
          moves.push({ type: "SPOIL_PLAY", slot })
        }
      }
      for (const [slot, realmSlot] of Object.entries(player.formation.slots)) {
        if (realmSlot?.isRazed) {
          moves.push({ type: "SPOIL_PLAY", slot: slot as FormationSlot })
        }
      }
    }
  } else if (isChampionType(typeId)) {
    if (isUniqueInPlay(card.card, state)) {
      const hasUnrazedRealm = Object.values(player.formation.slots).some((s) => s && !s.isRazed)
      if (hasUnrazedRealm) {
        moves.push({ type: "SPOIL_PLAY" })
      }
    }
  } else if (typeId === CardTypeId.Holding) {
    if (isUniqueInPlay(card.card, state)) {
      const isRebuilder = card.card.effects.some((e) => e.type === "rebuild_realm")
      for (const [slot, realmSlot] of Object.entries(player.formation.slots)) {
        if (!realmSlot) continue
        if (realmSlot.isRazed && !isRebuilder) continue
        if (!realmSlot.isRazed && realmSlot.holdings.length > 0) continue
        if (!worldCompatible(card.card, realmSlot.realm.card)) continue
        moves.push({ type: "SPOIL_PLAY", slot: slot as FormationSlot })
      }
    }
  } else if (typeId === CardTypeId.Artifact) {
    if (isUniqueInPlay(card.card, state)) {
      for (const entry of player.pool) {
        const alreadyHasArtifact = entry.attachments.some((a) => a.card.typeId === CardTypeId.Artifact)
        if (alreadyHasArtifact) continue
        if (!worldCompatible(card.card, entry.champion.card)) continue
        moves.push({ type: "SPOIL_PLAY", championId: entry.champion.instanceId })
      }
    }
  } else if (typeId === CardTypeId.MagicalItem) {
    for (const entry of player.pool) {
      moves.push({ type: "SPOIL_PLAY", championId: entry.champion.instanceId })
    }
  } else if (typeId === CardTypeId.Event) {
    moves.push({ type: "SPOIL_PLAY" })
  }
  // Other types (ally, spell, rule, etc.) — no SPOIL_PLAY, must keep or return

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
  moves.push(...getManualToolMoves(state, playerId))

  const maxEnd = getMaxHandSize(state, playerId)
  if (player.hand.length <= maxEnd) {
    moves.push({ type: "END_TURN" })
  }

  return moves
}

/** Discard moves — hand, pool (champions + attachments), and razed realms */
function getDiscardMoves(player: PlayerState): Move[] {
  const moves: Move[] = []

  for (const card of player.hand) {
    moves.push({ type: "DISCARD_CARD" as const, cardInstanceId: card.instanceId })
  }

  for (const entry of player.pool) {
    moves.push({ type: "DISCARD_CARD" as const, cardInstanceId: entry.champion.instanceId })
    for (const att of entry.attachments) {
      moves.push({ type: "DISCARD_CARD" as const, cardInstanceId: att.instanceId })
    }
  }

  for (const [, s] of Object.entries(player.formation.slots)) {
    if (s?.isRazed) {
      moves.push({ type: "DISCARD_CARD" as const, cardInstanceId: s.realm.instanceId })
    }
  }

  return moves
}

// ─── Phase Move Generators ────────────────────────────────────────────────────

function getStartOfTurnMoves(state: GameState, playerId: PlayerId): Move[] {
  const moves: Move[] = [{ type: "PASS" }]
  const player = state.players[playerId]!

  // END_TURN is available from START_OF_TURN (draws cards then ends the turn in one step)
  const maxEnd = getMaxHandSize(state, playerId)
  if (player.hand.length <= maxEnd) {
    moves.push({ type: "END_TURN" })
  }

  moves.push(...getManualToolMoves(state, playerId))

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
  // Forward-phase moves: pool, discard, combat declaration
  moves.push(...getPoolOnlyMoves(state, player))
  moves.push(...getDiscardMoves(player))
  moves.push(...getCombatDeclOnlyMoves(state, playerId))

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

  // Must have at least one unrazed realm to attack
  const hasRealm = Object.values(player.formation.slots).some((s) => s && !s.isRazed)
  if (!hasRealm) return moves

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
        moves.push({
          type: "DECLARE_ATTACK",
          championId: champ.instanceId,
          targetRealmSlot: slot as FormationSlot,
          targetPlayerId: otherPlayerId,
        })
      }
      for (const card of handChampions) {
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
  const player = state.players[playerId]!

  let moves: Move[]
  switch (combat.roundPhase) {
    case "AWAITING_ATTACKER":
      moves = getAttackerContinueMoves(state, playerId, combat)
      break
    case "AWAITING_DEFENDER":
      moves = getDefenderMoves(state, playerId, combat)
      break
    case "CARD_PLAY":
      moves = getCardPlayMoves(state, playerId, combat)
      break
    default:
      moves = []
  }

  // All players can always discard during combat
  moves.push(...getDiscardMoves(player))
  return moves
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

  // Own pool: unused champions go to main buttons, used ones are also legal (UI puts them in More Actions)
  for (const entry of player.pool) {
    moves.push({ type: "CONTINUE_ATTACK", championId: entry.champion.instanceId })
  }

  for (const card of player.hand) {
    if (!isChampionType(card.card.typeId)) continue
    if (!isUniqueInPlay(card.card, state)) continue
    moves.push({ type: "CONTINUE_ATTACK", championId: card.instanceId })
  }

  // Cross-player: opponent's pool champions
  for (const [otherPid, otherPlayer] of Object.entries(state.players)) {
    if (otherPid === playerId) continue
    for (const entry of otherPlayer.pool) {
      moves.push({
        type: "CONTINUE_ATTACK",
        championId: entry.champion.instanceId,
        fromPlayerId: otherPid,
      })
    }
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

  // Defend with pool champion (used ones also legal — UI puts them in More Actions)
  for (const entry of player.pool) {
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
  if (targetSlot && !targetSlot.isRazed && targetSlot.realm.card.level != null) {
    moves.push({ type: "DECLARE_DEFENSE", championId: targetSlot.realm.instanceId })
  }

  // Cross-player: opponent's pool champions
  for (const [otherPid, otherPlayer] of Object.entries(state.players)) {
    if (otherPid === playerId) continue
    for (const entry of otherPlayer.pool) {
      moves.push({
        type: "DECLARE_DEFENSE",
        championId: entry.champion.instanceId,
        fromPlayerId: otherPid,
      })
    }
  }

  return moves
}

function getCardPlayMoves(state: GameState, playerId: PlayerId, combat: CombatState): Move[] {
  const isAttacker = playerId === combat.attackingPlayer
  const isDefender = playerId === combat.defendingPlayer
  if (!isAttacker && !isDefender) return []

  const moves: Move[] = []

  const player = state.players[playerId]!
  const combatRealmSlot =
    state.players[combat.defendingPlayer]!.formation.slots[combat.targetRealmSlot]

  // Both players can play combat-legal support cards (trust players to follow rules)
  const activeChampion = isAttacker ? combat.attacker : combat.defender

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

  const myCombatCards = isAttacker ? combat.attackerCards : combat.defenderCards
  for (const card of player.hand) {
    if (!isUniqueInPlay(card.card, state)) continue
    if (canPlayInCombat(card, activeChampion, spellContext, myCombatCards)) {
      moves.push({ type: "PLAY_COMBAT_CARD", cardInstanceId: card.instanceId })
    }
  }
  moves.push({ type: "STOP_PLAYING" })
  // Both players may play events during card play
  moves.push(...getEventMoves(player))
  moves.push(...getHoldingRevealMoves(player))

  // Either participant may interrupt (no winner, champions return intact)
  if (isAttacker || isDefender) {
    moves.push({ type: "INTERRUPT_COMBAT" })
  }

  // Either combat participant may set level, switch or discard card sides during CARD_PLAY
  const { attackerLevel, defenderLevel } = getCombatLevels(state, combat)
  if (isAttacker || isDefender) {
    moves.push({
      type: "SET_COMBAT_LEVEL",
      playerId,
      level: isAttacker ? attackerLevel : defenderLevel,
    })
    // Switch sides available for all combat cards; discard only for own cards
    for (const card of combat.attackerCards) {
      moves.push({ type: "SWITCH_COMBAT_SIDE", cardInstanceId: card.instanceId })
      if (card.card.typeId === CardTypeId.Ally) {
        moves.push({ type: "RETURN_COMBAT_CARD_TO_HAND", cardInstanceId: card.instanceId })
      }
      if (isAttacker) moves.push({ type: "DISCARD_CARD", cardInstanceId: card.instanceId })
    }
    for (const card of combat.defenderCards) {
      moves.push({ type: "SWITCH_COMBAT_SIDE", cardInstanceId: card.instanceId })
      if (card.card.typeId === CardTypeId.Ally) {
        moves.push({ type: "RETURN_COMBAT_CARD_TO_HAND", cardInstanceId: card.instanceId })
      }
      if (isDefender) moves.push({ type: "DISCARD_CARD", cardInstanceId: card.instanceId })
    }
    // Return main champion to pool — either participant can trigger this on either champion
    if (combat.attacker) {
      moves.push({ type: "RETURN_COMBAT_CARD_TO_POOL", cardInstanceId: combat.attacker.instanceId })
    }
    if (combat.defender) {
      moves.push({ type: "RETURN_COMBAT_CARD_TO_POOL", cardInstanceId: combat.defender.instanceId })
    }
    // SWAP_COMBAT_CHAMPION — only for your own side
    {
      const mySide = isAttacker ? "attacker" : "defender"
      for (const dest of ["pool", "discard", "abyss", "hand"] as const) {
        // New champion candidates from all players' pools
        for (const [, p] of Object.entries(state.players)) {
          for (const entry of p.pool) {
            const isCurrent =
              entry.champion.instanceId === combat.attacker?.instanceId ||
              entry.champion.instanceId === combat.defender?.instanceId
            if (isCurrent) continue
            moves.push({
              type: "SWAP_COMBAT_CHAMPION",
              side: mySide,
              newChampionId: entry.champion.instanceId,
              newChampionSource: "pool",
              oldChampionDestination: dest,
            })
          }
        }
        // From hand (champion types only)
        for (const [, p] of Object.entries(state.players)) {
          for (const card of p.hand) {
            if (!isChampionType(card.card.typeId)) continue
            moves.push({
              type: "SWAP_COMBAT_CHAMPION",
              side: mySide,
              newChampionId: card.instanceId,
              newChampionSource: "hand",
              oldChampionDestination: dest,
            })
          }
        }
        // From discard (champion types only)
        for (const [, p] of Object.entries(state.players)) {
          for (const card of p.discardPile) {
            if (!isChampionType(card.card.typeId)) continue
            moves.push({
              type: "SWAP_COMBAT_CHAMPION",
              side: mySide,
              newChampionId: card.instanceId,
              newChampionSource: "discard",
              oldChampionDestination: dest,
            })
          }
        }
      }
    }

    // REQUIRE_NEW_CHAMPION — only when that side has no champion
    if (combat.attacker === null) {
      moves.push({ type: "REQUIRE_NEW_CHAMPION", side: "attacker" })
    }
    if (combat.defender === null) {
      moves.push({ type: "REQUIRE_NEW_CHAMPION", side: "defender" })
    }

    // Pool attachments on active champions — switch for both, discard own only
    if (combat.attacker) {
      for (const card of getPoolAttachments(
        state,
        combat.attackingPlayer,
        combat.attacker.instanceId,
      )) {
        moves.push({ type: "SWITCH_COMBAT_SIDE", cardInstanceId: card.instanceId })
        if (isAttacker) moves.push({ type: "DISCARD_CARD", cardInstanceId: card.instanceId })
      }
    }
    if (combat.defender) {
      for (const card of getPoolAttachments(
        state,
        combat.defendingPlayer,
        combat.defender.instanceId,
      )) {
        moves.push({ type: "SWITCH_COMBAT_SIDE", cardInstanceId: card.instanceId })
        if (isDefender) moves.push({ type: "DISCARD_CARD", cardInstanceId: card.instanceId })
      }
    }
  }

  return moves
}

function getPhaseFiveMoves(state: GameState, playerId: PlayerId): Move[] {
  const player = state.players[playerId]!
  const maxEnd = getMaxHandSize(state, playerId)

  const moves: Move[] = []

  // Must discard to meet hand limit before ending turn; voluntary discard is always allowed
  moves.push(...getDiscardMoves(player))

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
  moves.push(...getManualToolMoves(state, playerId))

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
  combatCards: CardInstance[] = [],
): boolean {
  const { typeId } = card.card
  if (!COMBAT_SUPPORT_TYPE_IDS.has(typeId)) return false

  // Allies and magical items can always be played (no spell access check)
  if (typeId === CardTypeId.Ally || typeId === CardTypeId.MagicalItem) return true

  // Artifacts: world-compatible with active champion, max 1 per champion
  if (typeId === CardTypeId.Artifact) {
    if (!activeChampion) return false
    if (!worldCompatible(card.card, activeChampion.card)) return false
    const hasArtifact =
      (context.attachments ?? []).some((a) => a.typeId === CardTypeId.Artifact) ||
      combatCards.some((c) => c.card.typeId === CardTypeId.Artifact)
    return !hasArtifact
  }

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
