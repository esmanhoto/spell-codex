export type CardRef = { setId: string; cardNumber: number }

export interface SavedDeck {
  name: string
  cards: CardRef[]
}

const STORAGE_KEY = "spell_custom_decks"

export function loadSavedDecks(): SavedDeck[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedDeck[]) : []
  } catch {
    return []
  }
}

export function persistDecks(decks: SavedDeck[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decks))
}

export function getCustomDecks(): SavedDeck[] {
  return loadSavedDecks()
}
