import type {
  GameState, Move, PlayerId, FormationSlot,
  CardInstance, CardData, PoolEntry, PlayerState,
  CombatState, Formation,
} from "./types.ts"
import { Phase } from "./types.ts"
import {
  CardTypeId, COSMOS_TYPE_IDS,
  HAND_SIZES, COMBAT_SUPPORT_TYPE_IDS, PROTECTED_BY,
} from "./constants.ts"
import { isChampionType, isSpellType } from "./utils.ts"
import { calculateCombatLevel, hasWorldMatch, getLosingPlayer } from "./combat.ts"

/**
 * Returns all legal moves for the given player in the current state.
 * Called after every applyMove to populate EngineResult.legalMoves.
 */
export function getLegalMoves(state: GameState, playerId: PlayerId): Move[] {
  if (state.winner !== null) return []

  const player = state.players[playerId]
  if (!player) return []

  // If effects are pending, only the triggering player may act (to resolve them)
  if (state.pendingEffects.length > 0) {
    return getPendingEffectMoves(state, playerId)
  }

  // During active combat, use combat-specific move set
  if (state.combatState) {
    return getCombatMoves(state, playerId)
  }

  // Out-of-combat: only the active player may act
  if (state.activePlayer !== playerId) return []

  switch (state.phase) {
    case Phase.StartOfTurn: return getStartOfTurnMoves(state, playerId)
    case Phase.Draw:        return []  // auto-draw, no player choice
    case Phase.PlayRealm:   return getPlayRealmMoves(state, playerId)
    case Phase.Pool:        return getPoolMoves(state, playerId)
    case Phase.Combat:      return getCombatDeclarationMoves(state, playerId)
    case Phase.PhaseFive:   return getPhaseFiveMoves(state, playerId)
    case Phase.EndTurn:     return []
    default:                return []
  }
}

// ─── Phase Move Generators ────────────────────────────────────────────────────

function getStartOfTurnMoves(state: GameState, playerId: PlayerId): Move[] {
  const moves: Move[] = [{ type: "PASS" }]
  const player = state.players[playerId]!

  for (const card of player.hand) {
    if (card.card.typeId === CardTypeId.Rule) {
      moves.push({ type: "PLAY_RULE_CARD", cardInstanceId: card.instanceId })
    }
  }
  moves.push(...getEventMoves(player))

  return moves
}

function getPlayRealmMoves(state: GameState, playerId: PlayerId): Move[] {
  const moves: Move[] = [{ type: "PASS" }]
  const player = state.players[playerId]!
  const legalSlots = getLegalRealmSlots(player.formation)

  // Phase 2 allows exactly ONE of: play realm, replace razed realm, rebuild realm, OR play a holding.
  if (!state.hasPlayedRealmThisTurn) {
    for (const card of player.hand) {
      if (card.card.typeId === CardTypeId.Realm) {
        if (!isUniqueInPlay(card.card, state)) continue
        // Empty slots following pyramid order
        for (const slot of legalSlots) {
          if (!player.formation.slots[slot]) {
            moves.push({ type: "PLAY_REALM", cardInstanceId: card.instanceId, slot })
          }
        }
        // Razed slots — new realm replaces (discards) the razed one
        for (const [slot, realmSlot] of Object.entries(player.formation.slots)) {
          if (realmSlot?.isRazed) {
            moves.push({ type: "PLAY_REALM", cardInstanceId: card.instanceId, slot: slot as FormationSlot })
          }
        }
      }
    }

    // Rebuild a razed realm (costs 3 hand cards) — also counts as the realm action
    if (player.hand.length >= 3) {
      for (const [slot, realmSlot] of Object.entries(player.formation.slots)) {
        if (realmSlot?.isRazed) {
          moves.push({ type: "REBUILD_REALM", slot: slot as FormationSlot })
        }
      }
    }

    // Attach a holding to a same-world unrazed realm (mutually exclusive with realm plays)
    for (const card of player.hand) {
      if (card.card.typeId === CardTypeId.Holding) {
        if (!isUniqueInPlay(card.card, state)) continue
        for (const [slot, realmSlot] of Object.entries(player.formation.slots)) {
          if (!realmSlot || realmSlot.isRazed) continue
          if (realmSlot.holdings.length > 0) continue  // already has a holding
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

  moves.push(...getEventMoves(player))
  return moves
}

function getPoolMoves(state: GameState, playerId: PlayerId): Move[] {
  const moves: Move[] = [{ type: "PASS" }]
  const player = state.players[playerId]!

  // Place a champion from hand into pool — requires at least one unrazed realm
  const hasUnrazedRealm = Object.values(player.formation.slots).some(
    slot => slot && !slot.isRazed,
  )
  if (hasUnrazedRealm) {
    for (const card of player.hand) {
      if (isChampionType(card.card.typeId)) {
        if (!isUniqueInPlay(card.card, state)) continue
        moves.push({ type: "PLACE_CHAMPION", cardInstanceId: card.instanceId })
      }
    }
  }

  // Attach an artifact to a pool champion (one per champion, same world)
  for (const card of player.hand) {
    if (card.card.typeId === CardTypeId.Artifact) {
      if (!isUniqueInPlay(card.card, state)) continue
      for (const entry of player.pool) {
        const alreadyHasArtifact = entry.attachments.some(
          a => a.card.typeId === CardTypeId.Artifact,
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

  // Attach a magical item to any pool champion (no world restriction, any number)
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

  // Play phase-3 spell/ability if a qualifying champion is in pool
  if (player.pool.length > 0) {
    for (const card of player.hand) {
      if (isPhase3Card(card.card.typeId)) {
        if (poolHasChampionFor(player.pool, card, "o")) {
          moves.push({ type: "PLAY_PHASE3_CARD", cardInstanceId: card.instanceId })
        }
      }
    }
  }
  moves.push(...getEventMoves(player))

  return moves
}

function getCombatDeclarationMoves(state: GameState, playerId: PlayerId): Move[] {
  const moves: Move[] = [{ type: "PASS" }]
  const player = state.players[playerId]!

  // No combat in round 1 — every player must have taken at least one turn first
  const isRoundOne = state.currentTurn <= state.playerOrder.length

  if (!isRoundOne && !state.hasAttackedThisTurn && player.pool.length > 0) {
    for (const entry of player.pool) {
      for (const [otherPlayerId, otherPlayer] of Object.entries(state.players)) {
        if (otherPlayerId === playerId) continue

        for (const [slot, realmSlot] of Object.entries(otherPlayer.formation.slots)) {
          if (!realmSlot || realmSlot.isRazed) continue
          if (!isAttackable(otherPlayer.formation, slot as FormationSlot, entry.champion)) continue
          moves.push({
            type: "DECLARE_ATTACK",
            championId: entry.champion.instanceId,
            targetRealmSlot: slot as FormationSlot,
            targetPlayerId: otherPlayerId,
          })
        }
      }
    }
  }
  moves.push(...getEventMoves(player))

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
  if (playerId !== combat.attackingPlayer) return []

  const moves: Move[] = [{ type: "END_ATTACK" }]
  const player = state.players[playerId]!

  for (const entry of player.pool) {
    if (combat.championsUsedThisBattle.includes(entry.champion.instanceId)) continue
    moves.push({ type: "CONTINUE_ATTACK", championId: entry.champion.instanceId })
  }

  return moves
}

function getDefenderMoves(
  state: GameState,
  playerId: PlayerId,
  combat: CombatState,
): Move[] {
  if (playerId !== combat.defendingPlayer) return []

  const moves: Move[] = [{ type: "DECLINE_DEFENSE" }]
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

  return moves
}

function getCardPlayMoves(
  state: GameState,
  playerId: PlayerId,
  combat: CombatState,
): Move[] {
  // Determine who is losing to know who may play freely
  const isAttacker = playerId === combat.attackingPlayer
  const isDefender = playerId === combat.defendingPlayer
  if (!isAttacker && !isDefender) return []

  const targetRealmSlot = state.players[combat.defendingPlayer]!
    .formation.slots[combat.targetRealmSlot]
  const realmWorldId = targetRealmSlot?.realm.card.worldId ?? 0

  const attackerLevel = combat.attacker
    ? calculateCombatLevel(
        combat.attacker,
        combat.attackerCards,
        hasWorldMatch(combat.attacker, realmWorldId),
        combat.effectSpecs,
        "offensive",
      )
    : 0

  const defenderLevel = combat.defender
    ? calculateCombatLevel(
        combat.defender,
        combat.defenderCards,
        hasWorldMatch(combat.defender, realmWorldId),
        combat.effectSpecs,
        "defensive",
      )
    : 0

  const losingPlayer = getLosingPlayer(attackerLevel, defenderLevel, combat)
  const isLosing = playerId === losingPlayer

  const moves: Move[] = []

  const player = state.players[playerId]!

  if (isLosing) {
    // Losing player can play any combat-legal support card
    const activeSide = isAttacker ? "offensive" : "defensive"
    const activeChampion = isAttacker ? combat.attacker : combat.defender

    for (const card of player.hand) {
      if (canPlayInCombat(card, activeChampion, activeSide)) {
        moves.push({ type: "PLAY_COMBAT_CARD", cardInstanceId: card.instanceId })
      }
    }
    moves.push({ type: "STOP_PLAYING" })
  } else {
    // Winning player may play events
    moves.push(...getEventMoves(player))
  }

  return moves
}

function getPhaseFiveMoves(state: GameState, playerId: PlayerId): Move[] {
  const player = state.players[playerId]!
  const { maxEnd } = HAND_SIZES[state.deckSize]!

  // Must discard to meet hand limit before PASSing
  if (player.hand.length > maxEnd) {
    return player.hand.map(card => ({
      type: "DISCARD_CARD" as const,
      cardInstanceId: card.instanceId,
    }))
  }

  const moves: Move[] = [{ type: "PASS" }]

  for (const card of player.hand) {
    if (card.card.typeId === CardTypeId.Event) {
      moves.push({ type: "PLAY_PHASE5_CARD", cardInstanceId: card.instanceId })
    }
  }

  return moves
}

/**
 * Generates resolution moves for the first pending effect.
 * Only the triggering player gets moves; the opponent sees an empty list (they wait).
 */
function getPendingEffectMoves(state: GameState, playerId: PlayerId): Move[] {
  const effect = state.pendingEffects[0]
  if (!effect) return []

  // Non-triggering player has no moves — they wait
  if (effect.triggeringPlayerId !== playerId) return []

  // SKIP_EFFECT is always available
  const moves: Move[] = [{ type: "SKIP_EFFECT" }]

  if (effect.targetScope === "none") return moves

  // Generate RESOLVE_EFFECT moves for each valid target based on scope
  const combat = state.combatState
  if (!combat) return moves  // no combat targets without active combat

  if (effect.targetScope === "opposing_combat_cards" || effect.targetScope === "any_combat_card") {
    const opposing = playerId === combat.attackingPlayer
      ? combat.defenderCards
      : combat.attackerCards
    for (const card of opposing) {
      moves.push({ type: "RESOLVE_EFFECT", targetId: card.instanceId })
    }
  }

  if (effect.targetScope === "own_combat_cards" || effect.targetScope === "any_combat_card") {
    const own = playerId === combat.attackingPlayer
      ? combat.attackerCards
      : combat.defenderCards
    for (const card of own) {
      moves.push({ type: "RESOLVE_EFFECT", targetId: card.instanceId })
    }
  }

  return moves
}

// ─── Formation Helpers ────────────────────────────────────────────────────────

/**
 * Returns the set of formation slots a realm can legally be placed into.
 * Enforces the pyramid placement order: A → B/C → D/E/F.
 */
export function getLegalRealmSlots(formation: Formation): FormationSlot[] {
  const { slots } = formation

  if (!slots["A"]) return ["A"]  // A must be placed first

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
  if (isFlyer) return true  // Flyers can attack any realm

  const isSwimmer = champion.card.attributes.includes("Swimmer")
  const targetRealm = formation.slots[slot]?.realm
  const isCoastal = targetRealm?.card.attributes.includes("Coast") ?? false
  if (isSwimmer && isCoastal) return true  // Swimmers attack any coastal realm

  // Standard protection: all protecting slots must be razed or empty
  const protectors = PROTECTED_BY[slot] ?? []
  return protectors.every(p => {
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
    if (player.pool.some(e => nameAndTypeMatch(e.champion.card, card))) return false
    // Pool attachments (artifacts)
    for (const e of player.pool) {
      if (e.attachments.some(a => nameAndTypeMatch(a.card, card))) return false
    }
    // Formation (including razed realms)
    for (const realmSlot of Object.values(player.formation.slots)) {
      if (!realmSlot) continue
      if (nameAndTypeMatch(realmSlot.realm.card, card)) return false
      if (realmSlot.holdings.some(h => nameAndTypeMatch(h.card, card))) return false
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
    .filter(c => c.card.typeId === CardTypeId.Event)
    .map(c => ({ type: "PLAY_EVENT" as const, cardInstanceId: c.instanceId }))
}

/** Returns true if the card type is playable in Phase 3 */
function isPhase3Card(typeId: number): boolean {
  return isSpellType(typeId) || typeId === CardTypeId.BloodAbility
}

/**
 * Returns true if at least one pool champion can use the given support card.
 * @param dir - "o" for offensive (phase 3), "d" or "o" for combat
 */
function poolHasChampionFor(
  pool: PoolEntry[],
  card: CardInstance,
  dir: "d" | "o",
): boolean {
  const typeRef = card.card.typeId
  const dirRef = `${dir}${typeRef}`

  return pool.some(entry => {
    const { supportIds } = entry.champion.card
    if (isSpellType(typeRef)) {
      return supportIds.includes(dirRef) || supportIds.includes(typeRef)
    }
    return supportIds.includes(typeRef)
  })
}

/**
 * Returns true if a card can be played during CARD_PLAY phase.
 * The active champion's supportIds determine which spells they can use.
 */
function canPlayInCombat(
  card: CardInstance,
  activeChampion: CardInstance | null,
  side: "offensive" | "defensive",
): boolean {
  const { typeId } = card.card
  if (!COMBAT_SUPPORT_TYPE_IDS.has(typeId)) return false

  // Allies and magical items can always be played (no spell access check)
  if (typeId === CardTypeId.Ally || typeId === CardTypeId.MagicalItem) return true

  // Spells require the champion to have the appropriate direction access
  if (isSpellType(typeId) && activeChampion) {
    const dirRef = `${side === "offensive" ? "o" : "d"}${typeId}`
    const { supportIds } = activeChampion.card
    return supportIds.includes(dirRef) || supportIds.includes(typeId as unknown as string)
  }

  return false
}

/** Returns true if the two cards are world-compatible (one is world-agnostic or same world) */
function worldCompatible(card: CardData, other: CardData): boolean {
  return card.worldId === 0 || other.worldId === 0 || card.worldId === other.worldId
}
