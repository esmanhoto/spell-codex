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

  await page.getByTestId("manual-controls").getByRole("button", { name: "End Turn" }).click()

  await expect(pageB.getByTestId("turn-info")).toContainText("Turn 2", { timeout: 8000 })
  await expect(pageB.getByTestId("active-player-label")).toContainText("Player A")
  await contextB.close()
})

test("mode changes sync to second player and manual-warning is broadcast", async ({ browser, page, request }) => {
  const gameId = await apiCreateGameForUi(request)

  await page.addInitScript(({ userId }) => {
    localStorage.setItem("spell:bypass-user-id", userId)
  }, { userId: PLAYER_A })
  await page.goto(`/game/${gameId}`)
  await expect(page.getByTestId("game-board")).toBeVisible()

  const contextB = await browser.newContext()
  await contextB.addInitScript(({ userId }) => {
    localStorage.setItem("spell:bypass-user-id", userId)
  }, { userId: PLAYER_B })
  const pageB = await contextB.newPage()
  await pageB.goto(`/game/${gameId}`)
  await expect(pageB.getByTestId("game-board")).toBeVisible()

  const controls = page.getByTestId("manual-controls")
  await controls.getByRole("button", { name: "Semi Auto" }).click()
  await expect(pageB.getByTestId("play-mode-label")).toContainText("Semi Auto")

  await controls.getByRole("button", { name: "Full Manual" }).click()
  await expect(pageB.getByTestId("warning-modal")).toBeVisible()
  await expect(pageB.getByTestId("warning-modal")).toContainText("manual mode")

  await contextB.close()
})
