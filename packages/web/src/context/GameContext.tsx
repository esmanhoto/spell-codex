// Re-export shared types (kept here for backward compat with component imports)
export type { ContextMenuAction, ContextMenuState } from "./types.ts"

// Re-export individual context hooks
export { useBoard } from "./BoardContext.tsx"
export { useCombat } from "./CombatContext.tsx"
export { useMoves } from "./MovesContext.tsx"
export { useGameUI } from "./UIContext.tsx"

import { useBoard } from "./BoardContext.tsx"
import { useCombat } from "./CombatContext.tsx"
import { useMoves } from "./MovesContext.tsx"
import { useGameUI } from "./UIContext.tsx"

import type { BoardContextType } from "./BoardContext.tsx"
import type { CombatContextType } from "./CombatContext.tsx"
import type { MovesContextType } from "./MovesContext.tsx"
import type { UIContextType } from "./UIContext.tsx"

export type GameContextType = BoardContextType &
  CombatContextType &
  MovesContextType &
  UIContextType

// Convenience hook — subscribes to all 4 contexts.
// Prefer specific hooks (useBoard, useCombat, useMoves, useGameUI) in components
// that only need a subset, to avoid re-renders from unrelated context changes.
export function useGame(): GameContextType {
  return {
    ...useBoard(),
    ...useCombat(),
    ...useMoves(),
    ...useGameUI(),
  }
}
