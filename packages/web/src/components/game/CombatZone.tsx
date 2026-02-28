import { useState } from "react"
import { useGame } from "../../context/GameContext.tsx"
import { cardImageUrl } from "../../utils/card-helpers.ts"
import type { CardInfo } from "../../api.ts"
import { CardTooltip } from "./CardTooltip.tsx"
import styles from "./CombatZone.module.css"

export function CombatZone() {
  const { combat, playerA, playerB, legalMoves, onMove } = useGame()
  const [atkInput, setAtkInput] = useState("")
  const [defInput, setDefInput] = useState("")

  if (!combat) return null

  const atkLabel = combat.attackingPlayer === playerA ? "Player A" : "Player B"
  const defLabel = combat.defendingPlayer === playerA ? "Player A" : "Player B"

  const hasLevels = combat.attacker !== null && combat.defender !== null
  const displayAtkLevel = combat.attackerManualLevel ?? combat.attackerLevel
  const displayDefLevel = combat.defenderManualLevel ?? combat.defenderLevel
  const atkWinning = displayAtkLevel > displayDefLevel
  const defWinning = displayDefLevel >= displayAtkLevel

  const canEditLevel = legalMoves.some(m => m.type === "MANUAL_SET_COMBAT_LEVEL")

  function submitLevel(playerId: string, input: string, setter: (v: string) => void) {
    const level = parseInt(input, 10)
    if (!isNaN(level)) {
      onMove({ type: "MANUAL_SET_COMBAT_LEVEL", playerId, level })
      setter("")
    }
  }

  function switchableImg(c: CardInfo) {
    return (
      <CardTooltip key={c.instanceId} card={c}>
        <img
          src={cardImageUrl(c.setId, c.cardNumber)}
          alt={c.name}
          className={styles.extraImg}
          onError={e => { (e.target as HTMLImageElement).style.display = "none" }}
          onContextMenu={canEditLevel ? e => { e.preventDefault(); onMove({ type: "MANUAL_SWITCH_COMBAT_SIDE", cardInstanceId: c.instanceId }) } : undefined}
          style={canEditLevel ? { cursor: "context-menu" } : undefined}
          title={canEditLevel ? "Right-click to switch sides" : c.description}
        />
      </CardTooltip>
    )
  }

  return (
    <div className={styles.combat}>
      <div className={styles.header}>
        <span>
          <strong>Combat</strong>
          <span className={styles.target}> — {atkLabel} → {defLabel}'s slot <strong>{combat.targetSlot}</strong></span>
        </span>
        <span className={styles.phase}>{combat.roundPhase.replace(/_/g, " ")}</span>
      </div>

      {hasLevels && (
        <div className={styles.scoreRow}>
          <div className={styles.scoreBlock}>
            <span className={`${styles.scoreLarge} ${atkWinning ? styles.winning : styles.losing}`}>{displayAtkLevel}</span>
            {combat.attackerManualLevel != null && <span className={styles.manualTag}>manual</span>}
          </div>
          <span className={styles.vs}>vs</span>
          <div className={styles.scoreBlock}>
            <span className={`${styles.scoreLarge} ${defWinning ? styles.defWinning : styles.losing}`}>{displayDefLevel}</span>
            {combat.defenderManualLevel != null && <span className={styles.manualTag}>manual</span>}
          </div>
        </div>
      )}

      <div className={styles.sides}>
        <div className={`${styles.side} ${styles.sideAtk}`}>
          <div className={styles.sideLabel}>Attacker · {atkLabel}</div>
          <div className={styles.cardsRow}>
            {combat.attacker && (
              <CardTooltip card={combat.attacker}>
                <img src={cardImageUrl(combat.attacker.setId, combat.attacker.cardNumber)} alt={combat.attacker.name}
                  className={styles.championImg} onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
              </CardTooltip>
            )}
            {combat.attackerCards.map(c => switchableImg(c))}
          </div>
          <div className={styles.levelDetail}>
            {combat.attacker && <>base {combat.attacker.level ?? 0}</>}
            {combat.attackerCards.map(c => <span key={c.instanceId}> +{c.name}</span>)}
            {combat.attacker && <> = <strong>{displayAtkLevel}</strong></>}
          </div>
          {canEditLevel && (
            <div className={styles.levelEdit}>
              <input type="number" placeholder="Override…" value={atkInput}
                onChange={e => setAtkInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submitLevel(combat.attackingPlayer, atkInput, setAtkInput)}
                className={styles.levelInput} />
              <button className={styles.setBtn} onClick={() => submitLevel(combat.attackingPlayer, atkInput, setAtkInput)}>Set</button>
            </div>
          )}
        </div>

        <div className={styles.centerDivider} />

        <div className={`${styles.side} ${styles.sideDef}`}>
          <div className={styles.sideLabel}>Defender · {defLabel}</div>
          <div className={styles.cardsRow}>
            {combat.defenderCards.map(c => switchableImg(c))}
            {combat.defender && (
              <CardTooltip card={combat.defender}>
                <img src={cardImageUrl(combat.defender.setId, combat.defender.cardNumber)} alt={combat.defender.name}
                  className={styles.championImg} onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
              </CardTooltip>
            )}
          </div>
          <div className={styles.levelDetail}>
            {combat.defender && <>base {combat.defender.level ?? 0}</>}
            {combat.defenderCards.map(c => <span key={c.instanceId}> +{c.name}</span>)}
            {combat.defender && <> = <strong>{displayDefLevel}</strong></>}
          </div>
          {canEditLevel && (
            <div className={styles.levelEdit}>
              <input type="number" placeholder="Override…" value={defInput}
                onChange={e => setDefInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submitLevel(combat.defendingPlayer, defInput, setDefInput)}
                className={styles.levelInput} />
              <button className={styles.setBtn} onClick={() => submitLevel(combat.defendingPlayer, defInput, setDefInput)}>Set</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
