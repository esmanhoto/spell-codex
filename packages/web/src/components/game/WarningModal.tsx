import { useEffect, useState } from "react"
import base from "./modal-base.module.css"
import styles from "./WarningModal.module.css"

export function WarningModal({
  message,
  suppressible = true,
  proceedLabel = "Proceed Anyway",
  onCancel,
  onProceed,
}: {
  message: string
  suppressible?: boolean
  proceedLabel?: string
  onCancel: (suppress: boolean) => void
  onProceed?: (suppress: boolean) => void
}) {
  const [suppress, setSuppress] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel(suppress)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCancel, suppress])

  return (
    <div className={base.backdrop} data-testid="warning-modal" onClick={() => onCancel(suppress)}>
      <div className={base.modal} onClick={(e) => e.stopPropagation()}>
        <div className={base.title}>Warning</div>
        <div className={`${base.message} ${styles.messagePreWrap}`}>{message}</div>
        {suppressible && (
          <label className={styles.checkboxRow}>
            <input
              data-testid="warning-suppress"
              type="checkbox"
              checked={suppress}
              onChange={(e) => setSuppress(e.target.checked)}
            />
            <span>Don&apos;t show this warning again</span>
          </label>
        )}
        <div className={base.actions}>
          {onProceed && (
            <button
              className={base.button}
              data-testid="warning-cancel"
              onClick={() => onCancel(suppress)}
            >
              Cancel
            </button>
          )}
          <button
            className={base.button}
            data-testid={onProceed ? "warning-proceed" : "warning-ok"}
            onClick={() => (onProceed ? onProceed(suppress) : onCancel(suppress))}
          >
            {onProceed ? proceedLabel : "OK"}
          </button>
        </div>
      </div>
    </div>
  )
}
