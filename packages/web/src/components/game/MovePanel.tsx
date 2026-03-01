import { useGame } from "../../context/GameContext.tsx"
import { nameOfCard } from "../../utils/card-helpers.ts"
import { labelMove, moveInvolves, ANCHOR_FREE_TYPES } from "../../utils/move-helpers.ts"
import type { Move } from "../../api.ts"
import styles from "./MovePanel.module.css"

export function MovePanel({ playerId }: { playerId: string }) {
  const { legalMoves, legalMovesPerPlayer, activePlayer, selectedId, onSelect, onMove, allBoards, phase, winner } = useGame()

  if (winner) return null

  const playerMoves = legalMovesPerPlayer?.[playerId] ?? (activePlayer === playerId ? legalMoves : [])
  if (playerMoves.length === 0) return null

  const filteredMoves = selectedId
    ? playerMoves.filter(m => ANCHOR_FREE_TYPES.has(m.type) || moveInvolves(m, selectedId))
    : playerMoves

  const nameOf = (id: string) => nameOfCard(id, allBoards)

  return (
    <div className={styles.panel} data-testid={`move-panel-${playerId}`}>
      <div className={styles.header}>
        <strong>
          {selectedId
            ? `Moves for selected (${filteredMoves.length} of ${playerMoves.length})`
            : `Legal moves (${playerMoves.length})`
          }
        </strong>
        {selectedId && (
          <button className={styles.clearBtn} onClick={() => onSelect(null)}>
            Clear selection
          </button>
        )}
      </div>
      {selectedId && filteredMoves.length === 1 && filteredMoves[0]!.type === "PASS" && (
        <p className={styles.hint}>No moves available for this card — only PASS is shown.</p>
      )}
      <div className={styles.buttons}>
        {filteredMoves.map((m, i) => (
          <button
            key={i}
            data-testid={`move-btn-${playerId}-${i}`}
            data-move-type={m.type}
            className={`${styles.btn} ${m.type === "PASS" ? styles.pass : styles.action}`}
            onClick={() => onMove(m)}
          >
            {labelMove(m, nameOf, phase)}
          </button>
        ))}
      </div>
    </div>
  )
}
