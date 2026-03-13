import React from "react"
import type { Move } from "../api.ts"

export interface MovesContextType {
  legalMoves: Move[]
  legalMovesPerPlayer?: Record<string, Move[]>
  activePlayer: string
  phase: string
  turnNumber: number
  onMove: (m: Move | Move[]) => void
}

export const MovesContext = React.createContext<MovesContextType>({
  legalMoves: [],
  activePlayer: "",
  phase: "",
  turnNumber: 0,
  onMove: () => {},
})

export function useMoves() {
  return React.useContext(MovesContext)
}
