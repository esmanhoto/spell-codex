import { useState } from "react"
import { useMoves } from "../../context/MovesContext.tsx"
import { useBoard } from "../../context/BoardContext.tsx"
import { useGameUI } from "../../context/UIContext.tsx"
import { DrawPileModal } from "./DrawPileModal.tsx"
import styles from "./DrawPile.module.css"

export function DrawPile({
  count,
  disabled = false,
}: {
  count: number
  disabled?: boolean
}) {
  const { legalMoves, onMove, activePlayer } = useMoves()
  const { handMaxSize, myPlayerId, playerBName } = useBoard()
  const { openContextMenu, showWarning } = useGameUI()
  const [drawExtraOpen, setDrawExtraOpen] = useState(false)
  const [changeHandSizeOpen, setChangeHandSizeOpen] = useState(false)

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

    const passMove = legalMoves.find((m) => m.type === "PASS")
    if (passMove) {
      actions.push({ label: "Draw cards", move: passMove })
    }

    const spoilMove = legalMoves.find((m) => m.type === "CLAIM_SPOIL")
    if (spoilMove) {
      actions.push({ label: "Claim spoil of combat \u2605", move: spoilMove })
    }

    actions.push({ label: "Draw extra cards", action: () => setDrawExtraOpen(true) })
    actions.push({ label: "Change hand size", action: () => setChangeHandSizeOpen(true) })

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

      {drawExtraOpen && (
        <DrawPileModal
          title="Draw Extra Cards"
          initialValue={1}
          actionLabel="Draw"
          onConfirm={(n) => {
            onMove({ type: "DRAW_EXTRA_CARDS", count: n })
            setDrawExtraOpen(false)
          }}
          onClose={() => setDrawExtraOpen(false)}
        />
      )}
      {changeHandSizeOpen && (
        <DrawPileModal
          title="Change Hand Size"
          initialValue={handMaxSize}
          actionLabel="Change"
          onConfirm={(n) => {
            onMove({ type: "CHANGE_HAND_SIZE", newSize: n })
            setChangeHandSizeOpen(false)
          }}
          onClose={() => setChangeHandSizeOpen(false)}
        />
      )}
    </div>
  )
}
