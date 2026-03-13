import type { CardInfo, Move, SlotState } from "../api.ts"
import type { ContextMenuAction } from "../context/types.ts"
import { isSpellCard } from "./spell-casting.ts"

function findCardMove(legalMoves: Move[], type: Move["type"], cardInstanceId: string): Move | null {
  return (
    legalMoves.find(
      (m) =>
        m.type === type && (m as { cardInstanceId?: string }).cardInstanceId === cardInstanceId,
    ) ?? null
  )
}

export function buildHandContextActions(args: {
  card: CardInfo
  isOpponent: boolean
  legalMoves: Move[]
  requestSpellCast: (spellInstanceId: string) => void
}): ContextMenuAction[] {
  const { card, isOpponent, legalMoves, requestSpellCast } = args
  if (isOpponent) return []

  const discardMove = findCardMove(legalMoves, "DISCARD_CARD", card.instanceId)
  const combatCardMove = findCardMove(legalMoves, "PLAY_COMBAT_CARD", card.instanceId)
  const playEventMove = findCardMove(legalMoves, "PLAY_EVENT", card.instanceId)
  const actions: ContextMenuAction[] = []

  if (combatCardMove) {
    actions.push({ label: "Play in Combat", move: combatCardMove })
  }

  if (playEventMove) {
    actions.push({ label: "Play Event", move: playEventMove })
  }

  if (discardMove) {
    actions.push({ label: "Discard", move: discardMove })
  }

  if (isSpellCard(card)) {
    actions.unshift({
      label: "Cast Spell",
      action: () => requestSpellCast(card.instanceId),
    })
  }

  return actions
}

export type HandDropTarget =
  | { zone: "pool" }
  | { zone: "champion"; owner: "self" | "opponent"; championId: string }
  | {
      zone: "formation_slot"
      owner: "self" | "opponent"
      slot: string
      slotState: SlotState | null
    }

export function resolveHandDropMove(args: {
  legalMoves: Move[]
  cardInstanceId: string
  target: HandDropTarget
}): Move | null {
  const { legalMoves, cardInstanceId, target } = args

  if (target.zone === "pool") {
    return findCardMove(legalMoves, "PLACE_CHAMPION", cardInstanceId)
  }

  if (target.zone === "champion") {
    return (
      legalMoves.find(
        (m) =>
          m.type === "ATTACH_ITEM" &&
          (m as { cardInstanceId: string; championId: string }).cardInstanceId === cardInstanceId &&
          (m as { cardInstanceId: string; championId: string }).championId === target.championId,
      ) ?? null
    )
  }

  if (target.slotState) {
    const realmMove = legalMoves.find(
      (m) =>
        m.type === "PLAY_REALM" &&
        (m as { cardInstanceId: string; slot: string }).cardInstanceId === cardInstanceId &&
        (m as { cardInstanceId: string; slot: string }).slot === target.slot,
    )
    if (realmMove) return realmMove

    return (
      legalMoves.find(
        (m) =>
          m.type === "PLAY_HOLDING" &&
          (m as { cardInstanceId: string; realmSlot: string }).cardInstanceId === cardInstanceId &&
          (m as { cardInstanceId: string; realmSlot: string }).realmSlot === target.slot,
      ) ?? null
    )
  }

  return (
    legalMoves.find(
      (m) =>
        m.type === "PLAY_REALM" &&
        (m as { cardInstanceId: string; slot: string }).cardInstanceId === cardInstanceId &&
        (m as { cardInstanceId: string; slot: string }).slot === target.slot,
    ) ?? null
  )
}
