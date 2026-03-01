import { useState, useCallback } from "react"
import type { Move } from "../api.ts"

/**
 * Phase tracking hook. All phase transitions are now handled by the engine:
 * - Draw: PASS from StartOfTurn draws cards and advances to PlayRealm
 * - Realm/Holding/Rebuild: handler auto-advances to Pool
 * - PlaceChampion/AttachItem: handler auto-advances from PlayRealm to Pool
 * - DeclareAttack: handler auto-advances to Combat
 * - DiscardCard: handler auto-advances to PhaseFive
 * - EndTurn: handler skips to end of turn
 *
 * No UI auto-PASS needed — the player explicitly chooses every action.
 */
export function usePhaseTracker(
  _phase: string,
  _legalMoves: Move[],
  _onMove: (m: Move) => void,
  _activePlayer: string,
  _myPlayerId: string,
  _lastMoveType: string | null,
) {
  const [outOfOrderAlert, setOutOfOrderAlert] = useState<string | null>(null)
  const dismissAlert = useCallback(() => setOutOfOrderAlert(null), [])

  return { outOfOrderAlert, dismissAlert }
}
