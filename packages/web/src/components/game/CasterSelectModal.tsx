import { useEffect } from "react"
import type { CardInfo } from "../../api.ts"
import styles from "./CasterSelectModal.module.css"

export function CasterSelectModal({ spell, casters, onPick, onClose }: {
  spell: CardInfo
  casters: CardInfo[]
  onPick: (casterInstanceId: string) => void
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
        <div className={styles.title}>Choose Caster</div>
        <div className={styles.message}>Select who casts <strong>{spell.name}</strong>.</div>
        <div className={styles.list}>
          {casters.map(c => (
            <button key={c.instanceId} className={styles.item} onClick={() => onPick(c.instanceId)}>
              {c.name}
            </button>
          ))}
        </div>
        <button className={styles.cancel} onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

