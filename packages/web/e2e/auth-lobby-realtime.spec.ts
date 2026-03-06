import { expect, test } from "@playwright/test"
import { AUTH_USER_A, AUTH_USER_B, signInWithPassword } from "./helpers/auth.ts"

test("two authenticated users can create/join and receive realtime updates", async ({
  browser,
  page,
}) => {
  await signInWithPassword(page, AUTH_USER_A)

  await page.getByTestId("create-mode-btn").click()
  await page.getByTestId("create-game-btn").click()
  await expect(page.getByTestId("waiting-room")).toBeVisible()

  const gameId = await page.getByTestId("created-game-id-input").inputValue()
  expect(gameId).toMatch(/^[0-9a-f-]{36}$/i)

  const contextB = await browser.newContext()
  try {
    const pageB = await contextB.newPage()
    await signInWithPassword(pageB, AUTH_USER_B)
    await pageB.getByTestId("join-mode-btn").click()
    await pageB.getByTestId("join-game-id-input").fill(gameId)
    await pageB.getByTestId("join-game-btn").click()
    await expect(pageB.getByTestId("game-board")).toBeVisible()

    await page.waitForURL(new RegExp(`/game/${gameId}`), { timeout: 15_000 })
    await expect(page.getByTestId("game-board")).toBeVisible()
    await expect(pageB.getByTestId("phase-pill-START_OF_TURN")).toHaveAttribute(
      "data-active",
      "true",
    )

    await page.getByTestId("pass-btn").click() // Phase 1 -> 2
    await page.getByTestId("pass-btn").click() // Phase 2 -> 3
    await page.getByTestId("pass-btn").click() // Phase 3 -> End Turn

    await expect(pageB.getByTestId("turn-info")).toContainText("Turn 2", { timeout: 8_000 })
    await expect(pageB.getByTestId("active-player-label")).toContainText("Player A")
  } finally {
    await contextB.close()
  }
})
