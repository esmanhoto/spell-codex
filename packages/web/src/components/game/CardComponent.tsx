import React, { memo } from "react"
import { useGameUI } from "../../context/UIContext.tsx"
import type { CardInfo } from "../../api.ts"
import { cardImageUrl } from "../../utils/card-helpers.ts"
import type { ContextMenuAction } from "../../context/types.ts"
import { CardTooltip } from "./CardTooltip.tsx"
import styles from "./CardComponent.module.css"

export const CardComponent = memo(function CardComponent({
  card,
  selected,
  onClick,
  showLabel = true,
  draggable,
  dragSource = "hand",
  contextActions,
  className,
  style,
}: {
  card: CardInfo
  selected: boolean
  onClick?: () => void
  showLabel?: boolean
  draggable?: boolean
  dragSource?: string
  contextActions?: ContextMenuAction[]
  className?: string
  style?: React.CSSProperties
}) {
  const { openContextMenu } = useGameUI()

  return (
    <CardTooltip card={card}>
      <div
        data-testid={`card-${card.instanceId}`}
        className={`${styles.card} ${selected ? styles.selected : ""} ${onClick ? styles.clickable : ""} ${className ?? ""}`}
        style={style}
        onClick={onClick}
        draggable={draggable}
        onDragStart={
          draggable
            ? (e) => {
                e.dataTransfer.setData("drag-id", card.instanceId)
                e.dataTransfer.setData("drag-source", dragSource)
                e.dataTransfer.effectAllowed = "move"
              }
            : undefined
        }
        onContextMenu={
          contextActions
            ? (e) => {
                e.preventDefault()
                openContextMenu(e.clientX, e.clientY, contextActions)
              }
            : undefined
        }
      >
        <div className={styles.imgWrap}>
          <img
            src={cardImageUrl(card.setId, card.cardNumber)}
            alt={card.name}
            className={styles.img}
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = "none"
            }}
          />
        </div>
        {showLabel && <span className={styles.nameLabel}>{card.name}</span>}
        {showLabel && card.level != null && (
          <span className={styles.levelLabel}>lv {card.level}</span>
        )}
      </div>
    </CardTooltip>
  )
})
