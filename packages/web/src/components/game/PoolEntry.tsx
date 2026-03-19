import { useState, useEffect } from "react"
import { useBoard } from "../../context/BoardContext.tsx"
import { useCombat } from "../../context/CombatContext.tsx"
import { useMoves } from "../../context/MovesContext.tsx"
import { useGameUI } from "../../context/UIContext.tsx"
import type { PoolEntry as PoolEntryType } from "../../api.ts"
import type { ContextMenuAction } from "../../context/types.ts"
import { findHandCard } from "../../utils/card-helpers.ts"
import { isSpellCard } from "../../utils/spell-casting.ts"
import { resolveHandDropMove } from "../../utils/manual-actions.ts"
import { CardComponent } from "./CardComponent.tsx"
import styles from "./PoolEntry.module.css"

const STACK_OFFSET = 14
const WORLD_WILDCARD = new Set([0, 9])

export function PoolEntry({ entry, isOpponent }: { entry: PoolEntryType; isOpponent?: boolean }) {
  const { allBoards } = useBoard()
  const { combat } = useCombat()
  const { legalMoves, onMove, phase } = useMoves()
  const { selectedId, onSelect, showWarning, requestSpellCast, openTargetPicker } = useGameUI()
  const [attachDragOver, setAttachDragOver] = useState(false)

  const championInCombat = !!(
    combat &&
    (combat.attacker?.instanceId === entry.champion.instanceId ||
      combat.defender?.instanceId === entry.champion.instanceId)
  )

  useEffect(() => {
    const clear = () => setAttachDragOver(false)
    document.addEventListener("dragend", clear)
    document.addEventListener("drop", clear, true)
    return () => {
      document.removeEventListener("dragend", clear)
      document.removeEventListener("drop", clear, true)
    }
  }, [])

  const stackCards = [...entry.attachments, entry.champion]
  const n = stackCards.length

  function handleAttachDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setAttachDragOver(false)
    const id = e.dataTransfer.getData("drag-id")
    const card = findHandCard(allBoards, id)
    const move = resolveHandDropMove({
      legalMoves,
      cardInstanceId: id,
      target: {
        zone: "champion",
        owner: isOpponent ? "opponent" : "self",
        championId: entry.champion.instanceId,
      },
    })
    const worldsCompatible = card
      ? WORLD_WILDCARD.has(card.worldId) ||
        WORLD_WILDCARD.has(entry.champion.worldId) ||
        card.worldId === entry.champion.worldId
      : true
    const hasWorldMismatch = !!card && (card.typeId === 9 || card.typeId === 2) && !worldsCompatible

    if (move) {
      onMove(move)
      return
    }

    if (!card) {
      showWarning("That card cannot be attached right now.")
      return
    }
    if (isSpellCard(card)) {
      requestSpellCast(card.instanceId, {
        cardInstanceId: entry.champion.instanceId,
        owner: isOpponent ? "opponent" : "self",
      })
      return
    }

    if (hasWorldMismatch) {
      showWarning(
        `${card.name} world mismatches champion ${entry.champion.name}.`,
        "world_mismatch_attachment",
      )
      return
    }

    if (phase !== "POOL" && phase !== "PLAY_REALM") {
      showWarning(`Cannot attach item now. Current phase: ${phase.replaceAll("_", " ")}.`)
      return
    }
    showWarning(`Cannot attach ${card.name} to ${entry.champion.name}.`)
  }

  function handleSpellDropOnCard(e: React.DragEvent, targetCardInstanceId: string) {
    const source = e.dataTransfer.getData("drag-source")
    if (source !== "hand") return

    const cardId = e.dataTransfer.getData("drag-id")
    const card = findHandCard(allBoards, cardId)
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
      className={`${styles.entry} ${attachDragOver ? styles.dragOver : ""} ${championInCombat ? styles.inCombat : ""}`}
      onDragOver={(e) => {
        e.preventDefault()
        setAttachDragOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setAttachDragOver(false)
      }}
      onDrop={handleAttachDrop}
    >
      <div
        className={styles.stack}
        style={{
          width: `${100 + (n - 1) * STACK_OFFSET}px`,
          height: `${140 + (n - 1) * STACK_OFFSET}px`,
        }}
      >
        {stackCards.map((c, i) => {
          const isChampion = c.instanceId === entry.champion.instanceId
          const defendMove = legalMoves.find(
            (m) =>
              m.type === "DECLARE_DEFENSE" &&
              (m as { championId: string }).championId === c.instanceId,
          )
          const contextActions: ContextMenuAction[] = []

          if (!isOpponent) {
            // Discard
            const discardMove = legalMoves.find(
              (m) =>
                m.type === "DISCARD_CARD" &&
                (m as { cardInstanceId: string }).cardInstanceId === c.instanceId,
            )
            contextActions.push(
              discardMove ? { label: "Discard", move: discardMove } : { label: "Discard", disabled: true },
            )

            // Defend
            if (isChampion) {
              contextActions.push(
                defendMove
                  ? { label: "Join combat as defender", move: defendMove }
                  : { label: "Join combat as defender", disabled: true },
              )
            }

            // Attack (champion only) — one entry per target realm
            if (isChampion) {
              const attackMoves = legalMoves.filter(
                (m) =>
                  m.type === "DECLARE_ATTACK" &&
                  (m as { championId: string }).championId === c.instanceId,
              )
              if (attackMoves.length === 1) {
                const m = attackMoves[0]!
                const { targetRealmSlot, targetPlayerId } = m as {
                  targetRealmSlot: string
                  targetPlayerId: string
                }
                const realmName =
                  allBoards[targetPlayerId]?.formation[targetRealmSlot]?.realm.name ?? targetRealmSlot
                contextActions.push({ label: `Attack ${realmName}`, move: m })
              } else if (attackMoves.length > 1) {
                const targets = attackMoves.map((m) => {
                  const { targetRealmSlot, targetPlayerId } = m as {
                    targetRealmSlot: string
                    targetPlayerId: string
                  }
                  const realmName =
                    allBoards[targetPlayerId]?.formation[targetRealmSlot]?.realm.name ?? targetRealmSlot
                  return { label: realmName, move: m }
                })
                contextActions.push({
                  label: "Attack...",
                  action: () => openTargetPicker("Attack target", targets),
                })
              } else {
                contextActions.push({ label: "Attack", disabled: true })
              }
            }
          }

          return (
            <div
              key={c.instanceId}
              className={styles.stackCard}
              style={{ top: `${i * STACK_OFFSET}px`, left: `${i * STACK_OFFSET}px`, zIndex: i }}
              onDragOver={(e) => {
                const source = e.dataTransfer.getData("drag-source")
                if (source === "hand") e.preventDefault()
              }}
              onDrop={(e) => handleSpellDropOnCard(e, c.instanceId)}
            >
              <CardComponent
                card={c}
                selected={selectedId === c.instanceId}
                onClick={() => onSelect(selectedId === c.instanceId ? null : c.instanceId)}
                showLabel={false}
                draggable={isChampion && !isOpponent}
                dragSource="pool"
                {...(!isOpponent ? { contextActions } : {})}
              />
            </div>
          )
        })}
      </div>
      {championInCombat && <span className={styles.combatBadge}>IN COMBAT</span>}
    </div>
  )
}
