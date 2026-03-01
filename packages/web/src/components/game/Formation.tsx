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
  const { legalMoves, onMove, selectedId, onSelect, openContextMenu } = useGame()
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
              const toggleHoldingMove = s?.holdings.length
                ? legalMoves.find(m =>
                  m.type === "TOGGLE_HOLDING_REVEAL" &&
                  (m as { realmSlot: string }).realmSlot === slot
                )
                : undefined
              const tooltipCards = s ? [s.realm, ...s.holdings] : []
              const showHoldingStack = !!(s && s.holdings.length > 0 && s.holdingRevealedToAll)
              const holdingForStack = showHoldingStack ? s.holdings[0] : null

              return (
                <div
                  key={slot}
                  data-targeted-slot={attackedSlot === slot ? slot : undefined}
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
                  onContextMenu={toggleHoldingMove ? e => {
                    e.preventDefault()
                    openContextMenu(e.clientX, e.clientY, [{
                      label: s?.holdingRevealedToAll ? "Hide holding" : "Reveal holding",
                      move: toggleHoldingMove,
                    }])
                  } : undefined}
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
                        <CardTooltip cards={tooltipCards}>
                          <div className={styles.realmStack}>
                            {holdingForStack && (
                              <div className={styles.holdingPeekWrap}>
                                <img
                                  src={cardImageUrl(holdingForStack.setId, holdingForStack.cardNumber)}
                                  alt={holdingForStack.name}
                                  className={styles.holdingPeekImg}
                                  onError={e => { (e.target as HTMLImageElement).style.display = "none" }}
                                />
                              </div>
                            )}
                            <div className={styles.realmImgWrap}>
                              <img
                                src={cardImageUrl(s.realm.setId, s.realm.cardNumber)}
                                alt={s.realm.name}
                                className={styles.realmImg}
                                onError={e => { (e.target as HTMLImageElement).style.display = "none" }}
                              />
                            </div>
                          </div>
                        </CardTooltip>
                      )}
                      <span className={styles.realmName}>{s.realm.name}{s.isRazed ? " (razed)" : ""}</span>
                      {s.holdings.map(h => (
                        <span key={h.instanceId} className={styles.holding} title={h.description}>{h.name}</span>
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
