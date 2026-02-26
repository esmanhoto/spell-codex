import type {
  CardData, CardInstance, CardInstanceId, CardEffectSpec,
  GameState, PlayerId, PlayerState, EffectCondition,
} from "./types.ts"
import { CHAMPION_TYPE_IDS, COSMOS_TYPE_IDS, SPELL_TYPE_IDS } from "./constants.ts"

// ─── Seeded Random ────────────────────────────────────────────────────────────

/**
 * Deterministic Fisher-Yates shuffle using a Xorshift32 PRNG.
 * The same seed always produces the same permutation.
 */
export function seededShuffle<T>(arr: readonly T[], seed: number): T[] {
  const result = [...arr]
  let s = (seed >>> 0) || 1  // ensure non-zero seed

  function next(): number {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 0x100000000
  }

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    const temp = result[i]!
    result[i] = result[j]!
    result[j] = temp
  }

  return result
}

// ─── Instance Creation ────────────────────────────────────────────────────────

/**
 * Creates a card instance with a caller-supplied instanceId.
 * IDs must be deterministic (based on gameId + player index + deck position)
 * so that repeated calls to reconstructState always produce the same IDs.
 */
export function createInstance(card: CardData, instanceId: string): CardInstance {
  return { instanceId, card }
}

/** @deprecated No-op. Instance IDs are now deterministic; no counter to reset. */
export function _resetInstanceCounter(): void {}

/** @deprecated Use createInstance(card, id) directly. */
export function createInstanceId(prefix: string, idx: number): CardInstanceId {
  return `${prefix}-${idx}`
}

// ─── Level Parsing ────────────────────────────────────────────────────────────

/**
 * Parses a card level to a numeric base value.
 *   5       → 5
 *   null    → 0
 *   "+4"    → 4
 *   "-2"    → -2
 *   "+2/+1" → side="offensive" → 2, side="defensive" → 1
 */
export function parseLevel(
  level: number | string | null,
  side: "offensive" | "defensive" = "offensive",
): number {
  if (level === null) return 0
  if (typeof level === "number") return level

  // "+2/+1" format — slash separates offensive/defensive bonus
  if (level.includes("/")) {
    const [offStr, defStr] = level.split("/")
    const val = side === "offensive"
      ? parseInt(offStr ?? "0", 10)
      : parseInt(defStr ?? "0", 10)
    return isNaN(val) ? 0 : val
  }

  const val = parseInt(level, 10)
  return isNaN(val) ? 0 : val
}

/**
 * Parses a magical item bonus from description text.
 * Looks for "+N/+M" patterns (offensive/defensive).
 * Returns { offensive: 0, defensive: 0 } if not parseable.
 */
export function parseMagicalItemBonus(
  description: string,
): { offensive: number; defensive: number } {
  // "+2/+1" → off=2, def=1
  const slashMatch = description.match(/\+(\d+)\/\+(\d+)/)
  if (slashMatch) {
    return {
      offensive: parseInt(slashMatch[1]!, 10),
      defensive: parseInt(slashMatch[2]!, 10),
    }
  }

  // "+3 Off" / "+2 Def" explicit direction
  const offMatch = description.match(/\+(\d+)\s+Off/i)
  const defMatch = description.match(/\+(\d+)\s+Def/i)
  if (offMatch || defMatch) {
    return {
      offensive: offMatch ? parseInt(offMatch[1]!, 10) : 0,
      defensive: defMatch ? parseInt(defMatch[1]!, 10) : 0,
    }
  }

  // "+3" single value — applies to both
  const singleMatch = description.match(/\+(\d+)/)
  if (singleMatch) {
    const val = parseInt(singleMatch[1]!, 10)
    return { offensive: val, defensive: val }
  }

  return { offensive: 0, defensive: 0 }
}

// ─── Type Predicates ──────────────────────────────────────────────────────────

export function isChampionType(typeId: number): boolean {
  return CHAMPION_TYPE_IDS.has(typeId)
}

export function isSpellType(typeId: number): boolean {
  return SPELL_TYPE_IDS.has(typeId)
}

/** Cards subject to Rule of the Cosmos (globally unique constraint) */
export function isCosmosCard(card: CardData): boolean {
  return COSMOS_TYPE_IDS.has(card.typeId)
}

// ─── Effect Spec Lookup ───────────────────────────────────────────────────────

export function matchesCard(
  cardRef: { setId: string; cardNumber: number },
  instance: CardInstance,
): boolean {
  return cardRef.setId === instance.card.setId &&
    cardRef.cardNumber === instance.card.cardNumber
}

export function findEffectSpec(
  instance: CardInstance,
  effectSpecs: CardEffectSpec[],
): CardEffectSpec | undefined {
  return effectSpecs.find(s => matchesCard(s.cardRef, instance))
}

/**
 * Returns true if this card needs manual resolution.
 * Pure stat cards (allies/magical items with simple bonus text) are always Tier 1.
 * All other cards without a Tier 1 spec fall back to manual resolution.
 */
export function requiresManualResolution(
  instance: CardInstance,
  effectSpecs: CardEffectSpec[],
): boolean {
  const { card } = instance
  if (card.effects.length > 0) return false       // already has Tier 1 spec on card
  if (card.typeId === 1 /* Ally */ && isPureLevelCard(card)) return false
  if (card.typeId === 9 /* MagicalItem */ && isPureLevelCard(card)) return false
  return !findEffectSpec(instance, effectSpecs)    // needs spec or is manual
}

function isPureLevelCard(card: CardData): boolean {
  if (typeof card.level === "number" && card.level > 0) return true
  if (typeof card.level === "string" && /^[+-]\d+(\/[+-]\d+)?$/.test(card.level)) return true
  return false
}

export function conditionMet(
  condition: EffectCondition | undefined,
  champion: CardInstance,
  side: "offensive" | "defensive",
): boolean {
  if (!condition) return true
  switch (condition.when) {
    case "attacking":          return side === "offensive"
    case "defending":          return side === "defensive"
    case "champion_type":      return champion.card.typeId === condition.typeId
    case "champion_attribute": return champion.card.attributes.includes(condition.attribute)
  }
}

// ─── State Helpers ────────────────────────────────────────────────────────────

/** Returns a new GameState with one player's state shallowly updated */
export function updatePlayer(
  state: GameState,
  playerId: PlayerId,
  updates: Partial<PlayerState>,
): GameState {
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...state.players[playerId]!, ...updates },
    },
  }
}

/** Removes an instance from a hand array. Throws if not found. */
export function removeFromHand(
  hand: CardInstance[],
  instanceId: CardInstanceId,
): [CardInstance, CardInstance[]] {
  const idx = hand.findIndex(c => c.instanceId === instanceId)
  if (idx === -1) throw new Error(`Card ${instanceId} not in hand`)
  const card = hand[idx]!
  return [card, [...hand.slice(0, idx), ...hand.slice(idx + 1)]]
}

/** Takes up to n items from the front of an array. Returns [taken, remaining]. */
export function takeCards<T>(arr: T[], n: number): [T[], T[]] {
  return [arr.slice(0, n), arr.slice(n)]
}

/** Returns the next player in rotation order */
export function nextPlayer(state: GameState): PlayerId {
  const idx = state.playerOrder.indexOf(state.activePlayer)
  return state.playerOrder[(idx + 1) % state.playerOrder.length]!
}

/** Returns the opponent's player ID (2-player assumption) */
export function opponentOf(state: GameState, playerId: PlayerId): PlayerId {
  return state.playerOrder.find(id => id !== playerId)!
}
