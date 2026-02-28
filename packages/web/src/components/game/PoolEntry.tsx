import { useState } from "react"
import { useGame } from "../../context/GameContext.tsx"
import type { PoolEntry as PoolEntryType } from "../../api.ts"
import type { ContextMenuAction } from "../../context/GameContext.tsx"
import { CardComponent } from "./CardComponent.tsx"
import styles from "./PoolEntry.module.css"

const STACK_OFFSET = 14

export function PoolEntry({ entry, isOpponent }: {
  entry:       PoolEntryType
  isOpponent?: boolean
}) {
  const { legalMoves, onMove, selectedId, onSelect, pendingEffects, responseWindow } = useGame()
  const [attachDragOver, setAttachDragOver] = useState(false)
  const hasPendingEffect = pendingEffects.length > 0 && !responseWindow

  const stackCards = [...entry.attachments, entry.champion]
  const n = stackCards.length

  function handleAttachDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setAttachDragOver(false)
    const id = e.dataTransfer.getData("drag-id")
    const move = legalMoves.find(m =>
      m.type === "ATTACH_ITEM" &&
      (m as { cardInstanceId: string; championId: string }).cardInstanceId === id &&
      (m as { cardInstanceId: string; championId: string }).championId === entry.champion.instanceId
    )
    if (move) onMove(move)
  }

  return (
    <div
      className={`${styles.entry} ${attachDragOver ? styles.dragOver : ""}`}
      onDragOver={e => { e.preventDefault(); setAttachDragOver(true) }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAttachDragOver(false) }}
      onDrop={handleAttachDrop}
    >
      <div
        className={styles.stack}
        style={{
          width:  `${100 + (n - 1) * STACK_OFFSET}px`,
          height: `${140 + (n - 1) * STACK_OFFSET}px`,
        }}
      >
        {stackCards.map((c, i) => {
          const isChampion = c.instanceId === entry.champion.instanceId
          const contextActions: ContextMenuAction[] = []

          if (!isOpponent) {
            contextActions.push({ label: "Discard",       move: { type: "MANUAL_DISCARD",  cardInstanceId: c.instanceId } })
            contextActions.push({ label: "To Abyss",      move: { type: "MANUAL_TO_ABYSS", cardInstanceId: c.instanceId } })
            if (isChampion) {
              contextActions.push({ label: "Send to Limbo", move: { type: "MANUAL_TO_LIMBO", cardInstanceId: c.instanceId } })
            }
          } else if (hasPendingEffect) {
            contextActions.push({ label: "Discard (opponent)",  move: { type: "MANUAL_AFFECT_OPPONENT", cardInstanceId: c.instanceId, action: "discard" } })
            contextActions.push({ label: "To Abyss (opponent)", move: { type: "MANUAL_AFFECT_OPPONENT", cardInstanceId: c.instanceId, action: "to_abyss" } })
            if (isChampion) {
              contextActions.push({ label: "Limbo (opponent)", move: { type: "MANUAL_AFFECT_OPPONENT", cardInstanceId: c.instanceId, action: "to_limbo" } })
            }
          }

          return (
            <div
              key={c.instanceId}
              className={styles.stackCard}
              style={{ top: `${i * STACK_OFFSET}px`, left: `${i * STACK_OFFSET}px`, zIndex: i }}
            >
              <CardComponent
                card={c}
                selected={selectedId === c.instanceId}
                onClick={() => onSelect(selectedId === c.instanceId ? null : c.instanceId)}
                showLabel={false}
                draggable={isChampion && !isOpponent}
                dragSource="pool"
                contextActions={contextActions.length ? contextActions : undefined}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
