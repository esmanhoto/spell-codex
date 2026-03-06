import { test, expect, type Page } from "@playwright/test"
import { startGame } from "./helpers/game.ts"

async function passThroughTurn(page: Page): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const btn = page.getByTestId("pass-btn")
    if ((await btn.count()) === 0) break
    const isEndTurn = (await btn.getAttribute("data-move-type")) === "END_TURN"
    await btn.click()
    await page.waitForTimeout(300)
    if (isEndTurn) break
  }
}

test("start game navigates and renders board", async ({ page, request }) => {
  await startGame(page, request)
  await expect(page.getByTestId("turn-info")).toContainText("Turn 1")
  await expect(page.getByTestId("active-player-label")).toContainText("Player A")
})

test("ending turn hands control to Player B and increments turn", async ({ page, request }) => {
  await startGame(page, request)

  await passThroughTurn(page)

  await expect(page.getByTestId("turn-info")).toContainText("Turn 2")
  await expect(page.getByTestId("active-player-label")).toContainText("Player B")
})

test("manual move can be executed without breaking board", async ({ page, request }) => {
  await startGame(page, request)

  await page.getByTestId("draw-pile-self").click()

  await expect(page.getByTestId("game-board")).toBeVisible()
})
