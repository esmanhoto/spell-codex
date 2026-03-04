import { useState } from "react"
import { useGame } from "../../context/GameContext.tsx"
import type { PoolEntry as PoolEntryType } from "../../api.ts"
import type { ContextMenuAction } from "../../context/GameContext.tsx"
import { isSpellCard } from "../../utils/spell-casting.ts"
import { resolveHandDropMove, showModeAwareWarning } from "../../utils/manual-actions.ts"
import { CardComponent } from "./CardComponent.tsx"
import styles from "./PoolEntry.module.css"

const STACK_OFFSET = 14
const WORLD_WILDCARD = new Set([0, 9])

export function PoolEntry({ entry, isOpponent }: {
  entry:       PoolEntryType
  isOpponent?: boolean
}) {
  const {
    legalMoves, onMove, selectedId, onSelect,
    allBoards, phase, showWarning, requestSpellCast, playMode,
  } = useGame()
  const [attachDragOver, setAttachDragOver] = useState(false)

  const stackCards = [...entry.attachments, entry.champion]
  const n = stackCards.length

  function findDraggedHandCard(instanceId: string) {
    for (const board of Object.values(allBoards)) {
      const c = board.hand.find(card => card.instanceId === instanceId)
      if (c) return c
    }
    return undefined
  }

  function handleAttachDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setAttachDragOver(false)
    const id = e.dataTransfer.getData("drag-id")
    const move = resolveHandDropMove({
      playMode,
      legalMoves,
      cardInstanceId: id,
      target: {
        zone: "champion",
        owner: isOpponent ? "opponent" : "self",
        championId: entry.champion.instanceId,
      },
    })
    if (move) {
      onMove(move)
      return
    }

    const card = findDraggedHandCard(id)
    if (!card) {
      showWarning("That card cannot be attached right now.")
      return
    }
    if (playMode !== "full_manual" && isSpellCard(card)) {
      requestSpellCast(card.instanceId, {
        cardInstanceId: entry.champion.instanceId,
        owner: isOpponent ? "opponent" : "self",
      })
      return
    }

    const worldsCompatible =
      WORLD_WILDCARD.has(card.worldId) ||
      WORLD_WILDCARD.has(entry.champion.worldId) ||
      card.worldId === entry.champion.worldId
    if ((card.typeId === 9 || card.typeId === 2) && !worldsCompatible) {
      showWarning(
        `${card.name} world mismatches champion ${entry.champion.name}.`,
        "world_mismatch_attachment",
      )
      return
    }

    if (phase !== "POOL" && phase !== "PLAY_REALM") {
      showModeAwareWarning({
        playMode,
        showWarning,
        semiAutoMessage: `Cannot attach item now. Current phase: ${phase.replaceAll("_", " ")}.`,
      })
      return
    }
    showWarning(`Cannot attach ${card.name} to ${entry.champion.name}.`)
  }

  function handleSpellDropOnCard(e: React.DragEvent, targetCardInstanceId: string) {
    const source = e.dataTransfer.getData("drag-source")
    if (source !== "hand") return

    const cardId = e.dataTransfer.getData("drag-id")
    const card = findDraggedHandCard(cardId)
    if (!card || !isSpellCard(card)) return

    e.preventDefault()
    e.stopPropagation()
    setAttachDragOver(false)
    requestSpellCast(card.instanceId, {
      cardInstanceId: targetCardInstanceId,
      owner: isOpponent ? "opponent" : "self",
    })
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
          } else {
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
              onDragOver={e => {
                const source = e.dataTransfer.getData("drag-source")
                if (source === "hand") e.preventDefault()
              }}
              onDrop={e => handleSpellDropOnCard(e, c.instanceId)}
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
