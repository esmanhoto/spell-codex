import { useState } from "react"
import { useGame } from "../../context/GameContext.tsx"
import styles from "./DrawPile.module.css"

export function DrawPile({ count }: { count: number }) {
  const { legalMoves, onMove } = useGame()
  const [showInput, setShowInput] = useState(false)
  const [drawCount, setDrawCount] = useState("3")

  const drawMove = legalMoves.find(m => m.type === "MANUAL_DRAW_CARDS")

  function handleClick() {
    // Default left-click: draw via the standard draw mechanism (PASS in draw phase)
    const passMove = legalMoves.find(m => m.type === "PASS")
    if (passMove) onMove(passMove)
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    if (drawMove) setShowInput(v => !v)
  }

  function submitDraw() {
    const n = parseInt(drawCount, 10)
    if (!isNaN(n) && n > 0) {
      onMove({ type: "MANUAL_DRAW_CARDS", count: n })
      setShowInput(false)
      setDrawCount("3")
    }
  }

  return (
    <div>
      <div
        className={styles.pile}
        title={`${count} cards in draw pile`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <div className={styles.cardBack} />
        <div className={styles.cardBack} />
        <div className={styles.cardBack} />
        <div className={styles.count}>{count}</div>
      </div>
      <div className={styles.label}>Draw ({count})</div>
      {showInput && (
        <div className={styles.drawInput}>
          <input
            type="number"
            min={1}
            value={drawCount}
            onChange={e => setDrawCount(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submitDraw()}
            autoFocus
          />
          <button onClick={submitDraw}>Draw</button>
        </div>
      )}
    </div>
  )
}
