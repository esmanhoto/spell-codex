import { useGame } from "../../context/GameContext.tsx"
import { PhaseTracker } from "./PhaseTracker.tsx"
import { ManualControls } from "./ManualControls.tsx"
import styles from "./Divider.module.css"

export function Divider() {
  const { playerA, phase, turnNumber, winner, activePlayer, playMode } = useGame()
  const activeLabel = activePlayer === playerA ? "Player A" : "Player B"

  // console.log("Phase is", phase)

  return (
    <div className={styles.divider}>
      <span className={`${styles.playerLabel} ${styles.playerB}`}>Player B</span>
      <div className={styles.center}>
        <div className={styles.turnInfo} data-testid="turn-info">
          Turn {turnNumber}
        </div>
        {winner ? (
          <div className={styles.winner} data-testid="winner-info">
            {winner === playerA ? "Player A" : "Player B"} wins!
          </div>
        ) : (
          <>
            <PhaseTracker phase={phase} />
            <div className={styles.activeLabel} data-testid="active-player-label">
              Active: {activeLabel}
            </div>
            <div className={styles.modeLabel} data-testid="play-mode-label">
              Mode: {playMode === "full_manual" ? "Full Manual" : "Semi Auto"}
            </div>
            <ManualControls />
          </>
        )}
      </div>
      <span className={`${styles.playerLabel} ${styles.playerA}`}>Player A</span>
    </div>
  )
}
