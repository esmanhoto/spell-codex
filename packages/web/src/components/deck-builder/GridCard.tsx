import type { SetCardData } from "../../api.ts"
import { cardImageUrl } from "../../utils/card-helpers.ts"
import { GridCardTooltip } from "./CardTooltip.tsx"
import styles from "../../pages/DeckBuilder.module.css"

export function GridCard({
  card,
  isSelected,
  onToggle,
}: {
  card: SetCardData
  isSelected: boolean
  onToggle: () => void
}) {
  return (
    <GridCardTooltip card={card}>
      <div
        className={`${styles.gridCard} ${isSelected ? styles.gridCardSelected : ""}`}
        data-testid={`grid-card-${card.cardNumber}`}
        onClick={onToggle}
      >
        <div className={styles.gridCardImg}>
          <img
            className={styles.gridCardImgInner}
            src={cardImageUrl(card.setId, card.cardNumber)}
            alt={card.name}
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = "none"
            }}
          />
        </div>
        <div className={styles.gridCardInfo}>
          <span className={styles.gridCardName}>{card.name}</span>
          {card.level != null && <span className={styles.gridCardLevel}>lv {card.level}</span>}
        </div>
      </div>
    </GridCardTooltip>
  )
}
