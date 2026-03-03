import { test, expect } from "@playwright/test"
import {
  PLAYER_A, PLAYER_B,
  apiCreateSpellOnlyGameForUi,
  apiCreatePhase3SpellGameForUi,
  apiDriveToPlayerAPhase3SpellMove,
} from "./helpers/game.ts"

test("opponent hand is hidden to the current player", async ({ page, request }) => {
  const gameId = await apiCreateSpellOnlyGameForUi(request)

  await page.addInitScript(({ gid, playerA, playerB }) => {
    sessionStorage.setItem(`game:${gid}:playerA`, playerA)
    sessionStorage.setItem(`game:${gid}:playerB`, playerB)
  }, { gid: gameId, playerA: PLAYER_A, playerB: PLAYER_B })

  await page.goto(`/game/${gameId}`)
  await expect(page.getByTestId("game-board")).toBeVisible()

  await expect(page.getByTestId("hand-top").locator('[data-testid^=\"hand-card-\"]')).toHaveCount(0)
  await expect(page.getByTestId("hand-top").locator('[data-testid^=\"opponent-card-back-\"]')).toHaveCount(5)
})

test("phase 3 spell cast announcement appears and keep-in-play spell is shown in lasting area", async ({ page, request }) => {
  const gameId = await apiCreatePhase3SpellGameForUi(request)
  const castMove = await apiDriveToPlayerAPhase3SpellMove(request, gameId)

  const castRes = await request.post(`/api/games/${gameId}/moves`, {
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": PLAYER_A,
    },
    data: {
      type: "PLAY_PHASE3_CARD",
      cardInstanceId: castMove.cardInstanceId,
      keepInPlay: true,
    },
  })
  expect(castRes.ok()).toBe(true)

  await page.addInitScript(({ gid, playerA, playerB }) => {
    sessionStorage.setItem(`game:${gid}:playerA`, playerA)
    sessionStorage.setItem(`game:${gid}:playerB`, playerB)
  }, { gid: gameId, playerA: PLAYER_A, playerB: PLAYER_B })

  await page.goto(`/game/${gameId}`)
  await expect(page.getByTestId("game-board")).toBeVisible()
  await expect(page.getByTestId("spell-cast-modal")).toBeVisible()
  await expect(page.getByTestId("spell-cast-modal")).toContainText("cast")
  await page.getByTestId("spell-cast-modal").getByRole("button", { name: "OK" }).click()

  await expect(page.getByTestId(`lasting-spells-${PLAYER_A}`).locator("img").first()).toBeVisible()
})
