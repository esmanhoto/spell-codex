import { test, expect } from "@playwright/test"
import { PLAYER_A, apiCreateGameForUi, driveGameToCombat, startGame } from "./helpers/game.ts"

test("start game navigates and renders board", async ({ page, request }) => {
  await startGame(page, request)
  await expect(page.getByTestId("turn-info")).toContainText("Turn 1")
  await expect(page.getByTestId("active-player-label")).toContainText("Player A")
})

test("manual controls are visible by default", async ({ page, request }) => {
  await startGame(page, request)

  await expect(page.getByTestId("manual-controls")).toBeVisible()
  await expect(page.getByTestId("play-mode-label")).toContainText("Full Manual")
})

test("draw pile click performs manual draw in full manual mode", async ({ page, request }) => {
  await startGame(page, request)

  await expect(page.getByTestId(`move-panel-${PLAYER_A}`)).toHaveCount(0)
  await page.getByTestId("draw-pile-self").click()
  await expect(page.getByTestId("game-board")).toBeVisible()
})

test("ending turn hands control to Player B and increments turn", async ({ page, request }) => {
  await startGame(page, request)

  await page.getByTestId("manual-controls").getByRole("button", { name: "End Turn" }).click()

  await expect(page.getByTestId("turn-info")).toContainText("Turn 2")
  await expect(page.getByTestId("active-player-label")).toContainText("Player B")
})

test("manual move can be executed without breaking board", async ({ page, request }) => {
  await startGame(page, request)

  await page.getByTestId("draw-pile-self").click()

  await expect(page.getByTestId("game-board")).toBeVisible()
})

test("right-click Play/Cast flow works for hand cards in full manual", async ({ page, request }) => {
  await startGame(page, request)

  const handCards = page.locator("[data-testid^=\"hand-card-\"]")
  await expect(handCards.first()).toBeVisible()
  const dataTestId = await handCards.first().getAttribute("data-testid")
  expect(dataTestId).toBeTruthy()
  const movedCardTestId = dataTestId!

  await handCards.first().click({ button: "right" })
  await page.getByRole("button", { name: "Play/Cast..." }).click()
  await expect(page.getByTestId("manual-play-modal")).toBeVisible()

  await page.getByTestId("manual-play-resolution").selectOption("discard")
  await page.getByTestId("manual-play-confirm").click()
  await expect(page.getByTestId("manual-play-modal")).toHaveCount(0)
  await expect(page.getByTestId(movedCardTestId)).toHaveCount(0)
})

test("semi_auto switch in active combat is blocked with exact reason", async ({ page, request }) => {
  const gameId = await apiCreateGameForUi(request)
  await driveGameToCombat(request, gameId)

  await page.goto(`/game/${gameId}`)
  await expect(page.getByTestId("game-board")).toBeVisible()

  const controls = page.getByTestId("manual-controls")
  await controls.getByRole("button", { name: "Full Manual" }).click()
  if (await page.getByTestId("warning-modal").count()) {
    await page.getByTestId("warning-ok").click()
  }

  await controls.getByRole("button", { name: "Semi Auto" }).click()
  await expect(page.getByTestId("warning-modal")).toBeVisible()
  await expect(page.getByTestId("warning-modal")).toContainText("Cannot switch to semi_auto while combat is active.")
})
