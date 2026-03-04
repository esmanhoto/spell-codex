import { useEffect, useState } from "react"
import styles from "./WarningModal.module.css"

export function WarningModal({ message, suppressible = true, onClose }: {
  message: string
  suppressible?: boolean
  onClose: (suppress: boolean) => void
}) {
  const [suppress, setSuppress] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose(suppress)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, suppress])

  return (
    <div className={styles.backdrop} data-testid="warning-modal" onClick={() => onClose(suppress)}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.title}>Warning</div>
        <div className={styles.message}>{message}</div>
        {suppressible && (
          <label className={styles.checkboxRow}>
            <input
              data-testid="warning-suppress"
              type="checkbox"
              checked={suppress}
              onChange={e => setSuppress(e.target.checked)}
            />
            <span>Don&apos;t show this warning again</span>
          </label>
        )}
        <button className={styles.button} data-testid="warning-ok" onClick={() => onClose(suppress)}>OK</button>
      </div>
    </div>
  )
}
