import { useState } from "react"
import { useGame } from "../../context/GameContext.tsx"
import type { SlotState } from "../../api.ts"
import { cardImageUrl } from "../../utils/card-helpers.ts"
import { CardTooltip } from "./CardTooltip.tsx"
import styles from "./Formation.module.css"

const ROWS = [["A"], ["B", "C"], ["D", "E", "F"]]

export function Formation({ slots, formationOwnerId, isOpponent, attackedSlot }: {
  slots:             Record<string, SlotState | null>
  formationOwnerId:  string
  isOpponent:        boolean
  attackedSlot?:     string
}) {
  const { legalMoves, onMove, selectedId, onSelect } = useGame()
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null)

  function handleSlotDrop(e: React.DragEvent, slot: string) {
    e.preventDefault()
    setDragOverSlot(null)
    const id     = e.dataTransfer.getData("drag-id")
    const source = e.dataTransfer.getData("drag-source")
    if (!id) return

    if (source === "hand") {
      const realmMove = legalMoves.find(m =>
        m.type === "PLAY_REALM" &&
        (m as { cardInstanceId: string; slot: string }).cardInstanceId === id &&
        (m as { cardInstanceId: string; slot: string }).slot === slot
      )
      if (realmMove) { onMove(realmMove); return }

      const holdingMove = legalMoves.find(m =>
        m.type === "PLAY_HOLDING" &&
        (m as { cardInstanceId: string; realmSlot: string }).cardInstanceId === id &&
        (m as { cardInstanceId: string; realmSlot: string }).realmSlot === slot
      )
      if (holdingMove) { onMove(holdingMove); return }
    }

    if (source === "pool") {
      const attackMove = legalMoves.find(m =>
        m.type === "DECLARE_ATTACK" &&
        (m as { championId: string; targetRealmSlot: string; targetPlayerId: string }).championId === id &&
        (m as { championId: string; targetRealmSlot: string; targetPlayerId: string }).targetRealmSlot === slot &&
        (m as { championId: string; targetRealmSlot: string; targetPlayerId: string }).targetPlayerId === formationOwnerId
      )
      if (attackMove) { onMove(attackMove); return }
    }
  }

  const displayRows = isOpponent ? [...ROWS].reverse() : ROWS;

  return (
    <div className={styles.formation}>
      <span className={styles.label}>Formation</span>
      <div className={styles.pyramid}>
        {displayRows.map((row, ri) => (
          <div key={ri} className={styles.row}>
            {row.map(slot => {
              const s = slots[slot]
              const isSelected  = !!s && selectedId === s.realm.instanceId
              const isDragTarget = dragOverSlot === slot

              return (
                <div
                  key={slot}
                  className={[
                    styles.slot,
                    s ? (s.isRazed ? styles.razed : styles.filled) : styles.empty,
                    isSelected ? styles.selected : "",
                    isDragTarget ? styles.dragOver : "",
                    attackedSlot === slot ? styles.targeted : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => s && onSelect(isSelected ? null : s.realm.instanceId)}
                  onDragOver={e => { e.preventDefault(); setDragOverSlot(slot) }}
                  onDragLeave={() => setDragOverSlot(null)}
                  onDrop={e => handleSlotDrop(e, slot)}
                >
                  <span className={styles.slotLabel}>{slot}</span>
                  {s ? (
                    <>
                      {s.isRazed ? (
                        <div className={styles.cardBackWrap} title={`${s.realm.name} (razed)`}>
                          <img
                            src="/api/cards/cardback.jpg"
                            alt="Razed"
                            className={styles.cardBackImg}
                          />
                        </div>
                      ) : (
                        <CardTooltip card={s.realm}>
                          <div className={styles.realmImgWrap}>
                            <img
                              src={cardImageUrl(s.realm.setId, s.realm.cardNumber)}
                              alt={s.realm.name}
                              className={styles.realmImg}
                              onError={e => { (e.target as HTMLImageElement).style.display = "none" }}
                            />
                          </div>
                        </CardTooltip>
                      )}
                      <span className={styles.realmName}>{s.realm.name}{s.isRazed ? " (razed)" : ""}</span>
                      {s.holdings.map(h => (
                        isOpponent
                          ? <span key={h.instanceId} className={styles.holding}>Holding</span>
                          : <span key={h.instanceId} className={styles.holding} title={h.description}>{h.name}</span>
                      ))}
                    </>
                  ) : (
                    <span className={styles.emptyLabel}>empty</span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
