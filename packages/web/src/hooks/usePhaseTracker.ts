import { useEffect, useRef, useState, useCallback } from "react"
import type { Move } from "../api.ts"

/**
 * Auto-phase advancement. Tracks what the player does and auto-submits PASS
 * to advance phases. Never bypasses server authority — only submits PASS when
 * it exists in legalMoves.
 *
 * Flow:
 * - PHASE_ONE (Draw): player clicks draw → after draw completes, auto-PASS to phase 2
 * - PHASE_TWO (Realm): player places realm/holding → auto-PASS to phase 3
 * - PHASE_THREE (Pool): player places champion → stays (may want to do more)
 * - PHASE_FOUR (Combat): manual — player attacks or ends
 * - PHASE_FIVE (End): player discards or ends turn
 *
 * Out-of-order alert: if player tries to do a phase-2 action in phase 3+,
 * show a dismissible warning.
 */
export function usePhaseTracker(
  phase: string,
  legalMoves: Move[],
  onMove: (m: Move) => void,
  activePlayer: string,
  myPlayerId: string,
  lastMoveType: string | null,
) {
  const prevPhaseRef = useRef(phase)
  const lastMoveRef = useRef(lastMoveType)
  const [outOfOrderAlert, setOutOfOrderAlert] = useState<string | null>(null)

  // Track the last move type
  useEffect(() => {
    lastMoveRef.current = lastMoveType
  }, [lastMoveType])

  useEffect(() => {
    if (activePlayer !== myPlayerId) {
      prevPhaseRef.current = phase
      return
    }

    const passMove = legalMoves.find(m => m.type === "PASS")
    if (!passMove) {
      prevPhaseRef.current = phase
      return
    }

    const lastMove = lastMoveRef.current

    // Auto-advance: draw phase done → go to realm phase
    // Cards are drawn automatically at phase start. If PASS is the only meaningful action, advance.
    if (phase === "PHASE_ONE") {
      const hasDrawActions = legalMoves.some(m =>
        m.type === "MANUAL_DRAW_CARDS" || m.type === "PLAY_EVENT"
      )
      if (!hasDrawActions) {
        // Only pass available (or pass + manual stuff) — auto-advance
        const hasOnlyPassAndManual = legalMoves.every(m =>
          m.type === "PASS" || m.type.startsWith("MANUAL_")
        )
        if (hasOnlyPassAndManual) {
          onMove(passMove)
          prevPhaseRef.current = phase
          return
        }
      }
    }

    // Auto-advance: after placing realm/holding → go to pool phase
    if (phase === "PHASE_TWO" && lastMove &&
      (lastMove === "PLAY_REALM" || lastMove === "PLAY_HOLDING" || lastMove === "REBUILD_REALM")) {
      onMove(passMove)
      prevPhaseRef.current = phase
      return
    }

    prevPhaseRef.current = phase
  }, [phase, legalMoves, onMove, activePlayer, myPlayerId, lastMoveType])

  const dismissAlert = useCallback(() => setOutOfOrderAlert(null), [])

  return { outOfOrderAlert, dismissAlert }
}
