import type { PlayerBoard } from "../api.ts"

export const CARD_BACK_URL = "/api/cards/cardback.jpg"

export function cardImageUrl(setId: string, cardNumber: number): string {
  return `/api/cards/${setId}/${cardNumber}.jpg`
}

export function nameOfCard(id: string, allBoards: Record<string, PlayerBoard>): string {
  for (const board of Object.values(allBoards)) {
    const all = [
      ...board.hand,
      ...board.pool.map((e) => e.champion),
      ...board.pool.flatMap((e) => e.attachments),
      ...Object.values(board.formation).flatMap((s) => (s ? [s.realm, ...s.holdings] : [])),
    ]
    const found = all.find((c) => c.instanceId === id)
    if (found) return found.name
  }
  return id.slice(0, 8) + "\u2026"
}
