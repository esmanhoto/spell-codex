import { useBoard } from "../../context/BoardContext.tsx"
import { useMoves } from "../../context/MovesContext.tsx"
import { PhaseTracker } from "./PhaseTracker.tsx"
import styles from "./Divider.module.css"

export function Divider() {
  const { playerA, playerAName, playerBName, myPlayerId, winner, allBoards, handMaxSize } =
    useBoard()
  const { phase, turnNumber, activePlayer, legalMoves, onMove } = useMoves()
  const activeLabel = activePlayer === playerA ? playerAName : playerBName
  const isMyTurn = myPlayerId === activePlayer

  const endTurnMove = legalMoves.find((m) => m.type === "END_TURN")
  const myHand = myPlayerId ? (allBoards[myPlayerId]?.hand ?? []) : []
  const canEndTurn = myHand.length <= handMaxSize

  return (
    <div className={styles.divider}>
      <span className={`${styles.playerLabel} ${styles.playerB}`}>{playerBName}</span>
      <div className={styles.center}>
        {winner ? (
          <div className={styles.winner} data-testid="winner-info">
            {winner === playerA ? playerAName : playerBName} wins!
          </div>
        ) : (
          <PhaseTracker
            phase={phase}
            turnNumber={turnNumber}
            activePlayerName={activeLabel}
            isMyTurn={isMyTurn}
            endTurnMove={endTurnMove}
            onMove={onMove}
            canEndTurn={canEndTurn}
          />
        )}
      </div>
      <span className={`${styles.playerLabel} ${styles.playerA}`}>{playerAName}</span>
    </div>
  )
}
