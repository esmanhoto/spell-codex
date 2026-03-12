import { Castle, Shield, Sparkles, Swords, Trash2 } from "lucide-react"
import type { Move } from "../../api.ts"
import styles from "./PhaseTracker.module.css"

const PHASES = [
  { key: "START_OF_TURN", label: "Draw", icon: <Sparkles size={14} /> },
  { key: "PLAY_REALM", label: "Realm", icon: <Castle size={14} /> },
  { key: "POOL", label: "Pool", icon: <Shield size={14} /> },
  { key: "COMBAT", label: "Combat", icon: <Swords size={14} /> },
  { key: "PHASE_FIVE", label: "Discard", icon: <Trash2 size={14} /> },
]

interface PhaseTrackerProps {
  phase: string
  turnNumber: number
  activePlayerName: string
  isMyTurn: boolean
  endTurnMove: Move | undefined
  onMove: (m: Move) => void
  canEndTurn: boolean
}

export function PhaseTracker({
  phase,
  turnNumber,
  activePlayerName,
  isMyTurn,
  endTurnMove,
  onMove,
  canEndTurn,
}: PhaseTrackerProps) {
  const currentIdx = PHASES.findIndex((p) => p.key === phase)

  return (
    <div className={styles.container} data-testid="phase-tracker">
      {/* Turn number */}
      <div className={styles.turnNumber} data-testid="turn-info">Turn {turnNumber}</div>

      {/* Active player indicator */}
      <div className={styles.activePlayer}>
        <span className={styles.pulseDot} />
        <span className={styles.activePlayerName} data-testid="active-player-label">
          {activePlayerName}'s Turn
        </span>
      </div>

      {/* Phase track */}
      <div className={styles.track}>
        {/* Background connecting line */}
        <div className={styles.lineBase} />
        {/* Gold progress line */}
        <div
          className={styles.lineProgress}
          style={{
            width:
              currentIdx > 0
                ? `calc(${(currentIdx / (PHASES.length - 1)) * 100}% - 32px)`
                : "0px",
          }}
        />

        {PHASES.map((p, i) => {
          const isActive = i === currentIdx
          const isPast = i < currentIdx
          return (
            <div key={p.key} className={styles.phaseItem}>
              <div
                data-testid={`phase-pill-${p.key}`}
                data-active={isActive ? "true" : "false"}
                className={`${styles.circle} ${isActive ? styles.circleActive : ""} ${isPast ? styles.circlePast : ""}`}
              >
                {p.icon}
              </div>
              <span
                className={`${styles.phaseLabel} ${isActive ? styles.phaseLabelActive : ""} ${isPast ? styles.phaseLabelPast : ""}`}
              >
                {p.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* End Turn button — always reserve space to keep circles vertically centered */}
      <button
        className={styles.endTurnBtn}
        data-testid="pass-btn"
        data-move-type="END_TURN"
        disabled={!isMyTurn || !canEndTurn || !endTurnMove}
        style={{ visibility: isMyTurn ? "visible" : "hidden" }}
        onClick={() => endTurnMove && onMove(endTurnMove)}
      >
        End Turn
      </button>
    </div>
  )
}
