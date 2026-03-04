import type { CardData, GameConfig } from "../src/types.ts"

// ─── Minimal test card data ───────────────────────────────────────────────────
// These represent the core card types needed to exercise the engine.
// Real card data is in packages/data/cards/*.json

export const REALM_FR: CardData = {
  setId: "1st", cardNumber: 1,
  name: "Waterdeep",
  typeId: 13,      // Realm
  worldId: 1,      // Forgotten Realms
  isAvatar: false,
  level: null,
  description: "Any champion can use wizard spells when defending Waterdeep.",
  attributes: ["Coast"],
  supportIds: ["d19", "o19"],  // Wizard spells when defending
  effects: [],
}

export const REALM_GENERIC: CardData = {
  setId: "1st", cardNumber: 50,
  name: "Village",
  typeId: 13,
  worldId: 0,
  isAvatar: false,
  level: null,
  description: "",
  attributes: [],
  supportIds: [],
  effects: [],
}

export const CHAMPION_CLERIC_FR: CardData = {
  setId: "1st", cardNumber: 10,
  name: "Alustriel",
  typeId: 5,       // Cleric
  worldId: 1,      // Forgotten Realms
  isAvatar: false,
  level: 6,
  description: "Alustriel can use cleric spells and magical items.",
  attributes: [],
  supportIds: [1, 2, 4, 9],
  effects: [],
}

export const CHAMPION_WIZARD_FR: CardData = {
  setId: "1st", cardNumber: 20,
  name: "Elminster",
  typeId: 20,      // Wizard
  worldId: 1,
  isAvatar: false,
  level: 8,
  description: "Elminster can use wizard spells.",
  attributes: [],
  supportIds: [1, 2, 9, "d19", "o19"],
  effects: [],
}

export const CHAMPION_HERO_GENERIC: CardData = {
  setId: "1st", cardNumber: 30,
  name: "Sir Roland",
  typeId: 7,       // Hero
  worldId: 0,
  isAvatar: false,
  level: 5,
  description: "Sir Roland is a flyer.",
  attributes: ["Flyer"],
  supportIds: [1, 9],
  effects: [],
}

export const ALLY_PLUS4: CardData = {
  setId: "1st", cardNumber: 100,
  name: "Dwarven Axemen",
  typeId: 1,
  worldId: 0,
  isAvatar: false,
  level: "+4",
  description: "Adds +4 to champion's level.",
  attributes: ["Dwarf"],
  supportIds: [],
  effects: [],
}

export const ALLY_SLASH: CardData = {
  setId: "1st", cardNumber: 101,
  name: "Griffin Riders",
  typeId: 1,
  worldId: 0,
  isAvatar: false,
  level: "+3/+2",
  description: "Adds +3 when attacking, +2 when defending.",
  attributes: [],
  supportIds: [],
  effects: [],
}

export const MAGICAL_ITEM_PLUS2_PLUS1: CardData = {
  setId: "1st", cardNumber: 200,
  name: "Sword of Valor",
  typeId: 9,
  worldId: 0,
  isAvatar: false,
  level: null,
  description: "Adds +2/+1 to bearer's level in combat.",
  attributes: [],
  supportIds: [],
  effects: [],
}

export const ARTIFACT_FR: CardData = {
  setId: "1st", cardNumber: 300,
  name: "Hand of Vecna",
  typeId: 2,       // Artifact — subject to Rule of Cosmos
  worldId: 1,
  isAvatar: false,
  level: null,
  description: "Grants the bearer +4 levels in combat.",
  attributes: [],
  supportIds: [],
  effects: [],
}

export const HOLDING_FR: CardData = {
  setId: "1st", cardNumber: 400,
  name: "Tower of High Sorcery",
  typeId: 8,       // Holding — subject to Rule of Cosmos
  worldId: 1,
  isAvatar: false,
  level: null,
  description: "The attached realm can use wizard spells.",
  attributes: [],
  supportIds: [],
  effects: [],
}

export const WIZARD_SPELL: CardData = {
  setId: "1st", cardNumber: 500,
  name: "Fireball",
  typeId: 19,
  worldId: 0,
  isAvatar: false,
  level: "+3",
  description: "Adds +3 to champion's level.",
  attributes: [],
  supportIds: [],
  effects: [],
}

export const EVENT_CARD: CardData = {
  setId: "1st", cardNumber: 510,
  name: "Magical Storm",
  typeId: 6,       // Event — goes to Abyss when discarded
  worldId: 0,
  isAvatar: false,
  level: null,
  description: "Destroys all magical items in play.",
  attributes: [],
  supportIds: [],
  effects: [],
}

// ─── Deck Builders ────────────────────────────────────────────────────────────

/**
 * Builds a minimal 55-card deck suitable for engine tests.
 * Real decks would have exactly 55 cards; for tests we use fewer.
 */
export function makeDeck(cards: CardData[], total = 55): CardData[] {
  const deck: CardData[] = []
  let i = 0
  while (deck.length < total) {
    deck.push(cards[i % cards.length]!)
    i++
  }
  return deck
}

export const DECK_P1: CardData[] = makeDeck([
  REALM_FR, REALM_GENERIC,
  CHAMPION_CLERIC_FR, CHAMPION_WIZARD_FR, CHAMPION_HERO_GENERIC,
  ALLY_PLUS4, ALLY_SLASH,
  MAGICAL_ITEM_PLUS2_PLUS1, WIZARD_SPELL, EVENT_CARD,
])

export const DECK_P2: CardData[] = makeDeck([
  REALM_GENERIC, REALM_FR,
  CHAMPION_HERO_GENERIC, CHAMPION_CLERIC_FR,
  ALLY_PLUS4, MAGICAL_ITEM_PLUS2_PLUS1, WIZARD_SPELL,
])

export const DEFAULT_CONFIG: GameConfig = {
  gameId: "test-game-1",
  players: [
    { id: "p1", deckCards: DECK_P1 },
    { id: "p2", deckCards: DECK_P2 },
  ],
  seed: 42,
  playMode: "semi_auto",
  formationSize: 6,
}
