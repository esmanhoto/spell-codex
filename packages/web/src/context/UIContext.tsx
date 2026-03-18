import React from "react"
import type { Move } from "../api.ts"
import type { ContextMenuAction, ContextMenuState } from "./types.ts"
import type { WarningCode } from "../utils/warnings.ts"

export interface TargetPickerState {
  title: string
  targets: { label: string; move: Move }[]
}

export interface UIContextType {
  selectedId: string | null
  onSelect: (id: string | null) => void
  contextMenu: ContextMenuState | null
  openContextMenu: (x: number, y: number, actions: ContextMenuAction[]) => void
  closeContextMenu: () => void
  targetPicker: TargetPickerState | null
  openTargetPicker: (title: string, targets: { label: string; move: Move }[]) => void
  closeTargetPicker: () => void
  warningMessage: string | null
  warningCode: WarningCode | null
  warningSuppressible: boolean
  warningProceedLabel: string | undefined
  warningConfirmAction: (() => void) | null
  showWarning: (
    message: string,
    code?: WarningCode,
    suppressible?: boolean,
    confirmAction?: () => void,
    proceedLabel?: string,
  ) => void
  suppressWarningCode: (code: WarningCode) => void
  clearWarning: () => void
  rebuildTarget: string | null
  setRebuildTarget: (slot: string | null) => void
  submitRebuild: (cardInstanceIds: [string, string, string]) => void
  requestSpellCast: (
    spellInstanceId: string,
    target?: {
      cardInstanceId: string
      owner: "self" | "opponent"
    },
  ) => void
}

export const UIContext = React.createContext<UIContextType>({
  selectedId: null,
  onSelect: () => {},
  contextMenu: null,
  openContextMenu: () => {},
  closeContextMenu: () => {},
  targetPicker: null,
  openTargetPicker: () => {},
  closeTargetPicker: () => {},
  warningMessage: null,
  warningCode: null,
  warningSuppressible: true,
  warningProceedLabel: undefined,
  warningConfirmAction: null,
  showWarning: () => {},
  suppressWarningCode: () => {},
  clearWarning: () => {},
  rebuildTarget: null,
  setRebuildTarget: () => {},
  submitRebuild: () => {},
  requestSpellCast: () => {},
})

export function useGameUI() {
  return React.useContext(UIContext)
}
