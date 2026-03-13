import React from "react"
import type { PlayerBoard, CardInfo } from "../api.ts"

export interface BoardContextType {
  playerA: string
  playerB: string
  playerAName: string
  playerBName: string
  myPlayerId: string
  winner: string | null
  handMaxSize: number
  allBoards: Record<string, PlayerBoard>
  lingeringSpellsByPlayer: Record<string, CardInfo[]>
}

export const BoardContext = React.createContext<BoardContextType>({
  playerA: "",
  playerB: "",
  playerAName: "",
  playerBName: "",
  myPlayerId: "",
  winner: null,
  handMaxSize: 8,
  allBoards: {},
  lingeringSpellsByPlayer: {},
})

export function useBoard() {
  return React.useContext(BoardContext)
}
