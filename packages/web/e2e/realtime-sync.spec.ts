import { test, expect } from "@playwright/test"
import { PLAYER_A, PLAYER_B, apiCreateGameForUi } from "./helpers/game.ts"

test("second player view updates after first player move", async ({ browser, page, request }) => {
  const gameId = await apiCreateGameForUi(request)

  await page.addInitScript(({ userId }) => {
    localStorage.setItem("spell:bypass-user-id", userId)
  }, { userId: PLAYER_A })
  await page.goto(`/game/${gameId}`)
  await expect(page.getByTestId("game-board")).toBeVisible()
  await expect(page.getByTestId("phase-pill-START_OF_TURN")).toHaveAttribute("data-active", "true")

  const contextB = await browser.newContext()
  await contextB.addInitScript(({ userId }) => {
    localStorage.setItem("spell:bypass-user-id", userId)
  }, { userId: PLAYER_B })
  const pageB = await contextB.newPage()
  await pageB.goto(`/game/${gameId}`)
  await expect(pageB.getByTestId("game-board")).toBeVisible()
  await expect(pageB.getByTestId("phase-pill-START_OF_TURN")).toHaveAttribute("data-active", "true")

  await page.getByTestId(`move-panel-${PLAYER_A}`).locator('button[data-move-type="PASS"]').first().click()

  await expect(pageB.getByTestId("phase-pill-PLAY_REALM")).toHaveAttribute("data-active", "true", { timeout: 8000 })
  await contextB.close()
})
