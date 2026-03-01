import { expect, type APIRequestContext, type Page } from "@playwright/test"

export const PLAYER_A = "00000000-0000-0000-0000-000000000001"
export const PLAYER_B = "00000000-0000-0000-0000-000000000002"
const API_BASE = "http://127.0.0.1:3001"

export async function startGame(page: Page) {
  await page.goto("/")
  await expect(page.getByTestId("new-game-page")).toBeVisible()
  await expect(page.getByTestId("deck-a-select")).toBeEnabled()
  await expect(page.getByTestId("deck-b-select")).toBeEnabled()
  await page.getByTestId("start-game-btn").click()
  await page.waitForURL(/\/game\//)
  await expect(page.getByTestId("game-board")).toBeVisible()
}

export async function hasMove(page: Page, playerId: string, moveType: string): Promise<boolean> {
  const panel = page.getByTestId(`move-panel-${playerId}`)
  if (await panel.count() === 0) return false
  return (await panel.locator(`button[data-move-type="${moveType}"]`).count()) > 0
}

export async function clickMove(page: Page, playerId: string, moveType: string): Promise<boolean> {
  const panel = page.getByTestId(`move-panel-${playerId}`)
  if (await panel.count() === 0) return false
  const btn = panel.locator(`button[data-move-type="${moveType}"]`).first()
  if (await btn.count() === 0) return false
  try {
    await btn.click({ timeout: 1000 })
    return true
  } catch {
    return false
  }
}

export async function apiCreateGameForUi(request: APIRequestContext) {
  const deckARes = await request.get(`${API_BASE}/decks/1st_edition_starter_deck_a-1`)
  const deckBRes = await request.get(`${API_BASE}/decks/1st_edition_starter_deck_b-1`)
  expect(deckARes.ok()).toBe(true)
  expect(deckBRes.ok()).toBe(true)
  const deckA = await deckARes.json() as { cards: object[] }
  const deckB = await deckBRes.json() as { cards: object[] }

  const createRes = await request.post(`${API_BASE}/games`, {
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": PLAYER_A,
    },
    data: {
      formatId: "standard-55",
      seed: Math.floor(Math.random() * 0x7fffffff),
      players: [
        { userId: PLAYER_A, deckSnapshot: deckA.cards },
        { userId: PLAYER_B, deckSnapshot: deckB.cards },
      ],
    },
  })
  expect(createRes.ok()).toBe(true)
  const created = await createRes.json() as { gameId: string }
  return created.gameId
}

export async function driveGameToCombat(request: APIRequestContext, gameId: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    const stateRes = await request.get(`${API_BASE}/games/${gameId}`, {
      headers: { "X-User-Id": PLAYER_A },
    })
    expect(stateRes.ok()).toBe(true)
    const state = await stateRes.json() as {
      activePlayer: string
      legalMoves: Array<{ type: string; [key: string]: unknown }>
    }

    const moves = state.legalMoves
    const attack = moves.find(m => m.type === "DECLARE_ATTACK")
    const picked = attack
      ?? moves.find(m => m.type === "PLAY_REALM")
      ?? moves.find(m => m.type === "PLACE_CHAMPION")
      ?? moves.find(m => m.type === "END_TURN")
      ?? moves.find(m => m.type === "PASS")
      ?? moves[0]

    if (!picked) break

    const moveRes = await request.post(`${API_BASE}/games/${gameId}/moves`, {
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": state.activePlayer,
      },
      data: picked,
    })
    expect(moveRes.ok()).toBe(true)

    if (attack) return
  }

  throw new Error("Could not reach combat setup within move budget")
}
