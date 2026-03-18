import { useRef, useEffect } from "react"
import type { Move } from "../../api.ts"
import styles from "./TargetPickerModal.module.css"

export function TargetPickerModal({
  title,
  targets,
  onSelect,
  onClose,
}: {
  title: string
  targets: { label: string; move: Move }[]
  onSelect: (m: Move) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [onClose])

  return (
    <div className={styles.overlay}>
      <div ref={ref} className={styles.modal}>
        <div className={styles.title}>{title}</div>
        {targets.map((t, i) => (
          <button
            key={i}
            className={styles.target}
            onClick={() => {
              onSelect(t.move)
              onClose()
            }}
          >
            {t.label}
          </button>
        ))}
        <button className={styles.cancel} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
