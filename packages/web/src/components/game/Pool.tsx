import { useState } from "react"
import { useGame } from "../../context/GameContext.tsx"
import type { PoolEntry as PoolEntryType, CardInfo } from "../../api.ts"
import { PoolEntry } from "./PoolEntry.tsx"
import { CardComponent } from "./CardComponent.tsx"
import styles from "./Pool.module.css"

export function Pool({ entries, isOpponent, lingeringSpells, ownerId }: {
  entries:     PoolEntryType[]
  isOpponent?: boolean
  lingeringSpells?: CardInfo[]
  ownerId?: string
}) {
  const { legalMoves, onMove, allBoards, phase, showWarning } = useGame()
  const [dragOver, setDragOver] = useState(false)

  function findDraggedHandCard(instanceId: string) {
    for (const board of Object.values(allBoards)) {
      const c = board.hand.find(card => card.instanceId === instanceId)
      if (c) return c
    }
    return undefined
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const id = e.dataTransfer.getData("drag-id")
    const move = legalMoves.find(m => m.type === "PLACE_CHAMPION" && (m as { cardInstanceId: string }).cardInstanceId === id)
    if (move) {
      onMove(move)
      return
    }

    const card = findDraggedHandCard(id)
    if (!card) {
      showWarning("That card cannot be placed in pool right now.")
      return
    }

    if (phase !== "POOL" && phase !== "PLAY_REALM") {
      showWarning(`Cannot place champion now. Current phase: ${phase.replaceAll("_", " ")}.`)
      return
    }

    const alreadyInPlay = Object.values(allBoards).some(board =>
      board.pool.some(entry => entry.champion.name === card.name && entry.champion.typeId === card.typeId) ||
      Object.values(board.formation).some(slotState => !!slotState && slotState.realm.name === card.name && slotState.realm.typeId === card.typeId),
    )
    if (alreadyInPlay) {
      showWarning(`${card.name} is already in play. Rule of Cosmos blocks duplicate copies.`)
      return
    }

    showWarning("Cannot place that card in pool right now.")
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
      <div className={styles.zoneWrap}>
        <div className={styles.zoneBlock}>
          <span className={styles.zoneLabel}>Champions</span>
          <div className={styles.row}>
            {entries.map(e => (
              <PoolEntry key={e.champion.instanceId} entry={e} isOpponent={isOpponent} />
            ))}
          </div>
        </div>
        <div className={styles.zoneBlock} data-testid={ownerId ? `lasting-spells-${ownerId}` : undefined}>
          <span className={styles.zoneLabel}>Lasting Spells</span>
          <div className={styles.row}>
            {(lingeringSpells ?? []).map(card => (
              <CardComponent
                key={card.instanceId}
                card={card}
                selected={false}
                showLabel={false}
                className={styles.lingeringCard}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
