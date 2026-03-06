import { useState } from "react"
import { useGame } from "../../context/GameContext.tsx"
import type { PoolEntry as PoolEntryType, CardInfo } from "../../api.ts"
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
  const { legalMoves, onMove, allBoards, phase, showWarning } = useGame()
  const [dragOver, setDragOver] = useState(false)

  function findDraggedHandCard(instanceId: string) {
    for (const board of Object.values(allBoards)) {
      const c = board.hand.find((card) => card.instanceId === instanceId)
      if (c) return c
    }
    return undefined
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const id = e.dataTransfer.getData("drag-id")
    const card = findDraggedHandCard(id)
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
      onDragLeave={() => setDragOver(false)}
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
          <div className={styles.row}>
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
