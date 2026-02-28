import type { PlayerBoard } from "../../api.ts"
import { Formation } from "./Formation.tsx"
import { Pool } from "./Pool.tsx"
import styles from "./PlayerArea.module.css"

export function PlayerArea({ board, playerId, isOpponent, attackedSlot }: {
  board:        PlayerBoard
  playerId:     string
  isOpponent:   boolean
  attackedSlot?: string
}) {
  // For opponent (top), formation is first (closer to divider), then pool
  // For own player (bottom), pool is first, then formation (closer to divider)
  const formation = (
    <div className={styles.zonePanel}>
      <Formation
        slots={board.formation}
        formationOwnerId={playerId}
        isOpponent={isOpponent}
        attackedSlot={attackedSlot}
      />
    </div>
  )

  const pool = (
    <div className={styles.zonePanel}>
      <Pool entries={board.pool} isOpponent={isOpponent} />
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
