import type { SetCardData } from "../../api.ts"
import { cardImageUrl } from "../../utils/card-helpers.ts"
import { MiniCardTooltip } from "./CardTooltip.tsx"
import { DECK_SIZE, MAX_CHAMPION_LEVELS } from "./deck-constants.ts"
import styles from "../../pages/DeckBuilder.module.css"

export function DeckStrip({
  title,
  selectedCards,
  totalSelected,
  championLevelTotal,
  onToggle,
}: {
  title: string
  selectedCards: SetCardData[]
  totalSelected: number
  championLevelTotal: number
  onToggle: (cardNumber: number) => void
}) {
  return (
    <div className={styles.myDeckStrip}>
      <div className={styles.myDeckHeader}>
        <h2 className={styles.myDeckTitle}>{title}</h2>
        <div>
          <span
            data-testid="deck-count"
            className={
              totalSelected === DECK_SIZE
                ? styles.deckCountOk
                : totalSelected > DECK_SIZE
                  ? styles.deckCountOver
                  : styles.deckCountUnder
            }
          >
            {totalSelected}/{DECK_SIZE}
          </span>
          <span
            className={`${styles.levelInfo} ${championLevelTotal > MAX_CHAMPION_LEVELS ? styles.levelWarn : ""}`}
          >
            Champion levels: {championLevelTotal}/{MAX_CHAMPION_LEVELS}
          </span>
        </div>
      </div>
      <div className={styles.myDeckCards}>
        {selectedCards.length === 0 && (
          <span className={styles.myDeckEmpty}>Select cards below to build your deck</span>
        )}
        {selectedCards.map((c) => (
          <MiniCardTooltip key={c.cardNumber} card={c}>
            <div
              className={styles.miniCard}
              data-testid={`mini-card-${c.cardNumber}`}
              onClick={() => onToggle(c.cardNumber)}
            >
              <img
                className={styles.miniCardImg}
                src={cardImageUrl(c.setId, c.cardNumber)}
                alt={c.name}
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = "none"
                }}
              />
            </div>
          </MiniCardTooltip>
        ))}
      </div>
    </div>
  )
}
