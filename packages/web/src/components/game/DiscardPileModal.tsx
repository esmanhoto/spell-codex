import { useCallback } from "react"
import type { CardInfo } from "../../api.ts"
import { cardImageUrl } from "../../utils/card-helpers.ts"
import { isChampion } from "../../utils/type-labels.ts"
import { useEscapeKey } from "../../hooks/useEscapeKey.ts"
import { useMoves } from "../../context/MovesContext.tsx"
import styles from "./DiscardPileModal.module.css"

export function DiscardPileModal({
  ownerId,
  cards,
  onClose,
}: {
  ownerId: string
  cards: CardInfo[]
  onClose: () => void
}) {
  const { onMove } = useMoves()
  useEscapeKey(useCallback(() => onClose(), [onClose]))

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Discard Pile ({cards.length})</span>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>
        {cards.length === 0 ? (
          <div className={styles.empty}>Empty</div>
        ) : (
          <div className={styles.grid}>
            {cards.map((card) => (
              <div key={card.instanceId} className={styles.card}>
                <img
                  src={cardImageUrl(card.setId, card.cardNumber)}
                  alt={card.name}
                  className={styles.image}
                />
                <div className={styles.name}>{card.name}</div>
                <div className={styles.actions}>
                  <button
                    className={styles.btn}
                    onClick={() => {
                      onMove({
                        type: "RETURN_FROM_DISCARD",
                        playerId: ownerId,
                        cardInstanceId: card.instanceId,
                        destination: "hand",
                      })
                      onClose()
                    }}
                  >
                    Hand
                  </button>
                  <button
                    className={styles.btn}
                    onClick={() => {
                      onMove({
                        type: "RETURN_FROM_DISCARD",
                        playerId: ownerId,
                        cardInstanceId: card.instanceId,
                        destination: "deck",
                      })
                      onClose()
                    }}
                  >
                    Deck
                  </button>
                  {isChampion(card.typeId) && (
                    <button
                      className={styles.btn}
                      onClick={() => {
                        onMove({
                          type: "RETURN_FROM_DISCARD",
                          playerId: ownerId,
                          cardInstanceId: card.instanceId,
                          destination: "pool",
                        })
                        onClose()
                      }}
                    >
                      Pool
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
