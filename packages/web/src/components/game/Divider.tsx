import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useBoard } from "../../context/BoardContext.tsx"
import { useMoves } from "../../context/MovesContext.tsx"
import { PhaseTracker } from "./PhaseTracker.tsx"
import { VictoryModal } from "./VictoryModal.tsx"
import styles from "./Divider.module.css"

export function Divider() {
  const { playerA, playerAName, playerBName, myPlayerId, winner, allBoards, handMaxSize } =
    useBoard()
  const { phase, turnNumber, activePlayer, legalMoves, onMove } = useMoves()
  const activeLabel = activePlayer === playerA ? playerAName : playerBName
  const isMyTurn = myPlayerId === activePlayer
  const navigate = useNavigate()
  const [showVictory, setShowVictory] = useState(true)

  const endTurnMove = legalMoves.find((m) => m.type === "END_TURN")
  const myHand = myPlayerId ? (allBoards[myPlayerId]?.hand ?? []) : []
  const canEndTurn = myHand.length <= handMaxSize

  const winnerName = winner ? (winner === playerA ? playerAName : playerBName) : null

  return (
    <>
      <div className={styles.divider}>
        <span className={`${styles.playerLabel} ${styles.playerB}`}>{playerBName}</span>
        <div className={styles.center}>
          {winner ? (
            <div className={styles.winner} data-testid="winner-info">
              {winnerName} wins!
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
      {winner && showVictory && (
        <VictoryModal
          winnerName={winnerName!}
          onClose={() => setShowVictory(false)}
          onBackToLobby={() => navigate("/")}
        />
      )}
    </>
  )
}
