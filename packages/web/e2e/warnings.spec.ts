import { test, expect } from "@playwright/test"
import { PLAYER_A, PLAYER_B, apiCreateGameForUi } from "./helpers/game.ts"

test("manual mode warning can be suppressed per browser", async ({ browser, page, request }) => {
  const gameId = await apiCreateGameForUi(request)

  await page.addInitScript(({ userId }) => {
    localStorage.setItem("spell:bypass-user-id", userId)
  }, { userId: PLAYER_A })
  await page.goto(`/game/${gameId}`)
  await expect(page.getByTestId("game-board")).toBeVisible()

  const contextB = await browser.newContext()
  try {
    await contextB.addInitScript(({ userId }) => {
      localStorage.setItem("spell:bypass-user-id", userId)
    }, { userId: PLAYER_B })
    const pageB = await contextB.newPage()
    await pageB.goto(`/game/${gameId}`)
    await expect(pageB.getByTestId("game-board")).toBeVisible()

    const controls = page.getByTestId("manual-controls")
    await controls.getByRole("button", { name: "Semi Auto" }).click()
    await controls.getByRole("button", { name: "Full Manual" }).click()

    await expect(pageB.getByTestId("warning-modal")).toBeVisible()
    await pageB.getByTestId("warning-suppress").check()
    await pageB.getByTestId("warning-ok").click()

    if (await page.getByTestId("warning-modal").count()) {
      await page.getByTestId("warning-ok").click()
    }

    await controls.getByRole("button", { name: "Semi Auto" }).click()
    await controls.getByRole("button", { name: "Full Manual" }).click()

    await expect(pageB.getByTestId("warning-modal")).toHaveCount(0)
  } finally {
    await contextB.close()
  }
})
