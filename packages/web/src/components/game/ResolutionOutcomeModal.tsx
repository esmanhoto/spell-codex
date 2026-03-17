import { cardImageUrl } from "../../utils/card-helpers.ts"
import type { CardInfo } from "../../api.ts"
import { Modal, modalStyles as base } from "./Modal.tsx"
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
  return (
    <Modal title="Event Resolved" onClose={onClose}>
      <div className={base.message}>
        Opponent resolved <strong>{outcome.card.name}</strong>
        {/[.!?]$/.test(outcome.card.name) ? "" : "."}
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
      <div className={base.actions}>
        <button className={base.button} onClick={onClose}>
          Acknowledge
        </button>
      </div>
    </Modal>
  )
}
