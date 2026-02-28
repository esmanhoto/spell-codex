import { useState } from "react"
import { useGame } from "../../context/GameContext.tsx"
import type { PoolEntry as PoolEntryType } from "../../api.ts"
import { PoolEntry } from "./PoolEntry.tsx"
import styles from "./Pool.module.css"

export function Pool({ entries, isOpponent }: {
  entries:     PoolEntryType[]
  isOpponent?: boolean
}) {
  const { legalMoves, onMove } = useGame()
  const [dragOver, setDragOver] = useState(false)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const id = e.dataTransfer.getData("drag-id")
    const move = legalMoves.find(m => m.type === "PLACE_CHAMPION" && (m as { cardInstanceId: string }).cardInstanceId === id)
    if (move) onMove(move)
  }

  return (
    <div
      className={`${styles.pool} ${dragOver ? styles.dragOver : ""}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <span className={styles.label}>
        Pool {dragOver && <span className={styles.dropHint}>- drop to place champion</span>}
      </span>
      <div className={styles.row}>
        {entries.map(e => (
          <PoolEntry key={e.champion.instanceId} entry={e} isOpponent={isOpponent} />
        ))}
      </div>
    </div>
  )
}
