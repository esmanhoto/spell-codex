import { useMoves } from "../../context/MovesContext.tsx"
import { useBoard } from "../../context/BoardContext.tsx"
import { useGameUI } from "../../context/UIContext.tsx"
import styles from "./DrawPile.module.css"

export function DrawPile({
  count,
  disabled = false,
  handCount,
}: {
  count: number
  disabled?: boolean
  handCount: number
}) {
  const { legalMoves, onMove, activePlayer } = useMoves()
  const { handMaxSize, myPlayerId, playerBName } = useBoard()
  const { openContextMenu, showWarning } = useGameUI()

  function handleClick() {
    if (disabled) return
    const passMove = legalMoves.find((m) => m.type === "PASS")
    if (passMove) {
      onMove(passMove)
      return
    }
    // Not your turn — show whose turn it is
    if (activePlayer && activePlayer !== myPlayerId) {
      const opponentName = playerBName
      showWarning(`It's ${opponentName || "your opponent"}'s turn.`)
    }
  }

  function handleContextMenu(e: React.MouseEvent) {
    if (disabled) return
    e.preventDefault()

    const actions = []

    // Info item — no action, clicking closes menu
    actions.push({ label: `Hand: ${handCount} / ${handMaxSize} cards` })

    const passMove = legalMoves.find((m) => m.type === "PASS")
    if (passMove) {
      actions.push({ label: "Draw cards", move: passMove })
    }

    const spoilMove = legalMoves.find((m) => m.type === "CLAIM_SPOIL")
    if (spoilMove) {
      actions.push({ label: "Claim spoil of combat ★", move: spoilMove })
    }

    openContextMenu(e.clientX, e.clientY, actions)
  }

  return (
    <div>
      <div
        className={styles.pile}
        title={`${count} cards in draw pile`}
        data-testid={disabled ? "draw-pile-opponent" : "draw-pile-self"}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <div className={styles.cardBack} />
        <div className={styles.cardBack} />
        <div className={styles.cardBack} />
        <div className={styles.count}>{count}</div>
      </div>
      <div className={styles.label}>Draw ({count})</div>
    </div>
  )
}
