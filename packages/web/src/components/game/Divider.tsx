import { useGame } from "../../context/GameContext.tsx"
import { PhaseTracker } from "./PhaseTracker.tsx"
import styles from "./Divider.module.css"

export function Divider() {
  const {
    playerA,
    myPlayerId,
    phase,
    turnNumber,
    winner,
    activePlayer,
    legalMoves,
    onMove,
    allBoards,
    handMaxSize,
  } = useGame()
  const activeLabel = activePlayer === playerA ? "Player A" : "Player B"
  const isMyTurn = myPlayerId === activePlayer

  const endTurnMove = legalMoves.find((m) => m.type === "END_TURN")
  const myHand = myPlayerId ? (allBoards[myPlayerId]?.hand ?? []) : []
  const canEndTurn = myHand.length <= handMaxSize

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
            {isMyTurn && (
              <button
                className={styles.passBtn}
                data-testid="pass-btn"
                data-move-type="END_TURN"
                disabled={!canEndTurn || !endTurnMove}
                onClick={() => endTurnMove && onMove(endTurnMove)}
              >
                End Turn
              </button>
            )}
          </>
        )}
      </div>
      <span className={`${styles.playerLabel} ${styles.playerA}`}>Player A</span>
    </div>
  )
}
