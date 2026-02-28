import { useGame } from "../../context/GameContext.tsx"
import { nameOfCard } from "../../utils/card-helpers.ts"
import styles from "./PendingEffects.module.css"

export function PendingEffects() {
  const { pendingEffects, legalMoves, onMove, allBoards, combat } = useGame()

  if (pendingEffects.length === 0) return null

  const effect = pendingEffects[0]!

  const nameOf = (id: string): string => {
    if (combat) {
      const all = [...combat.attackerCards, ...combat.defenderCards,
        ...(combat.attacker ? [combat.attacker] : []),
        ...(combat.defender ? [combat.defender] : [])]
      const found = all.find(c => c.instanceId === id)
      if (found) return found.name
    }
    return nameOfCard(id, allBoards)
  }

  const resolveMoves = legalMoves.filter(m => m.type === "RESOLVE_EFFECT")
  const skipMove     = legalMoves.find(m => m.type === "SKIP_EFFECT")
  const isWaiting    = !skipMove

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span><strong>{effect.cardName}</strong> — manual resolution required</span>
        {pendingEffects.length > 1 && <span className={styles.count}>+{pendingEffects.length - 1} more</span>}
      </div>
      {effect.cardDescription && <p className={styles.text}>{effect.cardDescription}</p>}
      {isWaiting ? (
        <p style={{ color: "#888", fontSize: 12 }}>Waiting for the other player to resolve this effect...</p>
      ) : (
        <div className={styles.actions}>
          {resolveMoves.length > 0 && (
            <div className={styles.targets}>
              <span className={styles.targetLabel}>Remove from combat:</span>
              <div className={styles.buttons}>
                {resolveMoves.map((m, i) => (
                  <button key={i} className={styles.actionBtn} onClick={() => onMove(m)}>
                    {nameOf((m as { targetId: string }).targetId)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            className={styles.skipBtn}
            onClick={() => onMove({ type: "SKIP_EFFECT" })}
            style={{ marginTop: resolveMoves.length > 0 ? 8 : 0 }}
          >
            No effect / Skip
          </button>
        </div>
      )}
    </div>
  )
}
