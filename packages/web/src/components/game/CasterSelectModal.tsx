import type { CardInfo } from "../../api.ts"
import { Modal, modalStyles as base } from "./Modal.tsx"
import styles from "./CasterSelectModal.module.css"

export function CasterSelectModal({
  spell,
  casters,
  onPick,
  onClose,
}: {
  spell: CardInfo
  casters: CardInfo[]
  onPick: (casterInstanceId: string) => void
  onClose: () => void
}) {
  return (
    <Modal title="Choose Caster" onClose={onClose}>
      <div className={base.message}>
        Select who casts <strong>{spell.name}</strong>.
      </div>
      <div className={styles.list}>
        {casters.map((c) => (
          <button key={c.instanceId} className={styles.item} onClick={() => onPick(c.instanceId)}>
            {c.name}
          </button>
        ))}
      </div>
      <button className={styles.cancel} onClick={onClose}>
        Cancel
      </button>
    </Modal>
  )
}
