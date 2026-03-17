import { cardImageUrl } from "../../utils/card-helpers.ts"
import { Modal, modalStyles as base } from "./Modal.tsx"
import styles from "./SpellCastAnnouncementModal.module.css"

export interface SpellCastAnnouncement {
  playerId: string
  playerLabel: string
  cardName: string
  setId: string
  cardNumber: number
  keepInPlay: boolean
}

export function SpellCastAnnouncementModal({
  announcement,
  canCounter = false,
  onCounter,
  onClose,
}: {
  announcement: SpellCastAnnouncement
  canCounter?: boolean
  onCounter?: () => void
  onClose: () => void
}) {
  return (
    <Modal title="Spell Cast" onClose={onClose} testId="spell-cast-modal">
      <div className={base.message}>
        {announcement.playerLabel} cast <strong>{announcement.cardName}</strong>.
      </div>
      <div className={styles.imageWrap}>
        <img
          src={cardImageUrl(announcement.setId, announcement.cardNumber)}
          alt={announcement.cardName}
          className={styles.image}
        />
      </div>
      <div className={styles.status}>
        {announcement.keepInPlay
          ? "Marked as lasting effect (kept in play)."
          : "Discarded after cast."}
      </div>
      <div className={base.actions}>
        {canCounter && onCounter && (
          <button className={base.button} onClick={onCounter}>
            Counter It
          </button>
        )}
        <button className={base.button} onClick={onClose}>
          Acknowledge
        </button>
      </div>
    </Modal>
  )
}
