import type { CardInfo } from "../../api.ts"
import { Modal, modalStyles as base } from "./Modal.tsx"
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
  return (
    <Modal title="Counter With" onClose={onClose}>
      <div className={base.message}>Pick one card from your hand to cast now.</div>
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
    </Modal>
  )
}
