import { useEffect, useRef } from "react"
import type { Move } from "../api.ts"

/**
 * Auto-phase advancement. Submits PASS moves from legalMoves when appropriate,
 * never bypassing server authority.
 */
export function usePhaseTracker(
  phase: string,
  legalMoves: Move[],
  onMove: (m: Move) => void,
  activePlayer: string,
  myPlayerId: string,
) {
  const prevPhaseRef = useRef(phase)

  useEffect(() => {
    // Only auto-advance for the active player (local perspective)
    if (activePlayer !== myPlayerId) return

    const passMove = legalMoves.find(m => m.type === "PASS")
    if (!passMove) return

    // Auto-advance after draw phase (phase 1 → 2)
    if (prevPhaseRef.current === "PHASE_ONE" && phase === "PHASE_ONE") {
      // The draw happens automatically on phase start; if only PASS is available, auto-advance
      const hasNonPassMoves = legalMoves.some(m => m.type !== "PASS")
      if (!hasNonPassMoves) {
        onMove(passMove)
      }
    }

    prevPhaseRef.current = phase
  }, [phase, legalMoves, onMove, activePlayer, myPlayerId])
}
