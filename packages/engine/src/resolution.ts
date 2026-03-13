import type {
  GameState,
  GameEvent,
  Move,
  PlayerId,
  CardInstanceId,
  CardInstance,
  FormationSlot,
  ZoneDestination,
  LimboEntry,
  ResolutionContext,
} from "./types.ts"
import { updatePlayer, takeCards, isChampionType } from "./utils.ts"
import { EngineError } from "./errors.ts"

// ─── Guards ───────────────────────────────────────────────────────────────────

function assertResolution(state: GameState): void {
  if (!state.resolutionContext) {
    throw new EngineError("NO_RESOLUTION", "Not in resolution mode")
  }
}

// ─── Card Finder ──────────────────────────────────────────────────────────────

interface CardLocation {
  card: CardInstance
  playerId: PlayerId
  zone: string
}

/** Searches every zone of every player for a card by instanceId. */
function findCard(state: GameState, cardInstanceId: CardInstanceId): CardLocation | null {
  for (const [playerId, player] of Object.entries(state.players)) {
    const inHand = player.hand.find((c) => c.instanceId === cardInstanceId)
    if (inHand) return { card: inHand, playerId, zone: "hand" }

    const inDiscard = player.discardPile.find((c) => c.instanceId === cardInstanceId)
    if (inDiscard) return { card: inDiscard, playerId, zone: "discard" }

    const inAbyss = player.abyss.find((c) => c.instanceId === cardInstanceId)
    if (inAbyss) return { card: inAbyss, playerId, zone: "abyss" }

    for (const entry of player.pool) {
      if (entry.champion.instanceId === cardInstanceId) {
        return { card: entry.champion, playerId, zone: "pool_champion" }
      }
      const att = entry.attachments.find((c) => c.instanceId === cardInstanceId)
      if (att) return { card: att, playerId, zone: "pool_attachment" }
    }

    for (const [slot, realmSlot] of Object.entries(player.formation.slots)) {
      if (!realmSlot) continue
      const h = realmSlot.holdings.find((c) => c.instanceId === cardInstanceId)
      if (h) return { card: h, playerId, zone: `holding_${slot}` }
    }

    for (const entry of player.limbo) {
      if (entry.champion.instanceId === cardInstanceId) {
        return { card: entry.champion, playerId, zone: "limbo" }
      }
    }

    const inLasting = player.lastingEffects.find((c) => c.instanceId === cardInstanceId)
    if (inLasting) return { card: inLasting, playerId, zone: "lasting_effects" }
  }
  return null
}

/** Remove a card from its found zone, returning the updated state. */
function removeFromLocation(
  state: GameState,
  cardInstanceId: CardInstanceId,
  loc: CardLocation,
): GameState {
  const { playerId, zone } = loc
  const player = state.players[playerId]!

  if (zone === "hand") {
    return updatePlayer(state, playerId, {
      hand: player.hand.filter((c) => c.instanceId !== cardInstanceId),
    })
  }
  if (zone === "discard") {
    return updatePlayer(state, playerId, {
      discardPile: player.discardPile.filter((c) => c.instanceId !== cardInstanceId),
    })
  }
  if (zone === "abyss") {
    return updatePlayer(state, playerId, {
      abyss: player.abyss.filter((c) => c.instanceId !== cardInstanceId),
    })
  }
  if (zone === "pool_champion") {
    return updatePlayer(state, playerId, {
      pool: player.pool.filter((e) => e.champion.instanceId !== cardInstanceId),
    })
  }
  if (zone === "pool_attachment") {
    return updatePlayer(state, playerId, {
      pool: player.pool.map((e) => ({
        ...e,
        attachments: e.attachments.filter((a) => a.instanceId !== cardInstanceId),
      })),
    })
  }
  if (zone.startsWith("holding_")) {
    const slot = zone.slice("holding_".length) as FormationSlot
    const realmSlot = player.formation.slots[slot]
    if (!realmSlot) return state
    return updatePlayer(state, playerId, {
      formation: {
        ...player.formation,
        slots: {
          ...player.formation.slots,
          [slot]: {
            ...realmSlot,
            holdings: realmSlot.holdings.filter((c) => c.instanceId !== cardInstanceId),
          },
        },
      },
    })
  }
  if (zone === "limbo") {
    return updatePlayer(state, playerId, {
      limbo: player.limbo.filter((e) => e.champion.instanceId !== cardInstanceId),
    })
  }
  if (zone === "lasting_effects") {
    return updatePlayer(state, playerId, {
      lastingEffects: player.lastingEffects.filter((c) => c.instanceId !== cardInstanceId),
    })
  }
  return state
}

/** Place a card in the given zone destination. */
function placeInDestination(
  state: GameState,
  card: CardInstance,
  destination: ZoneDestination,
): GameState {
  const { playerId } = destination
  const player = state.players[playerId]!

  switch (destination.zone) {
    case "discard":
      return updatePlayer(state, playerId, { discardPile: [...player.discardPile, card] })
    case "abyss":
    case "void":
      return updatePlayer(state, playerId, { abyss: [...player.abyss, card] })
    case "hand":
      return updatePlayer(state, playerId, { hand: [...player.hand, card] })
    case "limbo": {
      const entry: LimboEntry = {
        champion: card,
        attachments: [],
        returnsOnTurn: destination.returnsOnTurn,
      }
      return updatePlayer(state, playerId, { limbo: [...player.limbo, entry] })
    }
    case "lasting_effects":
      return updatePlayer(state, playerId, {
        lastingEffects: [...player.lastingEffects, card],
      })
    case "pool":
      return updatePlayer(state, playerId, {
        pool: [...player.pool, { champion: card, attachments: [] }],
      })
    default:
      return state
  }
}

// ─── Zero-realm condition ─────────────────────────────────────────────────────

/** If all realms are razed, clear the pool. Mirrors the same logic in engine.ts. */
function checkZeroRealm(state: GameState, events: GameEvent[]): GameState {
  let s = state
  for (const [playerId, player] of Object.entries(state.players)) {
    const hasAnyRealm = Object.values(player.formation.slots).some((slot) => slot !== undefined)
    if (!hasAnyRealm) continue
    const hasUnrazed = Object.values(player.formation.slots).some((slot) => slot && !slot.isRazed)
    if (hasUnrazed) continue
    if (player.pool.length === 0) continue

    const discarded = player.pool.flatMap((e) => [e.champion, ...e.attachments])
    events.push({ type: "POOL_CLEARED", playerId })
    s = updatePlayer(s, playerId, {
      pool: [],
      discardPile: [...s.players[playerId]!.discardPile, ...discarded],
    })
  }
  return s
}

// ─── Resolution Handlers ──────────────────────────────────────────────────────

export function handleResolveMoveCard(
  state: GameState,
  _playerId: PlayerId,
  move: Extract<Move, { type: "RESOLVE_MOVE_CARD" }>,
  events: GameEvent[],
): GameState {
  assertResolution(state)

  const loc = findCard(state, move.cardInstanceId)
  if (!loc) {
    throw new EngineError("CARD_NOT_FOUND", `Card ${move.cardInstanceId} not found in any zone`)
  }

  let s = removeFromLocation(state, move.cardInstanceId, loc)
  s = placeInDestination(s, loc.card, move.destination)

  events.push({
    type: "CARD_ZONE_MOVED",
    playerId: loc.playerId,
    instanceId: move.cardInstanceId,
    cardName: loc.card.card.name,
    fromZone: loc.zone,
    toZone: move.destination.zone,
  })

  return s
}

export function handleResolveAttachCard(
  state: GameState,
  _playerId: PlayerId,
  move: Extract<Move, { type: "RESOLVE_ATTACH_CARD" }>,
  events: GameEvent[],
): GameState {
  assertResolution(state)

  const loc = findCard(state, move.cardInstanceId)
  if (!loc) {
    throw new EngineError("CARD_NOT_FOUND", `Card ${move.cardInstanceId} not found in any zone`)
  }

  let s = removeFromLocation(state, move.cardInstanceId, loc)

  // Find target champion in any pool
  for (const [ownerId, player] of Object.entries(s.players)) {
    const poolIdx = player.pool.findIndex((e) => e.champion.instanceId === move.targetInstanceId)
    if (poolIdx !== -1) {
      const entry = player.pool[poolIdx]!
      const newPool = [...player.pool]
      newPool[poolIdx] = { ...entry, attachments: [...entry.attachments, loc.card] }
      events.push({
        type: "ITEM_ATTACHED",
        playerId: ownerId,
        itemId: loc.card.instanceId,
        championId: move.targetInstanceId,
      })
      return updatePlayer(s, ownerId, { pool: newPool })
    }
  }

  throw new EngineError("CHAMPION_NOT_FOUND", "Target champion not found in any pool")
}

export function handleResolveRazeRealm(
  state: GameState,
  _playerId: PlayerId,
  move: Extract<Move, { type: "RESOLVE_RAZE_REALM" }>,
  events: GameEvent[],
): GameState {
  assertResolution(state)

  const player = state.players[move.playerId]
  if (!player) throw new EngineError("INVALID_PLAYER")

  const realmSlot = player.formation.slots[move.slot]
  if (!realmSlot || realmSlot.isRazed) {
    throw new EngineError("NOT_RAZEABLE", `Slot ${move.slot} is not an unrazed realm`)
  }

  events.push({
    type: "REALM_RAZED",
    playerId: move.playerId,
    slot: move.slot,
    realmName: realmSlot.realm.card.name,
  })

  const newSlot = { ...realmSlot, isRazed: true, holdings: [] }
  let s = updatePlayer(state, move.playerId, {
    discardPile: [...player.discardPile, ...realmSlot.holdings],
    formation: {
      ...player.formation,
      slots: { ...player.formation.slots, [move.slot]: newSlot },
    },
  })

  s = checkZeroRealm(s, events)
  return s
}

export function handleResolveRebuildRealm(
  state: GameState,
  _playerId: PlayerId,
  move: Extract<Move, { type: "RESOLVE_REBUILD_REALM" }>,
  events: GameEvent[],
): GameState {
  assertResolution(state)

  const player = state.players[move.playerId]
  if (!player) throw new EngineError("INVALID_PLAYER")

  const realmSlot = player.formation.slots[move.slot]
  if (!realmSlot || !realmSlot.isRazed) {
    throw new EngineError("NOT_RAZED", `Slot ${move.slot} is not a razed realm`)
  }

  events.push({
    type: "REALM_REBUILT",
    playerId: move.playerId,
    slot: move.slot,
    realmName: realmSlot.realm.card.name,
    discardedIds: [],
  })

  return updatePlayer(state, move.playerId, {
    formation: {
      ...player.formation,
      slots: { ...player.formation.slots, [move.slot]: { ...realmSlot, isRazed: false } },
    },
  })
}

export function handleResolveDrawCards(
  state: GameState,
  _playerId: PlayerId,
  move: Extract<Move, { type: "RESOLVE_DRAW_CARDS" }>,
  events: GameEvent[],
): GameState {
  assertResolution(state)

  const player = state.players[move.playerId]
  if (!player) throw new EngineError("INVALID_PLAYER")
  if (move.count < 1) throw new EngineError("INVALID_COUNT", "Must draw at least 1 card")

  const [drawn, remaining] = takeCards(player.drawPile, move.count)
  events.push({ type: "CARDS_DRAWN", playerId: move.playerId, count: drawn.length })

  return updatePlayer(state, move.playerId, {
    hand: [...player.hand, ...drawn],
    drawPile: remaining,
  })
}

export function handleResolveReturnToPool(
  state: GameState,
  _playerId: PlayerId,
  move: Extract<Move, { type: "RESOLVE_RETURN_TO_POOL" }>,
  events: GameEvent[],
): GameState {
  assertResolution(state)

  for (const [ownerId, player] of Object.entries(state.players)) {
    const card = player.discardPile.find((c) => c.instanceId === move.cardInstanceId)
    if (card) {
      if (!isChampionType(card.card.typeId)) {
        throw new EngineError("NOT_A_CHAMPION", "Only champions can return to pool")
      }
      events.push({
        type: "CHAMPION_RETURNED_TO_POOL",
        playerId: ownerId,
        instanceId: card.instanceId,
        cardName: card.card.name,
      })
      return updatePlayer(state, ownerId, {
        discardPile: player.discardPile.filter((c) => c.instanceId !== move.cardInstanceId),
        pool: [...player.pool, { champion: card, attachments: [] }],
      })
    }
  }

  throw new EngineError("CARD_NOT_FOUND", "Champion not found in any discard pile")
}

export function handleResolveSetCardDestination(
  state: GameState,
  _playerId: PlayerId,
  move: Extract<Move, { type: "RESOLVE_SET_CARD_DESTINATION" }>,
  _events: GameEvent[],
): GameState {
  assertResolution(state)

  return {
    ...state,
    resolutionContext: {
      ...state.resolutionContext!,
      cardDestination: move.destination,
      ...(move.attachTarget !== undefined ? { attachTarget: move.attachTarget } : {}),
    },
  }
}

export function handleResolveDone(
  state: GameState,
  _playerId: PlayerId,
  events: GameEvent[],
): GameState {
  assertResolution(state)

  const ctx = state.resolutionContext!
  const { pendingCard, cardDestination, resolvingPlayer, attachTarget } = ctx

  let s: GameState = { ...state, resolutionContext: null }
  const player = s.players[resolvingPlayer]!

  switch (cardDestination) {
    case "discard":
      s = updatePlayer(s, resolvingPlayer, { discardPile: [...player.discardPile, pendingCard] })
      break

    case "abyss":
    case "void":
      s = updatePlayer(s, resolvingPlayer, { abyss: [...player.abyss, pendingCard] })
      break

    case "in_play": {
      if (attachTarget?.zone === "pool" && attachTarget.targetInstanceId) {
        const owner = attachTarget.owner
        const ownerPlayer = s.players[owner]!
        const poolIdx = ownerPlayer.pool.findIndex(
          (e) => e.champion.instanceId === attachTarget.targetInstanceId,
        )
        if (poolIdx !== -1) {
          const entry = ownerPlayer.pool[poolIdx]!
          const newPool = [...ownerPlayer.pool]
          newPool[poolIdx] = { ...entry, attachments: [...entry.attachments, pendingCard] }
          events.push({
            type: "ITEM_ATTACHED",
            playerId: owner,
            itemId: pendingCard.instanceId,
            championId: attachTarget.targetInstanceId,
          })
          s = updatePlayer(s, owner, { pool: newPool })
          break
        }
      }
      // Fallback / no attachTarget: keep in lasting effects zone
      s = updatePlayer(s, resolvingPlayer, {
        lastingEffects: [...player.lastingEffects, pendingCard],
      })
      break
    }

    default:
      s = updatePlayer(s, resolvingPlayer, { discardPile: [...player.discardPile, pendingCard] })
  }

  events.push({
    type: "RESOLUTION_COMPLETED",
    playerId: resolvingPlayer,
    cardInstanceId: pendingCard.instanceId,
    destination: cardDestination,
  })

  return s
}

// ─── Resolution context opener ────────────────────────────────────────────────

/**
 * Opens a resolution context after a card is played.
 * The card is removed from hand by the caller; its instance is stored here.
 */
export function openResolutionContext(
  state: GameState,
  playerId: PlayerId,
  pendingCard: CardInstance,
  defaultDestination: ResolutionContext["cardDestination"],
  events: GameEvent[],
): GameState {
  events.push({
    type: "RESOLUTION_STARTED",
    playerId,
    cardInstanceId: pendingCard.instanceId,
    cardName: pendingCard.card.name,
  })

  return {
    ...state,
    resolutionContext: {
      cardInstanceId: pendingCard.instanceId,
      pendingCard,
      initiatingPlayer: playerId,
      resolvingPlayer: playerId,
      cardDestination: defaultDestination,
    },
  }
}
