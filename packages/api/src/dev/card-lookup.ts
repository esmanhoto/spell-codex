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
