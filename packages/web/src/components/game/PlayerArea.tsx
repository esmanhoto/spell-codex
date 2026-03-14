import { useState } from "react"
import { ChevronUp, ChevronDown } from "lucide-react"
import type { PlayerBoard } from "../../api.ts"
import { useBoard } from "../../context/BoardContext.tsx"
import { Formation } from "./Formation.tsx"
import { Pool } from "./Pool.tsx"
import styles from "./PlayerArea.module.css"

export function PlayerArea({
  board,
  playerId,
  isOpponent,
  attackedSlot,
}: {
  board: PlayerBoard
  playerId: string
  isOpponent: boolean
  attackedSlot?: string
}) {
  const { lingeringSpellsByPlayer } = useBoard()
  const lingering = lingeringSpellsByPlayer[playerId] ?? []
  const [formationCollapsed, setFormationCollapsed] = useState(false)

  // For opponent (top), formation is first (closer to divider), then pool
  // For own player (bottom), pool is first, then formation (closer to divider)
  const formation = isOpponent ? (
    <div className={styles.zonePanel}>
      <Formation
        slots={board.formation}
        formationOwnerId={playerId}
        isOpponent
        {...(attackedSlot ? { attackedSlot } : {})}
      />
    </div>
  ) : (
    <div className={styles.zonePanelCollapsible}>
      <div
        className={styles.collapseRow}
        data-testid="formation-collapse-toggle"
        onClick={() => setFormationCollapsed((c) => !c)}
      >
        <span className={styles.zoneLabel}>Formation</span>
        <span className={styles.collapseBtn}>
          {formationCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </span>
      </div>
      {!formationCollapsed && (
        <div className={styles.formationBody} data-testid="formation-body-self">
          <Formation
            slots={board.formation}
            formationOwnerId={playerId}
            isOpponent={false}
            {...(attackedSlot ? { attackedSlot } : {})}
          />
        </div>
      )}
    </div>
  )

  const pool = (
    <div className={styles.zonePanel}>
      <Pool
        entries={board.pool}
        isOpponent={isOpponent}
        lingeringSpells={lingering}
        ownerId={playerId}
      />
    </div>
  )

  return (
    <div className={styles.area}>
      {isOpponent ? (
        <>
          {pool}
          {formation}
        </>
      ) : (
        <>
          {formation}
          {pool}
        </>
      )}
    </div>
  )
}
