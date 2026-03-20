import { useState, useMemo } from "react"
import { useBoard } from "../../context/BoardContext.tsx"
import { useCombat } from "../../context/CombatContext.tsx"
import { useMoves } from "../../context/MovesContext.tsx"
import { useGameUI } from "../../context/UIContext.tsx"
import { cardImageUrl, nameOfCard, findHandCard } from "../../utils/card-helpers.ts"
import type { CardInfo, Move } from "../../api.ts"
import type { ContextMenuAction } from "../../context/types.ts"
import { isSpellCard } from "../../utils/spell-casting.ts"
import { CombatTooltip } from "./CombatTooltip.tsx"
import styles from "./CombatZone.module.css"

export function CombatZone() {
  const { playerA, playerB, allBoards } = useBoard()
  const { combat } = useCombat()
  const { legalMoves, onMove } = useMoves()
  const { openContextMenu, requestSpellCast } = useGameUI()
  const [inputA, setInputA] = useState("")
  const [inputB, setInputB] = useState("")
  const [editingA, setEditingA] = useState(false)
  const [editingB, setEditingB] = useState(false)
  const [moreActionsOpen, setMoreActionsOpen] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)
  const [swapChampionId, setSwapChampionId] = useState<string | null>(null)
  const [swapSource, setSwapSource] = useState<"pool" | "hand" | "discard" | null>(null)

  if (!combat) return null

  const aIsAttacker = combat.attackingPlayer === playerA

  // Player A data (always bottom)
  const champA = aIsAttacker ? combat.attacker : combat.defender
  const cardsA = aIsAttacker ? combat.attackerCards : combat.defenderCards
  const levelA = aIsAttacker
    ? (combat.attackerManualLevel ?? combat.attackerLevel)
    : (combat.defenderManualLevel ?? combat.defenderLevel)
  const manualA = aIsAttacker ? combat.attackerManualLevel : combat.defenderManualLevel
  const roleA = aIsAttacker ? "Attacker" : "Defender"

  // Player B data (always top)
  const champB = aIsAttacker ? combat.defender : combat.attacker
  const cardsB = aIsAttacker ? combat.defenderCards : combat.attackerCards
  const levelB = aIsAttacker
    ? (combat.defenderManualLevel ?? combat.defenderLevel)
    : (combat.attackerManualLevel ?? combat.attackerLevel)
  const manualB = aIsAttacker ? combat.defenderManualLevel : combat.attackerManualLevel
  const roleB = aIsAttacker ? "Defender" : "Attacker"

  const hasLevels = combat.attacker !== null && combat.defender !== null
  const champAPresent = (aIsAttacker ? combat.attacker : combat.defender) !== null
  const champBPresent = (aIsAttacker ? combat.defender : combat.attacker) !== null
  const tie = hasLevels && levelA === levelB
  // On a tie the defender wins — color the defending side as winning
  const aWinning = hasLevels && (levelA > levelB || (tie && !aIsAttacker))
  const bWinning = hasLevels && (levelB > levelA || (tie && aIsAttacker))

  const canEditLevel = legalMoves.some((m) => m.type === "SET_COMBAT_LEVEL")
  const canAcceptDefeat =
    combat.roundPhase === "AWAITING_DEFENDER" &&
    legalMoves.some((m) => m.type === "DECLINE_DEFENSE")
  const canStopPlaying = legalMoves.some((m) => m.type === "STOP_PLAYING")
  const canEndAttack = legalMoves.some((m) => m.type === "END_ATTACK")
  const canInterrupt = legalMoves.some((m) => m.type === "INTERRUPT_COMBAT")
  const usedIds = combat.championsUsedThisBattle ?? []

  // Main buttons: unused own champions (no fromPlayerId, not in championsUsedThisBattle)
  const continueAttackMoves = legalMoves.filter(
    (m): m is Extract<typeof m, { type: "CONTINUE_ATTACK" }> =>
      m.type === "CONTINUE_ATTACK" &&
      !(m as { fromPlayerId?: string }).fromPlayerId &&
      !usedIds.includes((m as { championId: string }).championId),
  )

  // Swap moves (grouped by destination — only default "pool" destination shown)
  const swapMoves = useMemo(() => {
    return legalMoves.filter(
      (m): m is Extract<Move, { type: "SWAP_COMBAT_CHAMPION" }> =>
        m.type === "SWAP_COMBAT_CHAMPION",
    )
  }, [legalMoves])
  const hasSwapMoves = swapMoves.length > 0
  const mySide = combat.attackingPlayer === playerA ? "attacker" : "defender"

  // "More Actions" moves — used champions, cross-player picks, require new champion
  const moreActionMoves = useMemo(() => {
    const moves: { label: string; move: Move }[] = []
    for (const m of legalMoves) {
      if (m.type === "REQUIRE_NEW_CHAMPION") {
        const a = m as Extract<Move, { type: "REQUIRE_NEW_CHAMPION" }>
        moves.push({ label: `Require new ${a.side} champion`, move: m })
      } else if (
        m.type === "CONTINUE_ATTACK" &&
        !(m as { fromPlayerId?: string }).fromPlayerId &&
        usedIds.includes((m as { championId: string }).championId)
      ) {
        // Used own champion — show in More Actions
        const a = m as Extract<Move, { type: "CONTINUE_ATTACK" }>
        moves.push({
          label: `Continue with ${nameOfCard(a.championId, allBoards)} (fought before)`,
          move: m,
        })
      } else if (m.type === "CONTINUE_ATTACK" && (m as { fromPlayerId?: string }).fromPlayerId) {
        const a = m as Extract<Move, { type: "CONTINUE_ATTACK" }>
        moves.push({
          label: `Continue with ${nameOfCard(a.championId, allBoards)} (opponent's)`,
          move: m,
        })
      } else if (
        m.type === "DECLARE_DEFENSE" &&
        !(m as { fromPlayerId?: string }).fromPlayerId &&
        usedIds.includes((m as { championId: string }).championId)
      ) {
        const a = m as Extract<Move, { type: "DECLARE_DEFENSE" }>
        moves.push({
          label: `Defend with ${nameOfCard(a.championId, allBoards)} (fought before)`,
          move: m,
        })
      } else if (m.type === "DECLARE_DEFENSE" && (m as { fromPlayerId?: string }).fromPlayerId) {
        const a = m as Extract<Move, { type: "DECLARE_DEFENSE" }>
        moves.push({
          label: `Defend with ${nameOfCard(a.championId, allBoards)} (opponent's)`,
          move: m,
        })
      }
    }
    return moves
  }, [legalMoves, allBoards, usedIds])

  // Group swap champions by source for the sub-panel
  const swapCandidates = useMemo(() => {
    if (!swapOpen) return { pool: [] as { id: string; name: string }[], hand: [] as { id: string; name: string }[], discard: [] as { id: string; name: string }[] }
    const seen = new Set<string>()
    const pool: { id: string; name: string }[] = []
    const hand: { id: string; name: string }[] = []
    const discard: { id: string; name: string }[] = []
    for (const m of swapMoves) {
      if (m.side !== mySide) continue
      if (seen.has(m.newChampionId)) continue
      seen.add(m.newChampionId)
      const name = nameOfCard(m.newChampionId, allBoards)
      if (m.newChampionSource === "pool") pool.push({ id: m.newChampionId, name })
      else if (m.newChampionSource === "hand") hand.push({ id: m.newChampionId, name })
      else if (m.newChampionSource === "discard") discard.push({ id: m.newChampionId, name })
    }
    return { pool, hand, discard }
  }, [swapOpen, swapMoves, mySide, allBoards])

  function executeSwap(dest: "pool" | "discard" | "abyss" | "hand") {
    if (!swapChampionId || !swapSource) return
    onMove({
      type: "SWAP_COMBAT_CHAMPION",
      side: mySide,
      newChampionId: swapChampionId,
      newChampionSource: swapSource,
      oldChampionDestination: dest,
    })
    setSwapOpen(false)
    setSwapChampionId(null)
    setSwapSource(null)
  }

  function submitLevel(
    playerId: string,
    input: string,
    setter: (v: string) => void,
    closeFn: (v: boolean) => void,
  ) {
    const level = parseInt(input, 10)
    if (!isNaN(level)) {
      onMove({ type: "SET_COMBAT_LEVEL", playerId, level })
    }
    setter("")
    closeFn(false)
  }

  function buildContextActions(card: CardInfo): ContextMenuAction[] {
    if (!canEditLevel) return []
    const isChampion =
      card.instanceId === combat?.attacker?.instanceId ||
      card.instanceId === combat?.defender?.instanceId
    if (isChampion) {
      // Champion: offer return to pool
      const hasReturn = legalMoves.some(
        (m) =>
          m.type === "RETURN_COMBAT_CARD_TO_POOL" &&
          (m as { cardInstanceId: string }).cardInstanceId === card.instanceId,
      )
      return hasReturn
        ? [{ label: "Return to pool", move: { type: "RETURN_COMBAT_CARD_TO_POOL", cardInstanceId: card.instanceId } }]
        : []
    }
    const actions: ContextMenuAction[] = [
      {
        label: "Switch sides",
        move: { type: "SWITCH_COMBAT_SIDE", cardInstanceId: card.instanceId },
      },
    ]
    // Return combat card to hand
    const hasReturnHand = legalMoves.some(
      (m) =>
        m.type === "RETURN_COMBAT_CARD_TO_HAND" &&
        (m as { cardInstanceId: string }).cardInstanceId === card.instanceId,
    )
    if (hasReturnHand) {
      actions.push({
        label: "Return to hand",
        move: { type: "RETURN_COMBAT_CARD_TO_HAND", cardInstanceId: card.instanceId },
      })
    }
    // Only offer discard for own cards
    const hasDiscard = legalMoves.some(
      (m) =>
        m.type === "DISCARD_CARD" &&
        (m as { cardInstanceId: string }).cardInstanceId === card.instanceId,
    )
    if (hasDiscard) {
      actions.push({
        label: "Discard",
        move: { type: "DISCARD_CARD", cardInstanceId: card.instanceId },
      })
    }
    return actions
  }

  function handleCardContextMenu(e: React.MouseEvent, card: CardInfo) {
    e.preventDefault()
    const actions = buildContextActions(card)
    if (actions.length > 0) {
      openContextMenu(e.clientX, e.clientY, actions)
    }
  }

  function handleCardDrop(e: React.DragEvent, targetCard: CardInfo) {
    const source = e.dataTransfer.getData("drag-source")
    if (source !== "hand") return

    const id = e.dataTransfer.getData("drag-id")
    const card = findHandCard(allBoards, id)
    if (!card || !isSpellCard(card)) return

    e.preventDefault()
    e.stopPropagation()
    const targetIsSelf =
      targetCard.instanceId === champA?.instanceId ||
      cardsA.some((c) => c.instanceId === targetCard.instanceId)
    requestSpellCast(card.instanceId, {
      cardInstanceId: targetCard.instanceId,
      owner: targetIsSelf ? "self" : "opponent",
    })
  }

  // Include pool entry attachments in the displayed card stacks
  const boardA = allBoards[playerA]
  const boardB = allBoards[playerB]
  const poolAttachmentsA = champA
    ? (boardA?.pool.find((e) => e.champion.instanceId === champA.instanceId)?.attachments ?? [])
    : []
  const poolAttachmentsB = champB
    ? (boardB?.pool.find((e) => e.champion.instanceId === champB.instanceId)?.attachments ?? [])
    : []
  const displayCardsA = [...poolAttachmentsA, ...cardsA]
  const displayCardsB = [...poolAttachmentsB, ...cardsB]

  // PEEK = how many px of each support card peek out below the champion
  const PEEK = 34

  function renderCardStack(champion: CardInfo | null, supportCards: CardInfo[]) {
    const totalSupportHeight = supportCards.length * PEEK

    return (
      <div
        className={styles.cardStack}
        style={{ paddingBottom: totalSupportHeight, paddingTop: 0 }}
      >
        {/* Champion — always on top (highest z-index), or placeholder when returned to pool */}
        {champion ? (
          <div className={styles.championCard}>
            <CombatTooltip card={champion}>
              <div
                data-combat-champion={champion.instanceId}
                onContextMenu={(e) => handleCardContextMenu(e, champion)}
                className={styles.championInner}
                onDragOver={(e) => {
                  const source = e.dataTransfer.getData("drag-source")
                  if (source === "hand") e.preventDefault()
                }}
                onDrop={(e) => handleCardDrop(e, champion)}
              >
                <img
                  src={cardImageUrl(champion.setId, champion.cardNumber)}
                  alt={champion.name}
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = "none"
                  }}
                />
              </div>
            </CombatTooltip>
          </div>
        ) : (
          <div className={`${styles.championCard} ${styles.placeholder}`}>
            <span className={styles.placeholderText}>Returned to pool</span>
          </div>
        )}

        {/* Support cards — full size, positioned so only PEEK px peek below champion */}
        {supportCards.map((c, i) => {
          // Position: card is mostly behind the champion, only bottom PEEK*(i+1) px visible
          // For normal (bottom player): top = CARD_H - CARD_H + PEEK*(i+1) = PEEK*(i+1)
          //   but we want the card to start higher so it's hidden behind the champ.
          //   The card top edge should be at: CARD_H - PEEK*(i+1) from champion top
          //   Since support is absolutely positioned relative to cardStack which has
          //   the champion at top=0, the support top = championBottom - (CARD_H - PEEK*(i+1))
          //   = CARD_H - CARD_H + PEEK*(i+1) = PEEK*(i+1)
          // Wait — simpler: support card should be positioned so its bottom is PEEK*(i+1) below champion's bottom.
          // Champion occupies 0..CARD_H. Support card of height CARD_H, bottom at CARD_H + PEEK*(i+1).
          // So top = CARD_H + PEEK*(i+1) - CARD_H = PEEK*(i+1).
          // That means support top = PEEK * (i+1), and since support is CARD_H tall, only the bottom PEEK px
          // peeks below the champion.
          // Actually no — the card top at PEEK*(i+1) means the card starts at y=PEEK*(i+1)
          // and ends at y=PEEK*(i+1)+CARD_H. The champion ends at y=CARD_H.
          // Visible portion = (PEEK*(i+1)+CARD_H) - CARD_H = PEEK*(i+1). That's too much for i>0.
          // We want exactly PEEK px visible per card. Each card peeks PEEK below the previous.
          // Card 0: bottom edge at CARD_H + PEEK → top = CARD_H + PEEK - CARD_H = PEEK
          //   visible below champion: PEEK. Correct.
          // Card 1: bottom edge at CARD_H + 2*PEEK → top = 2*PEEK
          //   visible below champion: 2*PEEK. But card 0 covers PEEK..PEEK+CARD_H, so
          //   card 1 visible portion = bottom PEEK that's below card 0's bottom.
          //   Card 0 bottom = PEEK+CARD_H, card 1 bottom = 2*PEEK+CARD_H.
          //   Card 1 visible = PEEK. Correct (since card 0 covers the rest with higher z).
          // So z-index must decrease with each support card.
          const topPos = PEEK * (i + 1)
          const zIndex = supportCards.length - i // first support card has highest z among supports

          return (
            <div
              key={c.instanceId}
              className={styles.supportCard}
              style={{ top: topPos, zIndex }}
              onContextMenu={(e) => handleCardContextMenu(e, c)}
              onDragOver={(e) => {
                const source = e.dataTransfer.getData("drag-source")
                if (source === "hand") e.preventDefault()
              }}
              onDrop={(e) => handleCardDrop(e, c)}
            >
              <CombatTooltip card={c}>
                <div className={styles.supportInner}>
                  <img
                    src={cardImageUrl(c.setId, c.cardNumber)}
                    alt={c.name}
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = "none"
                    }}
                  />
                </div>
              </CombatTooltip>
            </div>
          )
        })}
      </div>
    )
  }

  function levelColorClass(winning: boolean, losing: boolean): string {
    if (winning) return styles.winning
    if (losing) return styles.losing
    return styles.neutral
  }

  return (
    <div className={styles.combat} data-combat-panel>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.title}>Combat</span>
        <span className={styles.phase}>{combat.roundPhase.replace(/_/g, " ")}</span>
      </div>

      {/* Player B section (top) */}
      <div className={styles.sideSection}>
        {renderCardStack(champB, displayCardsB)}
        <div className={styles.infoPanel}>
          {(hasLevels || !champBPresent) && (
            <>
              <span
                className={`${styles.levelDisplay} ${champBPresent ? levelColorClass(bWinning, aWinning) : styles.neutral}`}
                onClick={() => canEditLevel && champBPresent && setEditingB(true)}
                title={canEditLevel && champBPresent ? "Click to override level" : undefined}
              >
                {champBPresent ? levelB : "X"}
              </span>
              {manualB != null && champBPresent && <span className={styles.manualTag}>manual</span>}
            </>
          )}
          <span className={styles.roleLabel}>{roleB}</span>
          {editingB && canEditLevel && (
            <div className={styles.levelEditRow}>
              <input
                type="number"
                autoFocus
                placeholder={String(levelB)}
                value={inputB}
                onChange={(e) => setInputB(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitLevel(playerB, inputB, setInputB, setEditingB)
                  if (e.key === "Escape") {
                    setEditingB(false)
                    setInputB("")
                  }
                }}
                onBlur={() => {
                  setEditingB(false)
                  setInputB("")
                }}
                className={styles.levelInput}
              />
              <button
                className={styles.setBtn}
                onMouseDown={(e) => {
                  e.preventDefault()
                  submitLevel(playerB, inputB, setInputB, setEditingB)
                }}
              >
                Set
              </button>
            </div>
          )}
        </div>
      </div>

      {/* VS Divider */}
      <div className={styles.vsDivider}>
        <div className={styles.vsLine} />
        <span className={styles.vsText}>VS</span>
        <div className={styles.vsLine} />
      </div>

      {/* Player A section (bottom — cards normal orientation) */}
      <div className={styles.sideSection}>
        {renderCardStack(champA, displayCardsA)}
        <div className={styles.infoPanel}>
          <span className={styles.roleLabel}>{roleA}</span>
          {canAcceptDefeat && (
            <button
              className={styles.defeatBtn}
              onClick={() => onMove({ type: "DECLINE_DEFENSE" })}
            >
              Accept Defeat
            </button>
          )}
          {(hasLevels || !champAPresent) && (
            <>
              <span
                className={`${styles.levelDisplay} ${champAPresent ? levelColorClass(aWinning, bWinning) : styles.neutral}`}
                onClick={() => canEditLevel && champAPresent && setEditingA(true)}
                title={canEditLevel && champAPresent ? "Click to override level" : undefined}
              >
                {champAPresent ? levelA : "X"}
              </span>
              {manualA != null && champAPresent && <span className={styles.manualTag}>manual</span>}
            </>
          )}
          {editingA && canEditLevel && (
            <div className={styles.levelEditRow}>
              <input
                type="number"
                autoFocus
                placeholder={String(levelA)}
                value={inputA}
                onChange={(e) => setInputA(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitLevel(playerA, inputA, setInputA, setEditingA)
                  if (e.key === "Escape") {
                    setEditingA(false)
                    setInputA("")
                  }
                }}
                onBlur={() => {
                  setEditingA(false)
                  setInputA("")
                }}
                className={styles.levelInput}
              />
              <button
                className={styles.setBtn}
                onMouseDown={(e) => {
                  e.preventDefault()
                  submitLevel(playerA, inputA, setInputA, setEditingA)
                }}
              >
                Set
              </button>
            </div>
          )}
          {/* Combat action buttons — placed below score in the info panel */}
          {canStopPlaying && (
            <button className={styles.defeatBtn} onClick={() => onMove({ type: "STOP_PLAYING" })}>
              Accept defeat
            </button>
          )}
          {canInterrupt && (
            <button className={styles.defeatBtn} onClick={() => onMove({ type: "INTERRUPT_COMBAT" })}>
              Interrupt combat
            </button>
          )}
        </div>
      </div>

      {/* Target info */}
      <div className={styles.targetInfo}>
        Player A attacking Player B's realm <strong>{combat.targetSlot}</strong>
      </div>

      {/* Attacker continuation — after winning a round */}
      {(canEndAttack || continueAttackMoves.length > 0) && (
        <div className={styles.attackerActions}>
          {canEndAttack && (
            <button className={styles.endAttackBtn} onClick={() => onMove({ type: "END_ATTACK" })}>
              End attack
            </button>
          )}
          {continueAttackMoves.map((m) => (
            <button key={m.championId} className={styles.continueBtn} onClick={() => onMove(m)}>
              Continue with {nameOfCard(m.championId, allBoards)}
            </button>
          ))}
        </div>
      )}

      {/* More Actions — collapsible panel for advanced combat moves */}
      {(moreActionMoves.length > 0 || hasSwapMoves) && (
        <div className={styles.moreActions}>
          <button
            className={styles.moreActionsToggle}
            onClick={() => { setMoreActionsOpen((v) => !v); setSwapOpen(false); setSwapChampionId(null) }}
          >
            {moreActionsOpen ? "\u25B4 Less Actions" : "\u2699 More Actions \u25BE"}
          </button>
          {moreActionsOpen && (
            <div className={styles.moreActionsPanel}>
              {/* Swap champion — single button that opens sub-panel */}
              {hasSwapMoves && !swapOpen && (
                <button
                  className={styles.moreActionBtn}
                  onClick={() => setSwapOpen(true)}
                >
                  Swap {mySide} champion...
                </button>
              )}
              {swapOpen && !swapChampionId && (
                <div className={styles.swapPanel}>
                  <div className={styles.swapHeader}>
                    Select new champion:
                    <button className={styles.swapClose} onClick={() => setSwapOpen(false)}>X</button>
                  </div>
                  {swapCandidates.pool.length > 0 && (
                    <>
                      <div className={styles.swapGroupLabel}>From pool</div>
                      {swapCandidates.pool.map((c) => (
                        <button key={c.id} className={styles.moreActionBtn} onClick={() => { setSwapChampionId(c.id); setSwapSource("pool") }}>
                          {c.name}
                        </button>
                      ))}
                    </>
                  )}
                  {swapCandidates.hand.length > 0 && (
                    <>
                      <div className={styles.swapGroupLabel}>From hand</div>
                      {swapCandidates.hand.map((c) => (
                        <button key={c.id} className={styles.moreActionBtn} onClick={() => { setSwapChampionId(c.id); setSwapSource("hand") }}>
                          {c.name}
                        </button>
                      ))}
                    </>
                  )}
                  {swapCandidates.discard.length > 0 && (
                    <>
                      <div className={styles.swapGroupLabel}>From discard</div>
                      {swapCandidates.discard.map((c) => (
                        <button key={c.id} className={styles.moreActionBtn} onClick={() => { setSwapChampionId(c.id); setSwapSource("discard") }}>
                          {c.name}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
              {swapOpen && swapChampionId && (
                <div className={styles.swapPanel}>
                  <div className={styles.swapHeader}>
                    Send old champion to:
                    <button className={styles.swapClose} onClick={() => { setSwapChampionId(null) }}>Back</button>
                  </div>
                  <button className={styles.moreActionBtn} onClick={() => executeSwap("pool")}>Pool</button>
                  <button className={styles.moreActionBtn} onClick={() => executeSwap("discard")}>Discard pile</button>
                  <button className={styles.moreActionBtn} onClick={() => executeSwap("hand")}>Hand</button>
                  <button className={styles.moreActionBtn} onClick={() => executeSwap("abyss")}>Abyss</button>
                </div>
              )}

              {/* Other more actions */}
              {moreActionMoves.map((item, i) => (
                <button
                  key={i}
                  className={styles.moreActionBtn}
                  onClick={() => onMove(item.move)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
