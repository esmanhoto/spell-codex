import { useEffect, useState } from "react"
import { useGame } from "../../context/GameContext.tsx"
import styles from "./ManualControls.module.css"

export function ManualControls() {
  const { playerA, playerB, activePlayer, playMode, manualSettings, winner, onMove } = useGame()
  const [drawCount, setDrawCount] = useState(String(manualSettings.drawCount))
  const [maxHand, setMaxHand] = useState(String(manualSettings.maxHandSize))

  useEffect(() => {
    setDrawCount(String(manualSettings.drawCount))
    setMaxHand(String(manualSettings.maxHandSize))
  }, [manualSettings.drawCount, manualSettings.maxHandSize])

  if (winner) return null

  return (
    <div className={styles.wrap} data-testid="manual-controls">
      <div className={styles.row}>
        <button
          className={`${styles.btn} ${playMode === "full_manual" ? styles.active : ""}`}
          onClick={() => onMove({ type: "SET_PLAY_MODE", mode: "full_manual" })}
        >
          Full Manual
        </button>
        <button
          className={`${styles.btn} ${playMode === "semi_auto" ? styles.active : ""}`}
          onClick={() => onMove({ type: "SET_PLAY_MODE", mode: "semi_auto" })}
        >
          Semi Auto
        </button>
      </div>

      {playMode === "full_manual" && (
        <>
          <div className={styles.row}>
            <button className={styles.btn} onClick={() => onMove({ type: "END_TURN" })}>
              End Turn
            </button>
            <button
              className={`${styles.btn} ${activePlayer === playerA ? styles.active : ""}`}
              onClick={() => onMove({ type: "MANUAL_SET_ACTIVE_PLAYER", playerId: playerA })}
            >
              Active: A
            </button>
            <button
              className={`${styles.btn} ${activePlayer === playerB ? styles.active : ""}`}
              onClick={() => onMove({ type: "MANUAL_SET_ACTIVE_PLAYER", playerId: playerB })}
            >
              Active: B
            </button>
          </div>

          <div className={styles.row}>
            <label className={styles.label}>
              Draw
              <input
                type="number"
                min={1}
                max={20}
                value={drawCount}
                onChange={(e) => setDrawCount(e.target.value)}
              />
            </label>
            <button
              className={styles.btn}
              onClick={() =>
                onMove({
                  type: "MANUAL_SET_DRAW_COUNT",
                  count: Number(drawCount) || manualSettings.drawCount,
                })
              }
            >
              Set
            </button>
            <label className={styles.label}>
              Hand Limit
              <input
                type="number"
                min={0}
                max={30}
                value={maxHand}
                onChange={(e) => setMaxHand(e.target.value)}
              />
            </label>
            <button
              className={styles.btn}
              onClick={() =>
                onMove({
                  type: "MANUAL_SET_MAX_HAND_SIZE",
                  size: Number(maxHand) || manualSettings.maxHandSize,
                })
              }
            >
              Set
            </button>
          </div>
        </>
      )}
    </div>
  )
}
