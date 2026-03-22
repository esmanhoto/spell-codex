// Public API

export { EngineError } from "./errors.ts"
export { applyMove } from "./engine.ts"
export { getLegalMoves, isUniqueInPlay, getLegalRealmSlots } from "./legal-moves.ts"
export {
  getSpellDirection,
  getCastPhases,
  getEffectiveSupportIds,
  canCastWithSupport,
  canChampionUseSpell,
} from "./spell-gating.ts"
export type { SpellCastContext } from "./spell-gating.ts"
export { initGame } from "./init.ts"
export { populateTriggers } from "./triggers.ts"
export {
  calculateCombatLevel,
  hasWorldMatch,
  resolveCombatRound,
  getLosingPlayer,
  getPoolAttachments,
  getCombatRealmContext,
  getCombatLevels,
} from "./combat.ts"

export {
  seededShuffle,
  createInstance,
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
  findOrPromoteChampion,
  formatEmailAsName,
} from "./utils.ts"

export {
  CardTypeId,
  CHAMPION_TYPE_IDS,
  SPELL_TYPE_IDS,
  HAND_SIZES,
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
  // Resolution
  ZoneDestination,
  AttachTarget,
  ResolutionContext,
  // Combat
  CombatRoundPhase,
  CombatRoundOutcome,
  CombatState,
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

export {
  serializeCard,
  serializeFormation,
  serializePool,
  serializeCombat,
} from "./serialize-shared.ts"
