// ─── Card ────────────────────────────────────────────────────────────────────

export type CardRarity = "M" | "C" | "UC" | "R" | "VR" | "S" | "V"

/**
 * Level values:
 *   number  → base champion level (e.g. 5)
 *   string  → bonus with explicit sign or slash (e.g. "+4", "+2/+1")
 *   null    → no level (non-champion cards: realms, spells, events, etc.)
 */
export type CardLevel = number | string | null

/**
 * Support reference in supportIds.
 *   number  → card type ID the champion can use (e.g. 1 = Ally, 2 = Artifact)
 *   string  → "d{typeId}" or "o{typeId}" for spells/abilities:
 *             "d" = defensive direction (affects your own side)
 *             "o" = offensive direction (affects opponent's side)
 *             e.g. "d19" = defensive Wizard Spell, "o4" = offensive Cleric Spell
 */
export type SupportRef = number | string

/**
 * World IDs — from CrossFire Scripts/CommonV.tcl worldInfo.
 * Field 4 of every card record is this integer.
 *
 *   0 = None / Generic (no world affiliation)
 *   1 = Forgotten Realms
 *   2 = Greyhawk
 *   3 = Ravenloft
 *   4 = Dark Sun
 *   5 = DragonLance
 *   6 = Birthright
 *   7 = AD&D (generic D&D, not world-specific)
 *   9 = No World (explicitly world-agnostic)
 */
export type WorldId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 9

export interface Card {
  setId: string
  cardNumber: number
  level: CardLevel
  typeId: number
  /**
   * World this card belongs to (see WorldId above).
   * Used for: world bonus (+3 in combat), deck format world limits,
   * holding attachment rules (same-world required).
   */
  worldId: WorldId
  /** true = this card is an Avatar variant */
  isAvatar: boolean
  name: string
  description: string
  rarity: CardRarity
  /** e.g. ["Dwarf", "Flyer", "Undead"] — used for attribute-based rules */
  attributes: string[]
  /**
   * What support card types this card can use/receive.
   * On a champion: which card types it can use in combat.
   * On a realm: which spell types can be used when attacking/defending here.
   */
  supportIds: SupportRef[]
  weight: number | null
  /** Reserved field from extraction; runtime currently ignores effects. */
  effects: unknown[]
}

// ─── Card Set ────────────────────────────────────────────────────────────────

export type CardSetClass = "edition" | "booster" | "community" | "international"

export interface CardSet {
  id: string
  name: string
  class: CardSetClass
  cardCount: number
  chaseCount: number
}

// ─── World ───────────────────────────────────────────────────────────────────

export interface World {
  id: WorldId
  name: string
  shortName: string
  iconFile: string
}

// ─── Deck Format ─────────────────────────────────────────────────────────────

export interface TypeLimit {
  min: number
  max: number
  maxCopies: number
}

export interface DeckFormat {
  id: string
  name: string
  /** Total deck size constraints */
  total: { min: number; max: number }
  championCount: { min: number; max: number }
  maxChampionLevels: number
  maxAvatars: number
  /** Per card type name → limits */
  typeLimits: Record<string, TypeLimit>
  /** Per rarity code → limits */
  rarityLimits: Record<string, TypeLimit>
  /** Per world ID → limits */
  worldLimits: Record<string, TypeLimit>
  /** Per set ID → limits */
  setLimits: Record<string, TypeLimit>
  banned: Array<{ setId: string; cardNumber: number }>
  allowed: Array<{ setId: string; cardNumber: number }>
}

// ─── Deck ────────────────────────────────────────────────────────────────────

export interface DeckCard {
  setId: string
  cardNumber: number
}

export interface Deck {
  id: string
  title: string
  authorName: string
  authorEmail: string
  notes: string
  deckSize: number
  cards: DeckCard[]
}
