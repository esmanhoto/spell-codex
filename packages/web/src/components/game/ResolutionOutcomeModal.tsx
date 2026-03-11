import { useEffect } from "react"
import { cardImageUrl } from "../../utils/card-helpers.ts"
import type { CardInfo } from "../../api.ts"
import styles from "./SpellCastAnnouncementModal.module.css"

export interface ResolutionOutcome {
  card: CardInfo
  destination: string
  effects: string[]
}

export function ResolutionOutcomeModal({
  outcome,
  onClose,
}: {
  outcome: ResolutionOutcome
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
        <div className={styles.title}>Event Resolved</div>
        <div className={styles.message}>
          Opponent resolved <strong>{outcome.card.name}</strong>{/[.!?]$/.test(outcome.card.name) ? "" : "."}
        </div>
        <div className={styles.imageWrap}>
          <img
            src={cardImageUrl(outcome.card.setId, outcome.card.cardNumber)}
            alt={outcome.card.name}
            className={styles.image}
          />
        </div>
        {outcome.effects.length > 0 && (
          <div className={styles.status}>
            {outcome.effects.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}
        <div className={styles.status}>Card destination: {outcome.destination}</div>
        <div className={styles.actions}>
          <button className={styles.button} onClick={onClose}>
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  )
}
