import { useGame } from "../../context/GameContext.tsx"
import styles from "./DrawPile.module.css"

export function DrawPile({ count, disabled = false }: { count: number; disabled?: boolean }) {
  const { legalMoves, onMove } = useGame()

  function handleClick() {
    if (disabled) return
    const passMove = legalMoves.find((m) => m.type === "PASS")
    if (passMove) onMove(passMove)
  }

  return (
    <div>
      <div
        className={styles.pile}
        title={`${count} cards in draw pile`}
        data-testid={disabled ? "draw-pile-opponent" : "draw-pile-self"}
        onClick={handleClick}
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
