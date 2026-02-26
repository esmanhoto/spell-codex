// Public API

export { applyMove, EngineError } from "./engine.ts"
export { getLegalMoves, isUniqueInPlay, isAttackable, getLegalRealmSlots } from "./legal-moves.ts"
export { initGame } from "./init.ts"
export { calculateCombatLevel, hasWorldMatch, resolveCombatRound, getLosingPlayer } from "./combat.ts"

export {
  seededShuffle, createInstance, createInstanceId, _resetInstanceCounter,
  parseLevel, parseMagicalItemBonus,
  isChampionType, isSpellType, isCosmosCard,
  requiresManualResolution,
  updatePlayer, removeFromHand, takeCards, nextPlayer, opponentOf,
} from "./utils.ts"

export { CardTypeId, CHAMPION_TYPE_IDS, SPELL_TYPE_IDS, HAND_SIZES, PROTECTS, PROTECTED_BY, WORLD_BONUS } from "./constants.ts"

export type {
  // Primitives
  PlayerId, CardInstanceId, FormationSlot, CardLevel, SupportRef, WorldId,
  // Card data
  CardData, CardInstance,
  // Formation
  RealmSlot, Formation,
  // Player state
  LimboEntry, PoolEntry, PlayerState,
  // Combat
  CombatRoundPhase, CombatRoundOutcome, CombatState,
  // Game state
  GameState,
  // Moves & results
  Move, EngineResult, GameEvent,
  // Config
  PlayerConfig, GameConfig,
  // Effects
  CardEffect, EffectCondition, EffectTrigger, CardEffectSpec,
  // Pending effects (Tier 2 manual resolution)
  TargetScope, PendingEffect,
} from "./types.ts"

export { Phase } from "./types.ts"

export { pickMove } from "./bot.ts"
