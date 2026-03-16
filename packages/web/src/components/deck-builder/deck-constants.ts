export const CHAMPION_TYPE_IDS = new Set([5, 7, 10, 12, 14, 16, 20])

export const MAX_CHAMPION_LEVELS = 90
export const DECK_SIZE = 55

/** Category definitions with 55-card deck limits from Spellfire rules */
export const CATEGORIES = [
  { key: "realms", label: "Realms", typeIds: [13], min: 8, max: 15 },
  { key: "holdings", label: "Holdings", typeIds: [8], min: 0, max: 6 },
  { key: "champions", label: "Champions", typeIds: [5, 7, 10, 12, 14, 16, 20], min: 1, max: 20 },
  { key: "artifacts", label: "Artifacts", typeIds: [2], min: 0, max: 10 },
  { key: "magicalItems", label: "Magical Items", typeIds: [9], min: 0, max: 12 },
  { key: "events", label: "Events", typeIds: [6], min: 0, max: 10 },
  { key: "allies", label: "Allies", typeIds: [1], min: 0, max: null },
  { key: "rules", label: "Rule Cards", typeIds: [15], min: 0, max: 3 },
  { key: "clericSpells", label: "Cleric Spells", typeIds: [4], min: 0, max: null },
  { key: "wizardSpells", label: "Wizard Spells", typeIds: [19], min: 0, max: null },
] as const

export function parseLevel(level: number | string | null): number | null {
  if (typeof level === "number") return level
  if (typeof level === "string") {
    const n = parseInt(level, 10)
    if (!Number.isNaN(n)) return n
  }
  return null
}
