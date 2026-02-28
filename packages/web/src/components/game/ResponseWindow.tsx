import { useGame } from "../../context/GameContext.tsx"
import styles from "./ResponseWindow.module.css"

export function ResponseWindowOverlay() {
  const { responseWindow, myPlayerId, allBoards, onMove } = useGame()

  if (!responseWindow) return null

  const isResponder = responseWindow.respondingPlayerId === myPlayerId
  const eventCards = isResponder
    ? (allBoards[myPlayerId]?.hand ?? []).filter(c => c.typeId === 18)
    : []

  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        <span><strong>{responseWindow.effectCardName}</strong></span>
        {isResponder
          ? <span className={styles.label}> — Counter or accept?</span>
          : <span className={styles.label}> — Waiting for opponent to respond...</span>
        }
      </div>
      {responseWindow.effectCardDescription && (
        <p className={styles.text}>{responseWindow.effectCardDescription}</p>
      )}
      {isResponder && (
        <div className={styles.actions}>
          {eventCards.length > 0 && (
            <div>
              <span className={styles.counterLabel}>Counter with event:</span>
              <div className={styles.buttons}>
                {eventCards.map(c => (
                  <button
                    key={c.instanceId}
                    className={styles.actionBtn}
                    onClick={() => onMove({ type: "PLAY_EVENT", cardInstanceId: c.instanceId })}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            className={styles.passBtn}
            onClick={() => onMove({ type: "PASS_RESPONSE" })}
            style={{ marginTop: eventCards.length > 0 ? 8 : 0 }}
          >
            Pass (accept effect)
          </button>
        </div>
      )}
    </div>
  )
}
