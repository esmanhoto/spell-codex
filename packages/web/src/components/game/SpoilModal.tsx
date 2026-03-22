import { useMemo } from "react"
import type { CardInfo, Move } from "../../api.ts"
import { modalStyles as base } from "./Modal.tsx"
import { CardTooltip } from "./CardTooltip.tsx"
import { cardImageUrl } from "../../utils/card-helpers.ts"
import styles from "./SpoilModal.module.css"

export function SpoilModal({
  card,
  legalMoves,
  onMove,
}: {
  card: CardInfo
  legalMoves: Move[]
  onMove: (m: Move) => void
}) {
  const spoilPlays = useMemo(
    () => legalMoves.filter((m) => m.type === "SPOIL_PLAY") as Array<Extract<Move, { type: "SPOIL_PLAY" }>>,
    [legalMoves],
  )

  const canPlay = spoilPlays.length > 0

  return (
    <div className={base.backdrop}>
      <div className={base.modal}>
        <div className={base.title}>Spoils of Victory</div>
        <div className={styles.content}>
          <CardTooltip card={card}>
            <img
              src={cardImageUrl(card.setId, card.cardNumber)}
              alt={card.name}
              className={styles.cardImage}
            />
          </CardTooltip>
          <div className={styles.cardName}>{card.name}</div>
          <div className={styles.actions}>
            <button className={base.button} onClick={() => onMove({ type: "SPOIL_KEEP" })}>
              Keep in Hand
            </button>
            <button className={base.button} onClick={() => onMove({ type: "SPOIL_RETURN" })}>
              Return to Draw Pile
            </button>
          </div>
          {canPlay && (
            <div className={styles.playSection}>
              <div className={styles.playLabel}>Play Now</div>
              <div className={styles.playOptions}>
                {spoilPlays.map((m, i) => (
                  <button
                    key={i}
                    className={base.button}
                    onClick={() => onMove(m)}
                  >
                    {spoilPlayLabel(m, card)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function spoilPlayLabel(move: Extract<Move, { type: "SPOIL_PLAY" }>, card: CardInfo): string {
  if (move.slot) {
    const typeLabel = card.typeId === 13 ? "Realm" : "Holding"
    return `${typeLabel} in slot ${move.slot}`
  }
  if (move.championId) return `Attach to champion`
  return "Play"
}
