import { useGame } from "../../context/GameContext.tsx"
import type { CardInfo } from "../../api.ts"
import { cardImageUrl } from "../../utils/card-helpers.ts"
import type { ContextMenuAction } from "../../context/GameContext.tsx"
import { buildHandContextActions } from "../../utils/manual-actions.ts"
import { DrawPile } from "./DrawPile.tsx"
import { DiscardPile } from "./DiscardPile.tsx"
import styles from "./PlayerHand.module.css"

export function PlayerHand({
  cards,
  hiddenCount,
  drawPileCount,
  discardCount,
  isOpponent,
}: {
  cards: CardInfo[]
  hiddenCount?: number
  drawPileCount: number
  discardCount: number
  isOpponent: boolean
}) {
  const { selectedId, onSelect, openContextMenu, legalMoves, requestSpellCast } = useGame()
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
    return buildHandContextActions({
      card,
      isOpponent,
      legalMoves,
      requestSpellCast,
    })
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

            const isSelected = selectedId === card.instanceId
            const contextActions = buildContextActions(card)

            return (
              <div
                key={card.instanceId}
                data-testid={`hand-card-${card.instanceId}`}
                className={`${styles.cardSlot} ${isSelected ? styles.selected : ""}`}
                style={fanTransform(i)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("drag-id", card.instanceId)
                  e.dataTransfer.setData("drag-source", "hand")
                  e.dataTransfer.effectAllowed = "move"
                }}
                onClick={() => onSelect(isSelected ? null : card.instanceId)}
                onContextMenu={
                  contextActions.length
                    ? (e) => {
                        e.preventDefault()
                        openContextMenu(e.clientX, e.clientY, contextActions)
                      }
                    : undefined
                }
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
        <DiscardPile count={discardCount} />
      </div>
    </div>
  )
}
