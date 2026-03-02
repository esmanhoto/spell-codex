import { useEffect } from "react"
import { cardImageUrl } from "../../utils/card-helpers.ts"
import styles from "./SpellCastAnnouncementModal.module.css"

export interface SpellCastAnnouncement {
  playerLabel: string
  cardName: string
  setId: string
  cardNumber: number
  keepInPlay: boolean
}

export function SpellCastAnnouncementModal({ announcement, onClose }: {
  announcement: SpellCastAnnouncement
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
    <div className={styles.backdrop} onClick={onClose} data-testid="spell-cast-modal">
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.title}>Spell Cast</div>
        <div className={styles.message}>
          {announcement.playerLabel} cast <strong>{announcement.cardName}</strong>.
        </div>
        <div className={styles.imageWrap}>
          <img src={cardImageUrl(announcement.setId, announcement.cardNumber)} alt={announcement.cardName} className={styles.image} />
        </div>
        <div className={styles.status}>
          {announcement.keepInPlay ? "Marked as lasting effect (kept in play)." : "Discarded after cast."}
        </div>
        <button className={styles.button} onClick={onClose}>OK</button>
      </div>
    </div>
  )
}
