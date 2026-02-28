import { useGame } from "../../context/GameContext.tsx"
import type { CardInfo } from "../../api.ts"
import { cardImageUrl } from "../../utils/card-helpers.ts"
import type { ContextMenuAction } from "../../context/GameContext.tsx"
import { DrawPile } from "./DrawPile.tsx"
import { DiscardPile } from "./DiscardPile.tsx"
import styles from "./PlayerHand.module.css"

export function PlayerHand({ cards, drawPileCount, discardCount, isOpponent }: {
  cards:          CardInfo[]
  drawPileCount:  number
  discardCount:   number
  isOpponent:     boolean
}) {
  const { selectedId, onSelect, openContextMenu } = useGame()
  const total = cards.length

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
    if (isOpponent) return []
    return [
      { label: "Discard",  move: { type: "MANUAL_DISCARD",  cardInstanceId: card.instanceId } },
      { label: "To Abyss", move: { type: "MANUAL_TO_ABYSS", cardInstanceId: card.instanceId } },
    ]
  }

  return (
    <div className={styles.hand}>
      <div className={styles.piles}>
        <DrawPile count={drawPileCount} />
      </div>

      <div className={`${styles.fan} ${isOpponent ? "" : styles.own}`}>
        {cards.map((card, i) => {
          if (isOpponent) {
            return (
              <div key={card.instanceId} className={styles.cardSlot} style={fanTransform(i)}>
                <div className={styles.cardBack} />
              </div>
            )
          }

          const isSelected = selectedId === card.instanceId
          const contextActions = buildContextActions(card)

          return (
            <div
              key={card.instanceId}
              className={`${styles.cardSlot} ${isSelected ? styles.selected : ""}`}
              style={fanTransform(i)}
              draggable
              onDragStart={e => {
                e.dataTransfer.setData("drag-id", card.instanceId)
                e.dataTransfer.setData("drag-source", "hand")
                e.dataTransfer.effectAllowed = "move"
              }}
              onClick={() => onSelect(isSelected ? null : card.instanceId)}
              onContextMenu={contextActions.length ? e => {
                e.preventDefault()
                openContextMenu(e.clientX, e.clientY, contextActions)
              } : undefined}
            >
              <div className={styles.cardWrap}>
                <img
                  src={cardImageUrl(card.setId, card.cardNumber)}
                  alt={card.name}
                  className={styles.cardImg}
                  onError={e => { (e.target as HTMLImageElement).style.display = "none" }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className={styles.piles}>
        <DiscardPile count={discardCount} />
      </div>
    </div>
  )
}
