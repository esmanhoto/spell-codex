import type { CardInstance, CardInstanceId, GameState, PlayerId } from "./types.ts"
import { updatePlayer } from "./utils.ts"

export interface ManualRemovedCard {
  card: CardInstance
  newState: GameState
}

/**
 * Removes a card from any mutable zone the owner controls.
 * Used by manual operations to avoid duplicating zone traversal logic.
 */
export function findAndRemoveFromOwnZones(
  state: GameState,
  ownerId: PlayerId,
  cardId: CardInstanceId,
): ManualRemovedCard | null {
  const player = state.players[ownerId]!

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

  const poolEntryIdx = player.pool.findIndex(e => e.champion.instanceId === cardId)
  if (poolEntryIdx !== -1) {
    const entry = player.pool[poolEntryIdx]!
    return {
      card: entry.champion,
      newState: updatePlayer(state, ownerId, {
        pool: player.pool.filter((_, i) => i !== poolEntryIdx),
        discardPile: [...player.discardPile, ...entry.attachments],
      }),
    }
  }

  for (let ei = 0; ei < player.pool.length; ei++) {
    const entry = player.pool[ei]!
    const attIdx = entry.attachments.findIndex(a => a.instanceId === cardId)
    if (attIdx === -1) continue
    const card = entry.attachments[attIdx]!
    const newPool = [...player.pool]
    newPool[ei] = { ...entry, attachments: entry.attachments.filter((_, i) => i !== attIdx) }
    return { card, newState: updatePlayer(state, ownerId, { pool: newPool }) }
  }

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

  for (const [slot, realmSlot] of Object.entries(player.formation.slots)) {
    if (!realmSlot) continue
    const holdingIdx = realmSlot.holdings.findIndex(h => h.instanceId === cardId)
    if (holdingIdx === -1) continue
    const card = realmSlot.holdings[holdingIdx]!
    return {
      card,
      newState: updatePlayer(state, ownerId, {
        formation: {
          ...player.formation,
          slots: {
            ...player.formation.slots,
            [slot]: { ...realmSlot, holdings: realmSlot.holdings.filter((_, i) => i !== holdingIdx) },
          },
        },
      }),
    }
  }

  return null
}
