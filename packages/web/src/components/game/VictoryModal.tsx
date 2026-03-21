import { useCallback } from "react"
import { X } from "lucide-react"
import { useEscapeKey } from "../../hooks/useEscapeKey.ts"
import base from "./modal-base.module.css"
import styles from "./VictoryModal.module.css"

export function VictoryModal({
  winnerName,
  onClose,
  onBackToLobby,
}: {
  winnerName: string
  onClose: () => void
  onBackToLobby: () => void
}) {
  useEscapeKey(useCallback(() => onClose(), [onClose]))

  return (
    <div className={base.backdrop} onClick={onClose} data-testid="victory-modal">
      <div className={`${base.modal} ${styles.modal}`} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>
          <X size={18} />
        </button>
        <div className={styles.title}>{winnerName} wins!</div>
        <div className={styles.actions}>
          <button className={`${base.button} ${styles.lobbyBtn}`} onClick={onBackToLobby}>
            Back to Lobby
          </button>
        </div>
      </div>
    </div>
  )
}
