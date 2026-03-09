import { useEffect } from "react"
import type { CardInfo } from "../../api.ts"
import { cardImageUrl } from "../../utils/card-helpers.ts"
import { useGame } from "../../context/GameContext.tsx"
import styles from "./DiscardPileModal.module.css"

const CHAMPION_TYPE_IDS = new Set([5, 7, 10, 12, 14, 16, 20])

function isChampion(card: CardInfo) {
  return CHAMPION_TYPE_IDS.has(card.typeId)
}

export function DiscardPileModal({
  ownerId,
  cards,
  onClose,
}: {
  ownerId: string
  cards: CardInfo[]
  onClose: () => void
}) {
  const { onMove } = useGame()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

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
                  {isChampion(card) && (
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
