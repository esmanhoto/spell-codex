import { cardImageUrl } from "../../utils/card-helpers.ts"
import type { CardInfo } from "../../api.ts"
import { Modal, modalStyles as base } from "./Modal.tsx"
import styles from "./ResolutionOutcomeModal.module.css"

export interface ResolutionOutcome {
  card: CardInfo
  destination: string
  effects: string[]
  declarations: string[]
  casterName: string
}

const EVENT_TYPE_ID = 6

function cardLabel(typeId: number): { title: string; verb: string; noun: string } {
  if (typeId === EVENT_TYPE_ID) return { title: "Event Played", verb: "played", noun: "Event" }
  return { title: "Spell Cast", verb: "cast", noun: "Spell" }
}

export function ResolutionOutcomeModal({
  outcome,
  onClose,
}: {
  outcome: ResolutionOutcome
  onClose: () => void
}) {
  const label = cardLabel(outcome.card.typeId)

  return (
    <Modal title={label.title} onClose={onClose}>
      <div className={base.message}>
        Opponent {label.verb} <strong>{outcome.card.name}</strong>
        {/[.!?]$/.test(outcome.card.name) ? "" : "."}
      </div>
      <div className={styles.imageWrap}>
        <img
          src={cardImageUrl(outcome.card.setId, outcome.card.cardNumber)}
          alt={outcome.card.name}
          className={styles.image}
        />
      </div>
      {outcome.declarations.length > 0 && (
        <div className={styles.status}>
          <div>{label.noun} player asked to:</div>
          <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
            {outcome.declarations.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}
      {outcome.effects.length > 0 && (
        <div className={styles.status}>
          {outcome.effects.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}
      {outcome.declarations.length > 0 && (
        <div className={styles.status} style={{ fontStyle: "italic", opacity: 0.8 }}>
          If you cannot counter this {label.noun.toLowerCase()}, fulfill the actions requested by{" "}
          {outcome.casterName}.
        </div>
      )}
      <div className={base.actions}>
        <button className={base.button} onClick={onClose}>
          OK
        </button>
      </div>
    </Modal>
  )
}
