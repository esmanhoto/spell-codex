import { test, expect, type Page } from "@playwright/test"
import { PLAYER_A, PLAYER_B, apiCreateGameForUi } from "./helpers/game.ts"

async function passThroughTurn(page: Page) {
  for (let i = 0; i < 10; i++) {
    const btn = page.getByTestId("pass-btn")
    if ((await btn.count()) === 0) break
    const isEndTurn = (await btn.getAttribute("data-move-type")) === "END_TURN"
    await btn.click()
    await page.waitForTimeout(300)
    if (isEndTurn) break
  }
}

test("second player view updates after first player move", async ({ browser, page, request }) => {
  const gameId = await apiCreateGameForUi(request)

  await page.addInitScript(
    ({ userId }) => {
      localStorage.setItem("spell:bypass-user-id", userId)
    },
    { userId: PLAYER_A },
  )
  await page.goto(`/game/${gameId}`)
  await expect(page.getByTestId("game-board")).toBeVisible()
  await expect(page.getByTestId("phase-pill-START_OF_TURN")).toHaveAttribute("data-active", "true")

  const contextB = await browser.newContext()
  await contextB.addInitScript(
    ({ userId }) => {
      localStorage.setItem("spell:bypass-user-id", userId)
    },
    { userId: PLAYER_B },
  )
  const pageB = await contextB.newPage()
  await pageB.goto(`/game/${gameId}`)
  await expect(pageB.getByTestId("game-board")).toBeVisible()
  await expect(pageB.getByTestId("phase-pill-START_OF_TURN")).toHaveAttribute("data-active", "true")

  await passThroughTurn(page)

  await expect(pageB.getByTestId("turn-info")).toContainText("Turn 2", { timeout: 8000 })
  await expect(pageB.getByTestId("active-player-label")).toContainText("You")
  await contextB.close()
})
