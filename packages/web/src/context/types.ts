import type { Move } from "../api.ts"

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
