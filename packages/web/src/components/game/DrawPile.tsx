import { useEffect, useState } from "react"
import { useGame } from "../../context/GameContext.tsx"
import styles from "./DrawPile.module.css"

export function DrawPile({ count, disabled = false }: { count: number; disabled?: boolean }) {
  const { legalMoves, onMove, playMode, manualSettings } = useGame()
  const [showInput, setShowInput] = useState(false)
  const [drawCount, setDrawCount] = useState(String(manualSettings.drawCount))

  const drawMove = legalMoves.find(m => m.type === "MANUAL_DRAW_CARDS")

  useEffect(() => {
    setDrawCount(String(manualSettings.drawCount))
  }, [manualSettings.drawCount])

  function handleClick() {
    if (disabled) return
    if (playMode === "full_manual") {
      onMove({ type: "MANUAL_DRAW_CARDS", count: manualSettings.drawCount })
      return
    }
    // Default left-click: draw via the standard draw mechanism (PASS in draw phase)
    const passMove = legalMoves.find(m => m.type === "PASS")
    if (passMove) onMove(passMove)
  }

  function handleContextMenu(e: React.MouseEvent) {
    if (disabled) return
    e.preventDefault()
    if (drawMove) setShowInput(v => !v)
  }

  function submitDraw() {
    const n = parseInt(drawCount, 10)
    const value = !isNaN(n) && n > 0 ? n : manualSettings.drawCount
    onMove({ type: "MANUAL_DRAW_CARDS", count: value })
    setShowInput(false)
    setDrawCount(String(manualSettings.drawCount))
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
