import type { GameState, Move, SlotState } from "../api.ts"

/**
 * Apply an optimistic UI mutation for common move types.
 * Returns a new state for instant feedback, or null if the move is not handled.
 * The returned state always has legalMoves cleared to prevent double-submit.
 */
export function applyOptimisticMove(
  state: GameState,
  playerId: string,
  move: Move,
): GameState | null {
  const board = state.board.players[playerId]
  if (!board) return null

  switch (move.type) {
    case "PASS":
    case "END_TURN":
    case "DECLINE_DEFENSE":
    case "STOP_PLAYING":
    case "END_ATTACK":
    case "INTERRUPT_COMBAT":
      return { ...state, legalMoves: [] }

    case "PLAY_REALM": {
      // Cast needed: catch-all `{ type: string; [key: string]: unknown }` in Move union
      // prevents narrowing of slot/cardInstanceId to string after switch discrimination.
      const { cardInstanceId, slot: realmSlot } = move as {
        type: "PLAY_REALM"
        cardInstanceId: string
        slot: string
      }
      const card = board.hand.find((c) => c.instanceId === cardInstanceId)
      if (!card) return null
      const slot: SlotState = {
        realm: card,
        holdings: [],
        isRazed: false,
        holdingRevealedToAll: false,
      }
      return {
        ...state,
        legalMoves: [],
        board: {
          ...state.board,
          players: {
            ...state.board.players,
            [playerId]: {
              ...board,
              hand: board.hand.filter((c) => c.instanceId !== cardInstanceId),
              formation: { ...board.formation, [realmSlot]: slot },
            },
          },
        },
      }
    }

    case "PLAY_HOLDING": {
      const { cardInstanceId, realmSlot } = move as {
        type: "PLAY_HOLDING"
        cardInstanceId: string
        realmSlot: string
      }
      const card = board.hand.find((c) => c.instanceId === cardInstanceId)
      if (!card) return null
      const existing = board.formation[realmSlot]
      if (!existing) return null
      return {
        ...state,
        legalMoves: [],
        board: {
          ...state.board,
          players: {
            ...state.board.players,
            [playerId]: {
              ...board,
              hand: board.hand.filter((c) => c.instanceId !== cardInstanceId),
              formation: {
                ...board.formation,
                [realmSlot]: { ...existing, holdings: [...existing.holdings, card] },
              },
            },
          },
        },
      }
    }

    case "PLACE_CHAMPION": {
      const { cardInstanceId } = move as { type: "PLACE_CHAMPION"; cardInstanceId: string }
      const card = board.hand.find((c) => c.instanceId === cardInstanceId)
      if (!card) return null
      return {
        ...state,
        legalMoves: [],
        board: {
          ...state.board,
          players: {
            ...state.board.players,
            [playerId]: {
              ...board,
              hand: board.hand.filter((c) => c.instanceId !== cardInstanceId),
              pool: [...board.pool, { champion: card, attachments: [] }],
            },
          },
        },
      }
    }

    case "ATTACH_ITEM": {
      const { cardInstanceId, championId } = move as {
        type: "ATTACH_ITEM"
        cardInstanceId: string
        championId: string
      }
      const card = board.hand.find((c) => c.instanceId === cardInstanceId)
      if (!card) return null
      const poolIdx = board.pool.findIndex((e) => e.champion.instanceId === championId)
      if (poolIdx === -1) return null
      return {
        ...state,
        legalMoves: [],
        board: {
          ...state.board,
          players: {
            ...state.board.players,
            [playerId]: {
              ...board,
              hand: board.hand.filter((c) => c.instanceId !== cardInstanceId),
              pool: board.pool.map((e, i) =>
                i === poolIdx ? { ...e, attachments: [...e.attachments, card] } : e,
              ),
            },
          },
        },
      }
    }

    case "DISCARD_CARD": {
      const { cardInstanceId } = move as { type: "DISCARD_CARD"; cardInstanceId: string }
      const card = board.hand.find((c) => c.instanceId === cardInstanceId)
      if (!card) return null
      return {
        ...state,
        legalMoves: [],
        board: {
          ...state.board,
          players: {
            ...state.board.players,
            [playerId]: {
              ...board,
              hand: board.hand.filter((c) => c.instanceId !== cardInstanceId),
              discardCount: board.discardCount + 1,
              discardPile: [...board.discardPile, card],
            },
          },
        },
      }
    }

    default:
      return null
  }
}
