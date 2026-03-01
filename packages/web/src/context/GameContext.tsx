import React from "react"
import type { Move, PlayerBoard, CombatInfo } from "../api.ts"

export interface ContextMenuAction {
  label: string
  move:  Move
}

export interface ContextMenuState {
  x:       number
  y:       number
  actions: ContextMenuAction[]
}

export interface GameContextType {
  // Core game state
  playerA:         string
  playerB:         string
  myPlayerId:      string
  activePlayer:    string
  phase:           string
  turnNumber:      number
  winner:          string | null
  allBoards:       Record<string, PlayerBoard>
  combat:          CombatInfo | null

  // Moves
  legalMoves:      Move[]
  legalMovesPerPlayer?: Record<string, Move[]>
  onMove:          (m: Move) => void

  // Selection
  selectedId:      string | null
  onSelect:        (id: string | null) => void

  // Context menu
  contextMenu:     ContextMenuState | null
  openContextMenu: (x: number, y: number, actions: ContextMenuAction[]) => void
  closeContextMenu: () => void

  // Warnings
  warningMessage: string | null
  showWarning: (message: string) => void
  clearWarning: () => void
}

export const GameContext = React.createContext<GameContextType>({
  playerA:         "",
  playerB:         "",
  myPlayerId:      "",
  activePlayer:    "",
  phase:           "",
  turnNumber:      0,
  winner:          null,
  allBoards:       {},
  combat:          null,
  legalMoves:      [],
  onMove:          () => {},
  selectedId:      null,
  onSelect:        () => {},
  contextMenu:     null,
  openContextMenu: () => {},
  closeContextMenu: () => {},
  warningMessage:  null,
  showWarning:     () => {},
  clearWarning:    () => {},
})

export function useGame() {
  return React.useContext(GameContext)
}
