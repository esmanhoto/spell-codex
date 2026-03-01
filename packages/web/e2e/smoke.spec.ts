import { test, expect, type Page } from "@playwright/test"

const PLAYER_A = "00000000-0000-0000-0000-000000000001"

async function startGame(page: Page) {
  await page.goto("/")
  await expect(page.getByTestId("new-game-page")).toBeVisible()
  await expect(page.getByTestId("deck-a-select")).toBeEnabled()
  await expect(page.getByTestId("deck-b-select")).toBeEnabled()
  await page.getByTestId("start-game-btn").click()
  await page.waitForURL(/\/game\//)
  await expect(page.getByTestId("game-board")).toBeVisible()
}

test("new game page loads with playable deck options", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("new-game-page")).toBeVisible()

  const deckAOptions = page.locator('[data-testid="deck-a-select"] option')
  const deckBOptions = page.locator('[data-testid="deck-b-select"] option')

  await expect(deckAOptions).toHaveCount(12)
  await expect(deckBOptions).toHaveCount(12)
})

test("start game navigates and renders board", async ({ page }) => {
  await startGame(page)
  await expect(page.getByTestId("turn-info")).toContainText("Turn 1")
  await expect(page.getByTestId("active-player-label")).toContainText("Player A")
})

test("active player has pass and manual controls", async ({ page }) => {
  await startGame(page)

  const movePanel = page.getByTestId(`move-panel-${PLAYER_A}`)
  await expect(movePanel).toBeVisible()

  await expect(movePanel.locator('button[data-move-type="PASS"]')).toHaveCount(1)
  await expect(movePanel.locator('button[data-move-type="MANUAL_DRAW_CARDS"]')).toHaveCount(1)
})

test("pass from draw phase advances to realm phase", async ({ page }) => {
  await startGame(page)

  const movePanel = page.getByTestId(`move-panel-${PLAYER_A}`)
  await movePanel.locator('button[data-move-type="PASS"]').click()

  await expect(page.getByTestId("phase-pill-PLAY_REALM")).toHaveAttribute("data-active", "true")
})

test("manual move can be executed without breaking board", async ({ page }) => {
  await startGame(page)

  const movePanel = page.getByTestId(`move-panel-${PLAYER_A}`)
  await movePanel.locator('button[data-move-type="MANUAL_DRAW_CARDS"]').click()

  await expect(page.getByTestId("game-board")).toBeVisible()
  await expect(page.getByTestId("ws-error")).toHaveCount(0)
})
