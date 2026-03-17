import { useState, useEffect } from "react"
import { useBoard } from "../../context/BoardContext.tsx"
import { useMoves } from "../../context/MovesContext.tsx"
import { useGameUI } from "../../context/UIContext.tsx"
import type { PoolEntry as PoolEntryType, CardInfo } from "../../api.ts"
import { findHandCard } from "../../utils/card-helpers.ts"
import { resolveHandDropMove } from "../../utils/manual-actions.ts"
import { PoolEntry } from "./PoolEntry.tsx"
import { CardComponent } from "./CardComponent.tsx"
import styles from "./Pool.module.css"

export function Pool({
  entries,
  isOpponent,
  lingeringSpells,
  ownerId,
}: {
  entries: PoolEntryType[]
  isOpponent?: boolean
  lingeringSpells?: CardInfo[]
  ownerId?: string
}) {
  const { allBoards } = useBoard()
  const { legalMoves, onMove, phase } = useMoves()
  const { showWarning } = useGameUI()
  const [dragOver, setDragOver] = useState(false)

  // Clear dragOver when any drag ends or drop occurs.
  // Use capture phase for drop so it fires before stopPropagation in child handlers
  // (PoolEntry calls e.stopPropagation() which prevents Pool.onDrop from firing,
  // and dragend never reaches document when the source element is removed from DOM
  // by the optimistic state update before dragend can propagate).
  useEffect(() => {
    const clear = () => setDragOver(false)
    document.addEventListener("dragend", clear)
    document.addEventListener("drop", clear, true)
    return () => {
      document.removeEventListener("dragend", clear)
      document.removeEventListener("drop", clear, true)
    }
  }, [])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const id = e.dataTransfer.getData("drag-id")
    const card = findHandCard(allBoards, id)
    const move = resolveHandDropMove({
      legalMoves,
      cardInstanceId: id,
      target: { zone: "pool" },
    })
    if (move) {
      onMove(move)
      return
    }

    if (!card) {
      showWarning("That card cannot be placed in pool right now.")
      return
    }

    if (phase !== "POOL" && phase !== "PLAY_REALM") {
      showWarning(`Cannot place champion now. Current phase: ${phase.replaceAll("_", " ")}.`)
      return
    }

    const alreadyInPlay = Object.values(allBoards).some(
      (board) =>
        board.pool.some(
          (entry) => entry.champion.name === card.name && entry.champion.typeId === card.typeId,
        ) ||
        Object.values(board.formation).some(
          (slotState) =>
            !!slotState &&
            slotState.realm.name === card.name &&
            slotState.realm.typeId === card.typeId,
        ),
    )
    if (alreadyInPlay) {
      showWarning(
        `${card.name} is already in play. Rule of Cosmos blocks duplicate copies.`,
        "duplicate_in_game",
      )
      return
    }

    showWarning("Cannot place that card in pool right now.")
  }

  return (
    <div
      data-testid={ownerId ? `pool-${ownerId}` : undefined}
      className={`${styles.pool} ${dragOver ? styles.dragOver : ""}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
      }}
      onDrop={handleDrop}
    >
      <span className={styles.label}>
        Pool {dragOver && <span className={styles.dropHint}>- drop to place champion</span>}
      </span>
      <div className={styles.zoneWrap}>
        <div className={styles.row}>
          {entries.map((e) => (
            <PoolEntry
              key={e.champion.instanceId}
              entry={e}
              {...(isOpponent !== undefined ? { isOpponent } : {})}
            />
          ))}
        </div>
        <div data-testid={ownerId ? `lasting-spells-${ownerId}` : undefined}>
          <div className={`${styles.row} ${styles.rightAlign}`}>
            {(lingeringSpells ?? []).map((card) => (
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
