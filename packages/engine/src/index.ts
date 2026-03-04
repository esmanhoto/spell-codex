// Public API

export { applyMove, EngineError } from "./engine.ts"
export { getLegalMoves, isUniqueInPlay, isAttackable, getLegalRealmSlots } from "./legal-moves.ts"
export { getSpellDirection, getCastPhases, canChampionUseSpell } from "./spell-gating.ts"
export { initGame } from "./init.ts"
export {
  calculateCombatLevel,
  hasWorldMatch,
  resolveCombatRound,
  getLosingPlayer,
} from "./combat.ts"
export { validateManualStateForSemiAuto } from "./manual-consistency.ts"
export type { ManualConsistencyIssue } from "./manual-consistency.ts"

export {
  seededShuffle,
  createInstance,
  createInstanceId,
  _resetInstanceCounter,
  parseLevel,
  parseMagicalItemBonus,
  isChampionType,
  isSpellType,
  isCosmosCard,
  updatePlayer,
  removeFromHand,
  takeCards,
  nextPlayer,
  opponentOf,
} from "./utils.ts"

export {
  CardTypeId,
  CHAMPION_TYPE_IDS,
  SPELL_TYPE_IDS,
  HAND_SIZES,
  PROTECTS,
  PROTECTED_BY,
  WORLD_BONUS,
} from "./constants.ts"

export type {
  // Primitives
  PlayerId,
  CardInstanceId,
  FormationSlot,
  CardLevel,
  SupportRef,
  WorldId,
  // Card data
  CardData,
  CardInstance,
  // Formation
  RealmSlot,
  Formation,
  // Player state
  LimboEntry,
  PoolEntry,
  PlayerState,
  // Combat
  CombatRoundPhase,
  CombatRoundOutcome,
  CombatState,
  // Modes
  PlayMode,
  ManualSettings,
  // Game state
  GameState,
  // Moves & results
  Move,
  EngineResult,
  GameEvent,
  // Config
  PlayerConfig,
  GameConfig,
} from "./types.ts"

export { Phase } from "./types.ts"
