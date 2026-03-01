import { useEffect } from "react"
import styles from "./WarningModal.module.css"

export function WarningModal({ message, onClose }: {
  message: string
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
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.title}>Warning</div>
        <div className={styles.message}>{message}</div>
        <button className={styles.button} onClick={onClose}>OK</button>
      </div>
    </div>
  )
}
