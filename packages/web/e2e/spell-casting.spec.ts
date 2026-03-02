import { test, expect } from "@playwright/test"
import {
  PLAYER_A, PLAYER_B,
  apiCreateSpellOnlyGameForUi,
  apiCreatePhase3SpellGameForUi,
  apiDriveToPlayerAPhase3SpellMove,
  hasMove, clickMove,
} from "./helpers/game.ts"

test("cast spell from Player B hand shows caster warning (not false non-spell error)", async ({ page, request }) => {
  const gameId = await apiCreateSpellOnlyGameForUi(request)

  await page.addInitScript(({ gid, playerA, playerB }) => {
    sessionStorage.setItem(`game:${gid}:playerA`, playerA)
    sessionStorage.setItem(`game:${gid}:playerB`, playerB)
  }, { gid: gameId, playerA: PLAYER_A, playerB: PLAYER_B })

  await page.goto(`/game/${gameId}`)
  await expect(page.getByTestId("game-board")).toBeVisible()

  for (let i = 0; i < 8; i++) {
    const active = (await page.getByTestId("active-player-label").textContent()) ?? ""
    if (active.includes("Player B")) break
    if (await hasMove(page, PLAYER_A, "END_TURN")) {
      await clickMove(page, PLAYER_A, "END_TURN")
      continue
    }
    if (await hasMove(page, PLAYER_A, "PASS")) {
      await clickMove(page, PLAYER_A, "PASS")
    }
  }

  await expect(page.getByTestId("active-player-label")).toContainText("Player B")

  const topHandCard = page.getByTestId("hand-top").locator('[data-testid^="hand-card-"]').first()
  await expect(topHandCard).toBeVisible()
  await topHandCard.click({ button: "right" })

  await expect(page.getByRole("button", { name: "Cast Spell" })).toBeVisible()
  await page.getByRole("button", { name: "Cast Spell" }).click()

  await expect(page.getByText("You have no casters for this spell.")).toBeVisible()
  await expect(page.getByText("That card is not a spell.")).toHaveCount(0)
})

test("phase 3 spell cast announcement appears and keep-in-play spell is shown in lasting area", async ({ page, request }) => {
  const gameId = await apiCreatePhase3SpellGameForUi(request)
  const castMove = await apiDriveToPlayerAPhase3SpellMove(request, gameId)

  const castRes = await request.post(`http://127.0.0.1:3001/games/${gameId}/moves`, {
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
  await expect(page.getByTestId("spell-cast-modal")).toContainText("Player A cast")
  await page.getByTestId("spell-cast-modal").getByRole("button", { name: "OK" }).click()

  await expect(page.getByTestId(`lasting-spells-${PLAYER_A}`).locator("img").first()).toBeVisible()
})
