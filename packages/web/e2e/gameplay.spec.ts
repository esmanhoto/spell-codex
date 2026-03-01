import { test, expect } from "@playwright/test"
import { PLAYER_A, startGame, hasMove, clickMove } from "./helpers/game.ts"

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

  await clickMove(page, PLAYER_A, "PASS")

  await expect(page.getByTestId("phase-pill-PLAY_REALM")).toHaveAttribute("data-active", "true")
})

test("ending turn hands control to Player B and increments turn", async ({ page }) => {
  await startGame(page)

  for (let i = 0; i < 8; i++) {
    if ((await page.getByTestId("active-player-label").textContent())?.includes("Player B")) break
    if (await hasMove(page, PLAYER_A, "END_TURN")) {
      await clickMove(page, PLAYER_A, "END_TURN")
      continue
    }
    if (await hasMove(page, PLAYER_A, "PASS")) {
      await clickMove(page, PLAYER_A, "PASS")
    }
  }

  await expect(page.getByTestId("turn-info")).toContainText("Turn 2")
  await expect(page.getByTestId("active-player-label")).toContainText("Player B")
})

test("manual move can be executed without breaking board", async ({ page }) => {
  await startGame(page)

  const movePanel = page.getByTestId(`move-panel-${PLAYER_A}`)
  await movePanel.locator('button[data-move-type="MANUAL_DRAW_CARDS"]').click()

  await expect(page.getByTestId("game-board")).toBeVisible()
  await expect(page.getByTestId("ws-error")).toHaveCount(0)
})
