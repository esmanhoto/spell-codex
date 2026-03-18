import { useState, useCallback } from "react"
import { useBoard } from "../../context/BoardContext.tsx"
import { useMoves } from "../../context/MovesContext.tsx"
import { useGameUI } from "../../context/UIContext.tsx"
import type { CardInfo, SlotState } from "../../api.ts"
import { cardImageUrl, findHandCard, findPoolChampion } from "../../utils/card-helpers.ts"
import { isSpellCard } from "../../utils/spell-casting.ts"
import { resolveHandDropMove } from "../../utils/manual-actions.ts"
import { CardTooltip } from "./CardTooltip.tsx"
import styles from "./Formation.module.css"

const ROWS = [["A"], ["B", "C"], ["D", "E", "F"]]
const WORLD_WILDCARD = new Set([0, 9])

export function Formation({
  slots,
  formationOwnerId,
  isOpponent,
  attackedSlot,
}: {
  slots: Record<string, SlotState | null>
  formationOwnerId: string
  isOpponent: boolean
  attackedSlot?: string
}) {
  const { allBoards, myPlayerId } = useBoard()
  const { legalMoves, onMove, phase, activePlayer, turnNumber } = useMoves()
  const { selectedId, onSelect, openContextMenu, showWarning, requestSpellCast, setRebuildTarget } =
    useGameUI()
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null)

  const isCardAlreadyInPlay = useCallback(
    (card: CardInfo): boolean => {
      return Object.values(allBoards).some((board) => {
        const inFormation = Object.values(board.formation).some(
          (slotState) =>
            !!slotState &&
            ((slotState.realm.name === card.name && slotState.realm.typeId === card.typeId) ||
              slotState.holdings.some((h) => h.name === card.name && h.typeId === card.typeId)),
        )
        if (inFormation) return true

        return board.pool.some(
          (entry) =>
            (entry.champion.name === card.name && entry.champion.typeId === card.typeId) ||
            entry.attachments.some((a) => a.name === card.name && a.typeId === card.typeId),
        )
      })
    },
    [allBoards],
  )

  function warnInvalidHandDrop(card: CardInfo, slot: string) {
    const phaseLabel = phase.replaceAll("_", " ")
    const target = slots[slot]
    const worldsCompatible = target
      ? WORLD_WILDCARD.has(card.worldId) ||
        WORLD_WILDCARD.has(target.realm.worldId) ||
        card.worldId === target.realm.worldId
      : true

    if (card.typeId === 13 && phase !== "PLAY_REALM") {
      showWarning(`Cannot play realm now. Current phase: ${phaseLabel}.`)
      return
    }
    if (card.typeId === 8 && phase !== "PLAY_REALM") {
      showWarning(`Cannot play holding now. Current phase: ${phaseLabel}.`)
      return
    }
    if (isCardAlreadyInPlay(card)) {
      showWarning(
        `${card.name} is already in play. Rule of Cosmos blocks duplicate copies.`,
        "duplicate_in_game",
      )
      return
    }

    if (card.typeId === 8 && target && !worldsCompatible) {
      showWarning(
        `Holding ${card.name} world mismatches realm ${target.realm.name}.`,
        "world_mismatch_attachment",
      )
      return
    }

    if (card.typeId === 13) {
      showWarning(`Realm cannot be played in slot ${slot} right now.`)
      return
    }
    if (card.typeId === 8) {
      showWarning(`Holding cannot be attached to slot ${slot} right now.`)
      return
    }
    showWarning("That card cannot be played there right now.")
  }

  function warnInvalidAttackDrop(champion: CardInfo, targetPlayerId: string, targetSlot: string) {
    if (targetPlayerId === myPlayerId) {
      showWarning("Cannot attack your own realm.")
      return
    }
    if (activePlayer !== myPlayerId) {
      showWarning("Not your turn.")
      return
    }
    if (phase !== "PLAY_REALM" && phase !== "POOL" && phase !== "COMBAT") {
      showWarning(`Cannot declare attack now. Current phase: ${phase.replaceAll("_", " ")}.`)
      return
    }

    const championHasAnyAttack = legalMoves.some(
      (m) =>
        m.type === "DECLARE_ATTACK" &&
        (m as { championId: string }).championId === champion.instanceId,
    )
    if (!championHasAnyAttack && turnNumber <= 2) {
      showWarning("Cannot attack during round 1.")
      return
    }
    if (!championHasAnyAttack) {
      showWarning(`${champion.name} cannot declare an attack right now.`)
      return
    }

    showWarning(`Cannot attack slot ${targetSlot} with ${champion.name}.`)
  }

  function handleSlotDrop(e: React.DragEvent, slot: string) {
    e.preventDefault()
    setDragOverSlot(null)
    const id = e.dataTransfer.getData("drag-id")
    const source = e.dataTransfer.getData("drag-source")
    if (!id) return

    if (source === "hand") {
      const card = findHandCard(allBoards, id)
      const slotState = slots[slot] ?? null
      const resolved = resolveHandDropMove({
        legalMoves,
        cardInstanceId: id,
        target: {
          zone: "formation_slot",
          owner: formationOwnerId === myPlayerId ? "self" : "opponent",
          slot,
          slotState,
        },
      })
      if (resolved) {
        if (resolved.type === "PLAY_REALM" && phase === "START_OF_TURN") {
          showWarning(
            "You are in Phase 1 (drawing). Proceed to Phase 2 (Realm) without drawing first?",
            undefined,
            false,
            () => onMove(resolved),
          )
          return
        }
        onMove(resolved)
        return
      }

      // Champion from hand attacking opponent realm
      if (formationOwnerId !== myPlayerId) {
        const attackMove = legalMoves.find(
          (m) =>
            m.type === "DECLARE_ATTACK" &&
            (m as { championId: string; targetRealmSlot: string; targetPlayerId: string })
              .championId === id &&
            (m as { championId: string; targetRealmSlot: string; targetPlayerId: string })
              .targetRealmSlot === slot &&
            (m as { championId: string; targetRealmSlot: string; targetPlayerId: string })
              .targetPlayerId === formationOwnerId,
        )
        if (attackMove) {
          onMove(attackMove)
          return
        }
      }

      if (card && isSpellCard(card)) {
        if (!slotState) {
          showWarning("Drop the spell on a card target, not an empty slot.")
          return
        }
        requestSpellCast(card.instanceId, {
          cardInstanceId: slotState.realm.instanceId,
          owner: formationOwnerId === myPlayerId ? "self" : "opponent",
        })
        return
      }

      if (card) {
        warnInvalidHandDrop(card, slot)
      } else {
        showWarning("That card cannot be played there right now.")
      }
      return
    }

    if (source === "pool") {
      const champion = findPoolChampion(allBoards, id)
      const attackMove = legalMoves.find(
        (m) =>
          m.type === "DECLARE_ATTACK" &&
          (m as { championId: string; targetRealmSlot: string; targetPlayerId: string })
            .championId === id &&
          (m as { championId: string; targetRealmSlot: string; targetPlayerId: string })
            .targetRealmSlot === slot &&
          (m as { championId: string; targetRealmSlot: string; targetPlayerId: string })
            .targetPlayerId === formationOwnerId,
      )
      if (attackMove) {
        onMove(attackMove)
        return
      }
      if (champion) {
        warnInvalidAttackDrop(champion, formationOwnerId, slot)
      } else {
        showWarning("Cannot declare attack with that card.")
      }
      return
    }
  }

  const displayRows = isOpponent ? [...ROWS].reverse() : ROWS

  return (
    <div className={styles.formation}>
      <div className={styles.pyramid}>
        {displayRows.map((row, ri) => (
          <div key={ri} className={styles.row}>
            {row.map((slot) => {
              const s = slots[slot]
              const isSelected = !!s && selectedId === s.realm.instanceId
              const isDragTarget = dragOverSlot === slot
              const toggleHoldingMove = s?.holdings.length
                ? legalMoves.find(
                    (m) =>
                      m.type === "TOGGLE_HOLDING_REVEAL" &&
                      (m as { realmSlot: string }).realmSlot === slot,
                  )
                : undefined
              const realmDefenseMove =
                s && !isOpponent
                  ? legalMoves.find(
                      (m) =>
                        m.type === "DECLARE_DEFENSE" &&
                        (m as { championId: string }).championId === s.realm.instanceId,
                    )
                  : undefined
              const rebuildMove =
                s?.isRazed && !isOpponent
                  ? legalMoves.find(
                      (m) => m.type === "REBUILD_REALM" && (m as { slot: string }).slot === slot,
                    )
                  : undefined
              const discardRazedMove =
                s?.isRazed && !isOpponent
                  ? legalMoves.find(
                      (m) =>
                        m.type === "DISCARD_RAZED_REALM" && (m as { slot: string }).slot === slot,
                    )
                  : undefined
              const contextMenuItems: {
                label: string
                move?: (typeof legalMoves)[number]
                action?: () => void
                disabled?: boolean
              }[] = []
              const razeOwnMove =
                s && !s.isRazed && !isOpponent
                  ? legalMoves.find(
                      (m) => m.type === "RAZE_OWN_REALM" && (m as { slot: string }).slot === slot,
                    )
                  : undefined

              if (s && !isOpponent) {
                // Rebuild — only for razed realms
                if (s.isRazed) {
                  contextMenuItems.push(
                    rebuildMove
                      ? { label: "Rebuild Realm (discard 3)", action: () => setRebuildTarget(slot) }
                      : { label: "Rebuild Realm (discard 3)", disabled: true },
                  )
                }

                // Raze — only for unrazed realms
                if (!s.isRazed) {
                  contextMenuItems.push(
                    razeOwnMove
                      ? { label: "Raze Realm", move: razeOwnMove }
                      : { label: "Raze Realm", disabled: true },
                  )
                }

                // Discard razed realm
                if (s.isRazed) {
                  contextMenuItems.push(
                    discardRazedMove
                      ? { label: "Discard Realm", move: discardRazedMove }
                      : { label: "Discard Realm", disabled: true },
                  )
                }

                // Toggle holding reveal
                if (s.holdings.length > 0) {
                  contextMenuItems.push(
                    toggleHoldingMove
                      ? {
                          label: s.holdingRevealedToAll ? "Hide holding" : "Reveal holding",
                          move: toggleHoldingMove,
                        }
                      : { label: "Reveal holding", disabled: true },
                  )
                }

                // Defend with realm
                contextMenuItems.push(
                  realmDefenseMove
                    ? {
                        label: `Defend with realm (level ${s.realm.level ?? "?"})`,
                        move: realmDefenseMove,
                      }
                    : {
                        label: `Defend with realm (level ${s.realm.level ?? "?"})`,
                        disabled: true,
                      },
                )
              }
              const tooltipCards = s ? [s.realm, ...s.holdings] : []
              const showHoldingStack = !!(s && s.holdings.length > 0 && s.holdingRevealedToAll)
              const holdingForStack = showHoldingStack ? s.holdings[0] : null
              const hasHiddenHolding = !!(
                isOpponent &&
                s &&
                s.holdingCount > 0 &&
                !s.holdingRevealedToAll
              )

              return (
                <div
                  key={slot}
                  data-targeted-slot={attackedSlot === slot ? slot : undefined}
                  className={[
                    styles.slot,
                    s ? (s.isRazed ? styles.razed : styles.filled) : styles.empty,
                    isSelected ? styles.selected : "",
                    isDragTarget ? styles.dragOver : "",
                    attackedSlot === slot ? styles.targeted : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => s && onSelect(isSelected ? null : s.realm.instanceId)}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOverSlot(slot)
                  }}
                  onDragLeave={() => setDragOverSlot(null)}
                  onDrop={(e) => handleSlotDrop(e, slot)}
                  onContextMenu={
                    s && !isOpponent && contextMenuItems.length > 0
                      ? (e) => {
                          e.preventDefault()
                          openContextMenu(e.clientX, e.clientY, contextMenuItems)
                        }
                      : undefined
                  }
                >
                  <span className={styles.slotLabel}>{slot}</span>
                  {s ? (
                    <>
                      {s.isRazed ? (
                        <CardTooltip cards={tooltipCards} razed>
                          <div className={styles.cardBackWrap}>
                            <img
                              src="/api/cards/cardback.jpg"
                              alt="Razed"
                              className={styles.cardBackImg}
                            />
                          </div>
                        </CardTooltip>
                      ) : (
                        <CardTooltip cards={tooltipCards} hasHiddenHolding={hasHiddenHolding}>
                          <div className={styles.realmStack}>
                            {holdingForStack && (
                              <div className={styles.holdingPeekWrap}>
                                <img
                                  src={cardImageUrl(
                                    holdingForStack.setId,
                                    holdingForStack.cardNumber,
                                  )}
                                  alt={holdingForStack.name}
                                  className={styles.holdingPeekImg}
                                  onError={(e) => {
                                    ;(e.target as HTMLImageElement).style.display = "none"
                                  }}
                                />
                              </div>
                            )}
                            <div
                              className={`${styles.realmImgWrap} ${hasHiddenHolding ? styles.hiddenHoldingImg : ""}`}
                            >
                              <img
                                src={cardImageUrl(s.realm.setId, s.realm.cardNumber)}
                                alt={s.realm.name}
                                className={styles.realmImg}
                                loading="lazy"
                                onError={(e) => {
                                  ;(e.target as HTMLImageElement).style.display = "none"
                                }}
                              />
                            </div>
                          </div>
                        </CardTooltip>
                      )}
                      <span className={styles.realmName}>
                        {s.realm.name}
                        {s.isRazed ? " (razed)" : ""}
                      </span>
                      {s.holdings.map((h) => (
                        <span key={h.instanceId} className={styles.holding} title={h.description}>
                          {h.name}
                        </span>
                      ))}
                    </>
                  ) : (
                    <span className={styles.emptyLabel}>empty</span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
