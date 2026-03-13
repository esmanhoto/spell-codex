import React from "react"
import type { CombatInfo, ResolutionContextInfo } from "../api.ts"

export interface CombatContextType {
  combat: CombatInfo | null
  resolutionContext: ResolutionContextInfo | null
}

export const CombatContext = React.createContext<CombatContextType>({
  combat: null,
  resolutionContext: null,
})

export function useCombat() {
  return React.useContext(CombatContext)
}
