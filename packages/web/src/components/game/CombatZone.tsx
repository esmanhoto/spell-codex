import { useState } from "react"
import { useBoard } from "../../context/BoardContext.tsx"
import { useCombat } from "../../context/CombatContext.tsx"
import { useMoves } from "../../context/MovesContext.tsx"
import { useGameUI } from "../../context/UIContext.tsx"
import { cardImageUrl, nameOfCard, findHandCard } from "../../utils/card-helpers.ts"
import type { CardInfo } from "../../api.ts"
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
  const tie = hasLevels && levelA === levelB
  // On a tie the defender wins — color the defending side as winning
  const aWinning = levelA > levelB || (tie && !aIsAttacker)
  const bWinning = levelB > levelA || (tie && aIsAttacker)

  const canEditLevel = legalMoves.some((m) => m.type === "SET_COMBAT_LEVEL")
  const canAcceptDefeat =
    combat.roundPhase === "AWAITING_DEFENDER" &&
    legalMoves.some((m) => m.type === "DECLINE_DEFENSE")
  const canStopPlaying = legalMoves.some((m) => m.type === "STOP_PLAYING")
  const canEndAttack = legalMoves.some((m) => m.type === "END_ATTACK")
  const canInterrupt = legalMoves.some((m) => m.type === "INTERRUPT_COMBAT")
  const continueAttackMoves = legalMoves.filter(
    (m): m is Extract<typeof m, { type: "CONTINUE_ATTACK" }> => m.type === "CONTINUE_ATTACK",
  )

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
    // Champions don't get switch/discard — ending a champion's combat uses accept defeat
    const isChampion =
      card.instanceId === combat?.attacker?.instanceId ||
      card.instanceId === combat?.defender?.instanceId
    if (isChampion) return []
    const actions: ContextMenuAction[] = [
      {
        label: "Switch sides",
        move: { type: "SWITCH_COMBAT_SIDE", cardInstanceId: card.instanceId },
      },
    ]
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
        {/* Champion — always on top (highest z-index) */}
        {champion && (
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
          {hasLevels && (
            <>
              <span
                className={`${styles.levelDisplay} ${levelColorClass(bWinning, aWinning)}`}
                onClick={() => canEditLevel && setEditingB(true)}
                title={canEditLevel ? "Click to override level" : undefined}
              >
                {levelB}
              </span>
              {manualB != null && <span className={styles.manualTag}>manual</span>}
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
          {hasLevels && (
            <>
              <span
                className={`${styles.levelDisplay} ${levelColorClass(aWinning, bWinning)}`}
                onClick={() => canEditLevel && setEditingA(true)}
                title={canEditLevel ? "Click to override level" : undefined}
              >
                {levelA}
              </span>
              {manualA != null && <span className={styles.manualTag}>manual</span>}
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
        </div>
      </div>

      {/* Target info */}
      <div className={styles.targetInfo}>
        Player A attacking Player B's realm <strong>{combat.targetSlot}</strong>
      </div>

      {/* Accept defeat — stop playing combat cards and resolve */}
      {canStopPlaying && (
        <div className={styles.actionRow}>
          <button className={styles.defeatBtn} onClick={() => onMove({ type: "STOP_PLAYING" })}>
            Accept defeat
          </button>
        </div>
      )}

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

      {/* Interrupt — end combat with no winner; champions return intact */}
      {canInterrupt && (
        <div className={styles.actionRow}>
          <button className={styles.defeatBtn} onClick={() => onMove({ type: "INTERRUPT_COMBAT" })}>
            Interrupt combat
          </button>
        </div>
      )}
    </div>
  )
}
