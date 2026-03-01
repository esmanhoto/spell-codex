import { test, expect } from "@playwright/test"
import { PLAYER_A, PLAYER_B, apiCreateGameForUi, driveGameToCombat } from "./helpers/game.ts"

test("combat panel renders after backend reaches combat state", async ({ page, request }) => {
  const gameId = await apiCreateGameForUi(request)
  await driveGameToCombat(request, gameId)

  await page.addInitScript(({ gid, playerA, playerB }) => {
    sessionStorage.setItem(`game:${gid}:playerA`, playerA)
    sessionStorage.setItem(`game:${gid}:playerB`, playerB)
  }, { gid: gameId, playerA: PLAYER_A, playerB: PLAYER_B })

  await page.goto(`/game/${gameId}`)
  await expect(page.getByTestId("game-board")).toBeVisible()
  await expect(page.locator("[data-combat-panel]")).toBeVisible()
  await expect(page.getByTestId("ws-error")).toHaveCount(0)
})
