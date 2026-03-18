import type { Move } from "../api.ts"

export interface ContextMenuAction {
  label: string
  move?: Move
  action?: () => void
  disabled?: boolean
}

export interface ContextMenuState {
  x: number
  y: number
  actions: ContextMenuAction[]
}
