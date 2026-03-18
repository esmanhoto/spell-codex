import { useState } from "react"
import { useBoard } from "../../context/BoardContext.tsx"
import { useCombat } from "../../context/CombatContext.tsx"
import { useMoves } from "../../context/MovesContext.tsx"
import { useGameUI } from "../../context/UIContext.tsx"
import type { CardInfo } from "../../api.ts"
import { cardImageUrl } from "../../utils/card-helpers.ts"
import type { ContextMenuAction } from "../../context/types.ts"
import { buildHandContextActions } from "../../utils/manual-actions.ts"
import { DrawPile } from "./DrawPile.tsx"
import { DiscardPile } from "./DiscardPile.tsx"
import { DiscardPileModal } from "./DiscardPileModal.tsx"
import styles from "./PlayerHand.module.css"

export function PlayerHand({
  ownerId,
  cards,
  hiddenCount,
  drawPileCount,
  discardCount,
  discardPile,
  isOpponent,
}: {
  ownerId: string
  cards: CardInfo[]
  hiddenCount?: number
  drawPileCount: number
  discardCount: number
  discardPile: CardInfo[]
  isOpponent: boolean
}) {
  const { allBoards, myPlayerId } = useBoard()
  const { combat } = useCombat()
  const { legalMoves, phase } = useMoves()
  const {
    selectedId,
    onSelect,
    openContextMenu,
    requestSpellCast,
    openTargetPicker,
    rebuildTarget,
    setRebuildTarget,
    submitRebuild,
  } = useGameUI()
  const [showDiscard, setShowDiscard] = useState(false)
  const [rebuildSelected, setRebuildSelected] = useState<string[]>([])
  const isRebuildMode = rebuildTarget !== null && !isOpponent
  const total = isOpponent ? (hiddenCount ?? cards.length) : cards.length

  function fanTransform(index: number): React.CSSProperties {
    const center = (total - 1) / 2
    const offset = index - center
    const rotation = offset * 3 // degrees
    const yShift = Math.abs(offset) * 4 // px
    return {
      transform: `rotate(${rotation}deg) translateY(${yShift}px)`,
      zIndex: index,
    }
  }

  function buildContextActions(card: CardInfo): ContextMenuAction[] {
    const myBoard = allBoards[myPlayerId] ?? null
    const actions = buildHandContextActions({
      card,
      isOpponent,
      legalMoves,
      requestSpellCast,
      combat,
      openTargetPicker,
      myBoard,
      myPlayerId,
      allBoards,
      phase,
    })

    if (!isOpponent) {
      // DECLARE_DEFENSE from hand
      const defendMove = legalMoves.find(
        (m) =>
          m.type === "DECLARE_DEFENSE" &&
          (m as { championId: string }).championId === card.instanceId,
      )
      if (defendMove) {
        actions.unshift({ label: "Join combat as defender", move: defendMove })
      }

      // DECLARE_ATTACK from hand — one entry per target realm
      const attackMoves = legalMoves.filter(
        (m) =>
          m.type === "DECLARE_ATTACK" &&
          (m as { championId: string }).championId === card.instanceId,
      )
      for (const m of attackMoves) {
        const { targetRealmSlot, targetPlayerId } = m as {
          targetRealmSlot: string
          targetPlayerId: string
        }
        const realmName =
          allBoards[targetPlayerId]?.formation[targetRealmSlot]?.realm.name ?? targetRealmSlot
        actions.unshift({ label: `Attack ${realmName}`, move: m })
      }
    }

    return actions
  }

  return (
    <div className={styles.hand}>
      <div className={styles.piles}>
        <DrawPile count={drawPileCount} disabled={isOpponent} handCount={cards.length} />
      </div>

      <div className={`${styles.fan} ${isOpponent ? "" : styles.own}`}>
        {(isOpponent ? Array.from({ length: hiddenCount ?? cards.length }) : cards).map(
          (item, i) => {
            if (isOpponent) {
              return (
                <div
                  key={`hidden-${i}`}
                  data-testid={`opponent-card-back-${i}`}
                  className={styles.cardSlot}
                  style={fanTransform(i)}
                >
                  <div className={styles.cardBack} />
                </div>
              )
            }
            const card = item as CardInfo

            const isRebuildPicked = isRebuildMode && rebuildSelected.includes(card.instanceId)
            const isSelected = !isRebuildMode && selectedId === card.instanceId
            const contextActions = isRebuildMode ? [] : buildContextActions(card)

            const handleClick = () => {
              if (isRebuildMode) {
                setRebuildSelected((prev) =>
                  prev.includes(card.instanceId)
                    ? prev.filter((id) => id !== card.instanceId)
                    : prev.length < 3
                      ? [...prev, card.instanceId]
                      : prev,
                )
                return
              }
              onSelect(isSelected ? null : card.instanceId)
            }

            return (
              <div
                key={card.instanceId}
                data-testid={`hand-card-${card.instanceId}`}
                className={`${styles.cardSlot} ${isSelected ? styles.selected : ""} ${isRebuildPicked ? styles.rebuildSelected : ""}`}
                style={fanTransform(i)}
                draggable={!isRebuildMode}
                onDragStart={
                  isRebuildMode
                    ? undefined
                    : (e) => {
                        e.dataTransfer.setData("drag-id", card.instanceId)
                        e.dataTransfer.setData("drag-source", "hand")
                        e.dataTransfer.effectAllowed = "move"
                      }
                }
                onClick={handleClick}
                onContextMenu={(e) => {
                  e.preventDefault()
                  openContextMenu(e.clientX, e.clientY, contextActions)
                }}
              >
                <div className={styles.cardWrap}>
                  <img
                    src={cardImageUrl(card.setId, card.cardNumber)}
                    alt={card.name}
                    className={styles.cardImg}
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = "none"
                    }}
                  />
                </div>
              </div>
            )
          },
        )}
      </div>

      <div className={styles.piles}>
        <DiscardPile count={discardCount} onOpen={() => setShowDiscard(true)} />
      </div>

      {isRebuildMode && (
        <div className={styles.rebuildBar}>
          <span>Select 3 cards to discard ({rebuildSelected.length}/3)</span>
          <button
            disabled={rebuildSelected.length !== 3}
            onClick={() => {
              submitRebuild(rebuildSelected as [string, string, string])
              setRebuildSelected([])
            }}
          >
            Confirm Rebuild
          </button>
          <button
            onClick={() => {
              setRebuildTarget(null)
              setRebuildSelected([])
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {showDiscard && (
        <DiscardPileModal
          ownerId={ownerId}
          cards={discardPile}
          onClose={() => setShowDiscard(false)}
        />
      )}
    </div>
  )
}
