import type { CardInfo } from "../../api.ts"
import { Modal, modalStyles as base } from "./Modal.tsx"
import styles from "./Phase3SpellOutcomeModal.module.css"

export function Phase3SpellOutcomeModal({
  spell,
  onPick,
  onClose,
}: {
  spell: CardInfo
  onPick: (keepInPlay: boolean) => void
  onClose: () => void
}) {
  return (
    <Modal title="Phase 3 Spell" onClose={onClose}>
      <div className={base.message}>
        Choose what happens after casting <strong>{spell.name}</strong>.
      </div>
      <div className={styles.buttons}>
        <button className={base.button} onClick={() => onPick(false)}>
          Cast and discard
        </button>
        <button className={base.button} onClick={() => onPick(true)}>
          Cast and keep in play
        </button>
      </div>
    </Modal>
  )
}
