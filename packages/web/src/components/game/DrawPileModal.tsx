import { useState } from "react"
import { Modal } from "./Modal.tsx"
import styles from "./DrawPileModal.module.css"

export function DrawPileModal({
  title,
  initialValue,
  actionLabel,
  onConfirm,
  onClose,
}: {
  title: string
  initialValue: number
  actionLabel: string
  onConfirm: (value: number) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(initialValue)

  return (
    <Modal title={title} onClose={onClose}>
      <div className={styles.body}>
        <input
          type="number"
          min={1}
          value={value}
          onChange={(e) => setValue(Math.max(1, Number(e.target.value)))}
          className={styles.input}
          autoFocus
        />
        <button className={styles.button} onClick={() => onConfirm(value)}>
          {actionLabel}
        </button>
      </div>
    </Modal>
  )
}
