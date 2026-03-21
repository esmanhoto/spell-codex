export type CardRef = { setId: string; cardNumber: number }

export interface SavedDeck {
  name: string
  cards: CardRef[]
}

function storageKey(userId: string): string {
  return `spell_custom_decks:${userId}`
}

export function loadSavedDecks(userId: string): SavedDeck[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    return raw ? (JSON.parse(raw) as SavedDeck[]) : []
  } catch {
    return []
  }
}

export function persistDecks(userId: string, decks: SavedDeck[]): void {
  localStorage.setItem(storageKey(userId), JSON.stringify(decks))
}

export function getCustomDecks(userId: string): SavedDeck[] {
  return loadSavedDecks(userId)
}
