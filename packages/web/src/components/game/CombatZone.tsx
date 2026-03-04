import { useState } from "react"
import { useGame } from "../../context/GameContext.tsx"
import { cardImageUrl } from "../../utils/card-helpers.ts"
import type { CardInfo } from "../../api.ts"
import type { ContextMenuAction } from "../../context/GameContext.tsx"
import { isSpellCard } from "../../utils/spell-casting.ts"
import { CombatTooltip } from "./CombatTooltip.tsx"
import styles from "./CombatZone.module.css"

export function CombatZone() {
  const {
    combat, playerA, playerB, legalMoves, onMove, openContextMenu,
    allBoards, requestSpellCast, playMode,
  } = useGame()
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

  const aWinning = levelA > levelB
  const bWinning = levelB > levelA
  const hasLevels = combat.attacker !== null && combat.defender !== null

  const canEditLevel = legalMoves.some(m => m.type === "MANUAL_SET_COMBAT_LEVEL")

  function submitLevel(playerId: string, input: string, setter: (v: string) => void, closeFn: (v: boolean) => void) {
    const level = parseInt(input, 10)
    if (!isNaN(level)) {
      onMove({ type: "MANUAL_SET_COMBAT_LEVEL", playerId, level })
    }
    setter("")
    closeFn(false)
  }

  function buildContextActions(card: CardInfo): ContextMenuAction[] {
    if (!canEditLevel) return []
    return [
      { label: "Discard", move: { type: "MANUAL_DISCARD", cardInstanceId: card.instanceId } },
      { label: "Return to pool", move: { type: "MANUAL_RETURN_TO_POOL", cardInstanceId: card.instanceId } },
      { label: "Switch sides", move: { type: "MANUAL_SWITCH_COMBAT_SIDE", cardInstanceId: card.instanceId } },
    ]
  }

  function handleCardContextMenu(e: React.MouseEvent, card: CardInfo) {
    e.preventDefault()
    const actions = buildContextActions(card)
    if (actions.length > 0) {
      openContextMenu(e.clientX, e.clientY, actions)
    }
  }

  function findDraggedHandCard(instanceId: string): CardInfo | undefined {
    for (const board of Object.values(allBoards)) {
      const c = board.hand.find(card => card.instanceId === instanceId)
      if (c) return c
    }
    return undefined
  }

  function handleCardDrop(e: React.DragEvent, targetCard: CardInfo) {
    const source = e.dataTransfer.getData("drag-source")
    if (source !== "hand") return

    const id = e.dataTransfer.getData("drag-id")
    const card = findDraggedHandCard(id)
    if (!card || !isSpellCard(card)) return

    e.preventDefault()
    e.stopPropagation()
    const targetIsSelf =
      targetCard.instanceId === champA?.instanceId ||
      cardsA.some(c => c.instanceId === targetCard.instanceId)
    if (playMode === "full_manual") {
      onMove({
        type: "MANUAL_PLAY_CARD",
        cardInstanceId: card.instanceId,
        targetKind: "card",
        resolution: "lasting_target",
        targetOwner: targetIsSelf ? "self" : "opponent",
        targetCardInstanceId: targetCard.instanceId,
      })
      return
    }
    requestSpellCast(card.instanceId, {
      cardInstanceId: targetCard.instanceId,
      owner: targetIsSelf ? "self" : "opponent",
    })
  }

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
                onContextMenu={e => handleCardContextMenu(e, champion)}
                className={styles.championInner}
                onDragOver={e => {
                  const source = e.dataTransfer.getData("drag-source")
                  if (source === "hand") e.preventDefault()
                }}
                onDrop={e => handleCardDrop(e, champion)}
              >
                <img
                  src={cardImageUrl(champion.setId, champion.cardNumber)}
                  alt={champion.name}
                  onError={e => { (e.target as HTMLImageElement).style.display = "none" }}
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
              onContextMenu={e => handleCardContextMenu(e, c)}
              onDragOver={e => {
                const source = e.dataTransfer.getData("drag-source")
                if (source === "hand") e.preventDefault()
              }}
              onDrop={e => handleCardDrop(e, c)}
            >
              <CombatTooltip card={c}>
                <div className={styles.supportInner}>
                  <img
                    src={cardImageUrl(c.setId, c.cardNumber)}
                    alt={c.name}
                    onError={e => { (e.target as HTMLImageElement).style.display = "none" }}
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
        {renderCardStack(champB, cardsB)}
        <div className={styles.infoPanel}>
          {hasLevels && (
            <>
              <span className={`${styles.levelDisplay} ${levelColorClass(bWinning, aWinning)}`}
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
                onChange={e => setInputB(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") submitLevel(playerB, inputB, setInputB, setEditingB)
                  if (e.key === "Escape") { setEditingB(false); setInputB("") }
                }}
                onBlur={() => { setEditingB(false); setInputB("") }}
                className={styles.levelInput}
              />
              <button className={styles.setBtn} onMouseDown={e => { e.preventDefault(); submitLevel(playerB, inputB, setInputB, setEditingB) }}>Set</button>
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
        {renderCardStack(champA, cardsA)}
        <div className={styles.infoPanel}>
          <span className={styles.roleLabel}>{roleA}</span>
          {hasLevels && (
            <>
              <span className={`${styles.levelDisplay} ${levelColorClass(aWinning, bWinning)}`}
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
                onChange={e => setInputA(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") submitLevel(playerA, inputA, setInputA, setEditingA)
                  if (e.key === "Escape") { setEditingA(false); setInputA("") }
                }}
                onBlur={() => { setEditingA(false); setInputA("") }}
                className={styles.levelInput}
              />
              <button className={styles.setBtn} onMouseDown={e => { e.preventDefault(); submitLevel(playerA, inputA, setInputA, setEditingA) }}>Set</button>
            </div>
          )}
        </div>
      </div>

      {/* Target info */}
      <div className={styles.targetInfo}>
        Player A attacking Player B's realm <strong>{combat.targetSlot}</strong>
      </div>
    </div>
  )
}
