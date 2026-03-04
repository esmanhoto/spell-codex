import { useEffect } from "react"
import type { CardInfo } from "../../api.ts"
import styles from "./CounterCastModal.module.css"

export function CounterCastModal({
  cards,
  onPick,
  onClose,
}: {
  cards: CardInfo[]
  onPick: (cardInstanceId: string) => void
  onClose: () => void
}) {
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
        <div className={styles.title}>Counter With</div>
        <div className={styles.message}>Pick one card from your hand to cast now.</div>
        <div className={styles.list}>
          {cards.map((card) => (
            <button
              key={card.instanceId}
              className={styles.item}
              onClick={() => onPick(card.instanceId)}
            >
              {card.name}
            </button>
          ))}
          {cards.length === 0 && <div className={styles.empty}>No cards in hand.</div>}
        </div>
        <button className={styles.cancel} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
