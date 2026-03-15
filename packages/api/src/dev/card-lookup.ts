import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { CardData } from "@spell/engine"

// Cache loaded sets so each JSON file is only read once per process lifetime.
const cache = new Map<string, CardData[]>()

function loadSet(setId: string): CardData[] {
  if (cache.has(setId)) return cache.get(setId)!
  // packages/api/src/dev/ → ../../../data/cards/{setId}.json  (= packages/data/cards/)
  const path = join(import.meta.dir, "../../..", "data", "cards", `${setId}.json`)
  const data = JSON.parse(readFileSync(path, "utf-8")) as CardData[]
  cache.set(setId, data)
  return data
}

/**
 * Looks up a real card by set ID and card number.
 * Throws if the card is not found so scenario definitions fail fast on bad refs.
 */
export function lookupCard(setId: string, cardNumber: number): CardData {
  const cards = loadSet(setId)
  const card = cards.find((c) => c.cardNumber === cardNumber)
  if (!card) throw new Error(`Card not found: setId="${setId}" cardNumber=${cardNumber}`)
  return card
}

type SetMeta = { id: string }

let allSetIds: string[] | null = null

function getAllSetIds(): string[] {
  if (allSetIds) return allSetIds
  const path = join(import.meta.dir, "../../..", "data", "sets.json")
  const sets = JSON.parse(readFileSync(path, "utf-8")) as SetMeta[]
  allSetIds = sets.map((s) => s.id)
  return allSetIds
}

export interface CardSearchResult {
  setId: string
  cardNumber: number
  name: string
  typeId: number
}

/**
 * Searches all card sets by name (case-insensitive substring) and optional typeIds.
 * Returns at most `limit` results.
 */
export function searchCards(query: string, typeIds: number[] | null, limit = 30): CardSearchResult[] {
  const q = query.toLowerCase().trim()
  const results: CardSearchResult[] = []
  for (const setId of getAllSetIds()) {
    let cards: CardData[]
    try {
      cards = loadSet(setId)
    } catch {
      continue
    }
    for (const card of cards) {
      if (q && !card.name.toLowerCase().includes(q)) continue
      if (typeIds && !typeIds.includes(card.typeId)) continue
      results.push({ setId, cardNumber: card.cardNumber, name: card.name, typeId: card.typeId })
      if (results.length >= limit) return results
    }
  }
  return results
}
