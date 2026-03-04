import type { CardInfo, Move, PlayMode, SlotState } from "../api.ts"
import type { ContextMenuAction } from "../context/GameContext.tsx"
import type { WarningCode } from "./warnings.ts"
import { isSpellCard } from "./spell-casting.ts"

function findCardMove(
  legalMoves: Move[],
  type: Move["type"],
  cardInstanceId: string,
): Move | null {
  return legalMoves.find(m => m.type === type && (m as { cardInstanceId?: string }).cardInstanceId === cardInstanceId) ?? null
}

export function buildHandContextActions(args: {
  card: CardInfo
  isOpponent: boolean
  playMode: PlayMode
  legalMoves: Move[]
  requestSpellCast: (spellInstanceId: string) => void
  requestManualPlay: (cardInstanceId: string) => void
}): ContextMenuAction[] {
  const {
    card, isOpponent, playMode, legalMoves,
    requestSpellCast, requestManualPlay,
  } = args
  if (isOpponent) return []

  const discardMove = findCardMove(legalMoves, "DISCARD_CARD", card.instanceId)
  const actions: ContextMenuAction[] = [
    {
      label: "Discard",
      move: discardMove ?? { type: "MANUAL_DISCARD", cardInstanceId: card.instanceId },
    },
    { label: "To Abyss", move: { type: "MANUAL_TO_ABYSS", cardInstanceId: card.instanceId } },
  ]

  if (playMode === "full_manual") {
    actions.unshift({
      label: "Play/Cast...",
      action: () => requestManualPlay(card.instanceId),
    })
    return actions
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
  | { zone: "formation_slot"; owner: "self" | "opponent"; slot: string; slotState: SlotState | null }

export function resolveHandDropMove(args: {
  playMode: PlayMode
  legalMoves: Move[]
  cardInstanceId: string
  target: HandDropTarget
}): Move | null {
  const { playMode, legalMoves, cardInstanceId, target } = args

  if (playMode === "full_manual") {
    if (target.zone === "pool") {
      return {
        type: "MANUAL_PLAY_CARD",
        cardInstanceId,
        targetKind: "none",
        resolution: "lasting",
      }
    }

    if (target.zone === "champion") {
      return {
        type: "MANUAL_PLAY_CARD",
        cardInstanceId,
        targetKind: "card",
        resolution: "lasting_target",
        targetOwner: target.owner,
        targetCardInstanceId: target.championId,
      }
    }

    if (target.slotState) {
      return {
        type: "MANUAL_PLAY_CARD",
        cardInstanceId,
        targetKind: "card",
        resolution: "lasting_target",
        targetOwner: target.owner,
        targetCardInstanceId: target.slotState.realm.instanceId,
      }
    }

    return {
      type: "MANUAL_PLAY_CARD",
      cardInstanceId,
      targetKind: "none",
      resolution: "lasting",
    }
  }

  if (target.zone === "pool") {
    return findCardMove(legalMoves, "PLACE_CHAMPION", cardInstanceId)
  }

  if (target.zone === "champion") {
    return legalMoves.find(m =>
      m.type === "ATTACH_ITEM" &&
      (m as { cardInstanceId: string; championId: string }).cardInstanceId === cardInstanceId &&
      (m as { cardInstanceId: string; championId: string }).championId === target.championId,
    ) ?? null
  }

  if (target.slotState) {
    const realmMove = legalMoves.find(m =>
      m.type === "PLAY_REALM" &&
      (m as { cardInstanceId: string; slot: string }).cardInstanceId === cardInstanceId &&
      (m as { cardInstanceId: string; slot: string }).slot === target.slot,
    )
    if (realmMove) return realmMove

    return legalMoves.find(m =>
      m.type === "PLAY_HOLDING" &&
      (m as { cardInstanceId: string; realmSlot: string }).cardInstanceId === cardInstanceId &&
      (m as { cardInstanceId: string; realmSlot: string }).realmSlot === target.slot,
    ) ?? null
  }

  return legalMoves.find(m =>
    m.type === "PLAY_REALM" &&
    (m as { cardInstanceId: string; slot: string }).cardInstanceId === cardInstanceId &&
    (m as { cardInstanceId: string; slot: string }).slot === target.slot,
  ) ?? null
}

export function showModeAwareWarning(args: {
  playMode: PlayMode
  showWarning: (message: string, code?: WarningCode, suppressible?: boolean) => void
  semiAutoMessage: string
  code?: WarningCode
}): void {
  const { playMode, showWarning, semiAutoMessage, code } = args
  if (playMode === "full_manual") {
    showWarning("Manual action failed for this target.", "structural_error")
    return
  }
  showWarning(semiAutoMessage, code)
}
