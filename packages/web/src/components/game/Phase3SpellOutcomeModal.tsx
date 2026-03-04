import { useEffect } from "react"
import type { CardInfo } from "../../api.ts"
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
        <div className={styles.title}>Phase 3 Spell</div>
        <div className={styles.message}>
          Choose what happens after casting <strong>{spell.name}</strong>.
        </div>
        <div className={styles.buttons}>
          <button className={styles.button} onClick={() => onPick(false)}>
            Cast and discard
          </button>
          <button className={styles.button} onClick={() => onPick(true)}>
            Cast and keep in play
          </button>
        </div>
      </div>
    </div>
  )
}
