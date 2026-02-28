import { useGame } from "../../context/GameContext.tsx"
import type { CardInfo } from "../../api.ts"
import { cardImageUrl } from "../../utils/card-helpers.ts"
import { getTypeInfo, isChampion } from "../../utils/type-labels.ts"
import type { ContextMenuAction } from "../../context/GameContext.tsx"
import { CardTooltip } from "./CardTooltip.tsx"
import styles from "./CardComponent.module.css"

export function CardComponent({ card, selected, onClick, showLabel = true, draggable, dragSource = "hand", contextActions, className, style }: {
  card:            CardInfo
  selected:        boolean
  onClick?:        () => void
  showLabel?:      boolean
  draggable?:      boolean
  dragSource?:     string
  contextActions?: ContextMenuAction[]
  className?:      string
  style?:          React.CSSProperties
}) {
  const { openContextMenu } = useGame()
  const typeInfo = getTypeInfo(card.typeId)

  return (
    <CardTooltip card={card}>
      <div
        className={`${styles.card} ${selected ? styles.selected : ""} ${onClick ? styles.clickable : ""} ${className ?? ""}`}
        style={style}
        onClick={onClick}
        draggable={draggable}
        onDragStart={draggable ? e => {
          e.dataTransfer.setData("drag-id", card.instanceId)
          e.dataTransfer.setData("drag-source", dragSource)
          e.dataTransfer.effectAllowed = "move"
        } : undefined}
        onContextMenu={contextActions?.length ? e => {
          e.preventDefault()
          openContextMenu(e.clientX, e.clientY, contextActions)
        } : undefined}
      >
        <div className={styles.imgWrap}>
          <img
            src={cardImageUrl(card.setId, card.cardNumber)}
            alt={card.name}
            className={styles.img}
            onError={e => { (e.target as HTMLImageElement).style.display = "none" }}
          />
        </div>
        {showLabel && <span className={styles.nameLabel}>{card.name}</span>}
        {showLabel && card.level != null && <span className={styles.levelLabel}>lv {card.level}</span>}
      </div>
    </CardTooltip>
  )
}
