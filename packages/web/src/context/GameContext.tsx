import React from "react"
import type { Move, PlayerBoard, CombatInfo, CardInfo } from "../api.ts"
import type { WarningCode } from "../utils/warnings.ts"

export interface ContextMenuAction {
  label: string
  move?: Move
  action?: () => void
}

export interface ContextMenuState {
  x: number
  y: number
  actions: ContextMenuAction[]
}

export interface GameContextType {
  // Core game state
  playerA: string
  playerB: string
  myPlayerId: string
  activePlayer: string
  phase: string
  turnNumber: number
  winner: string | null
  allBoards: Record<string, PlayerBoard>
  lingeringSpellsByPlayer: Record<string, CardInfo[]>
  combat: CombatInfo | null

  // Moves
  legalMoves: Move[]
  legalMovesPerPlayer?: Record<string, Move[]>
  onMove: (m: Move) => void

  // Selection
  selectedId: string | null
  onSelect: (id: string | null) => void

  // Context menu
  contextMenu: ContextMenuState | null
  openContextMenu: (x: number, y: number, actions: ContextMenuAction[]) => void
  closeContextMenu: () => void

  // Warnings
  warningMessage: string | null
  warningCode: WarningCode | null
  warningSuppressible: boolean
  warningConfirmAction: (() => void) | null
  showWarning: (
    message: string,
    code?: WarningCode,
    suppressible?: boolean,
    confirmAction?: () => void,
  ) => void
  suppressWarningCode: (code: WarningCode) => void
  clearWarning: () => void

  // Spell casting UX
  requestSpellCast: (
    spellInstanceId: string,
    target?: {
      cardInstanceId: string
      owner: "self" | "opponent"
    },
  ) => void
}

export const GameContext = React.createContext<GameContextType>({
  playerA: "",
  playerB: "",
  myPlayerId: "",
  activePlayer: "",
  phase: "",
  turnNumber: 0,
  winner: null,
  allBoards: {},
  lingeringSpellsByPlayer: {},
  combat: null,
  legalMoves: [],
  onMove: () => {},
  selectedId: null,
  onSelect: () => {},
  contextMenu: null,
  openContextMenu: () => {},
  closeContextMenu: () => {},
  warningMessage: null,
  warningCode: null,
  warningSuppressible: true,
  warningConfirmAction: null,
  showWarning: () => {},
  suppressWarningCode: () => {},
  clearWarning: () => {},
  requestSpellCast: () => {},
})

export function useGame() {
  return React.useContext(GameContext)
}
