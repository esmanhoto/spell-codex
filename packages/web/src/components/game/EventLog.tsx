import { useRef, useEffect, useState } from "react"
import { useGame } from "../../context/GameContext.tsx"
import type { GameEvent } from "../../api.ts"
import styles from "./EventLog.module.css"

export function EventLog({ events }: { events: GameEvent[] }) {
  const { playerA } = useGame()
  const logRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(true)

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [events])

  function playerLabel(id: string): string {
    return id === playerA ? "Player A" : "Player B"
  }

  function formatEvent(e: GameEvent): string {
    const p = e.playerId ? playerLabel(e.playerId as string) : ""
    switch (e.type) {
      case "PLAY_MODE_CHANGED": return `  ${p} switched mode to ${(e.mode as string).replace("_", " ")}`
      case "MANUAL_ACTIVE_PLAYER_SET": return `  ${p} set active player to ${playerLabel(e.activePlayer as string)}`
      case "MANUAL_DRAW_COUNT_SET": return `  ${p} set manual draw count to ${e.count as number}`
      case "MANUAL_MAX_HAND_SIZE_SET": return `  ${p} set manual hand limit to ${e.size as number}`
      case "TURN_STARTED":       return `— Turn ${e.turn as number}: ${playerLabel(e.playerId as string)}`
      case "PHASE_CHANGED":      return `  Phase: ${(e.phase as string).replace(/_/g, " ")}`
      case "CARDS_DRAWN":        return `  ${p} drew ${e.count as number} card(s)`
      case "CHAMPION_PLACED":    return `  ${p} placed a champion`
      case "CHAMPION_DISCARDED": return `  ${p} champion discarded`
      case "CHAMPION_TO_LIMBO":  return `  ${p} champion sent to Limbo`
      case "CHAMPION_FROM_LIMBO":return `  ${p} champion returned from Limbo`
      case "REALM_PLAYED":       return `  ${p} played realm in slot ${e.slot as string}`
      case "REALM_RAZED":        return `  ${p} realm slot ${e.slot as string} razed!`
      case "REALM_REBUILT":      return `  ${p} rebuilt realm slot ${e.slot as string}`
      case "HOLDING_PLAYED":     return `  ${p} played holding`
      case "HOLDING_REVEAL_TOGGLED": return `  ${p} ${(e.revealedToAll as boolean) ? "revealed" : "hid"} a holding`
      case "ITEM_ATTACHED":      return `  ${p} attached item`
      case "ATTACK_DECLARED":    return `  ${playerLabel(e.attackingPlayer as string)} attacks ${playerLabel(e.defendingPlayer as string)} slot ${e.slot as string}`
      case "DEFENSE_DECLARED":   return `  ${p} defends`
      case "DEFENSE_DECLINED":   return `  ${p} declines defense`
      case "COMBAT_CARD_PLAYED": return `  ${p} played combat card`
      case "COMBAT_RESOLVED":    return `  Combat: ${e.attackerLevel as number} vs ${e.defenderLevel as number} → ${(e.outcome as string).replace(/_/g, " ")}`
      case "SPOILS_EARNED":      return `  ${p} earned spoils`
      case "MANUAL_ZONE_MOVE":   return `  ${p} moved card (${e.from as string} → ${e.to as string})`
      case "MANUAL_REALM_RAZED": return `  ${p} manually razed realm slot ${e.slot as string}`
      case "MANUAL_CARDS_DRAWN": return `  ${p} manually drew ${e.count as number} card(s)`
      case "COMBAT_LEVEL_SET":   return `  ${playerLabel(e.playerId as string)} set level to ${e.level as number}`
      case "PHASE3_SPELL_CAST":  return `  ${p} cast ${(e.cardName as string)}${(e.keepInPlay as boolean) ? " (kept in play)" : ""}`
      case "GAME_OVER":          return `${playerLabel(e.winner as string)} WINS!`
      default:                   return `  ${e.type}`
    }
  }

  return (
    <>
      <button
        className={`${styles.toggle} ${collapsed ? "" : styles.open}`}
        onClick={() => setCollapsed(v => !v)}
      >
        LOG
      </button>
      <div className={`${styles.log} ${collapsed ? styles.collapsed : ""}`}>
        <div className={styles.header}>
          <span>Game Log</span>
          <button className={styles.closeBtn} onClick={() => setCollapsed(true)}>X</button>
        </div>
        <div className={styles.body} ref={logRef}>
          {events.length === 0 && <p style={{ color: "#888", fontSize: 12 }}>No events yet.</p>}
          {events.map((e, i) => (
            <div key={i} className={`${styles.entry} ${e.type === "TURN_STARTED" || e.type === "GAME_OVER" ? styles.turn : ""}`}>
              {formatEvent(e)}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
