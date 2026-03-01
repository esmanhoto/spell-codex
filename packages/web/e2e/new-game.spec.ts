import { test, expect } from "@playwright/test"

test("new game page loads with playable deck options", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("new-game-page")).toBeVisible()

  const deckAOptions = page.locator('[data-testid="deck-a-select"] option')
  const deckBOptions = page.locator('[data-testid="deck-b-select"] option')

  await expect(deckAOptions).toHaveCount(12)
  await expect(deckBOptions).toHaveCount(12)
})

test("all listed decks are selectable in both deck selectors", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("new-game-page")).toBeVisible()
  await expect(page.locator('[data-testid="deck-a-select"] option')).toHaveCount(12)

  const optionValues = await page
    .locator('[data-testid="deck-a-select"] option')
    .evaluateAll(opts => opts.map(o => (o as HTMLOptionElement).value))

  expect(optionValues.length).toBeGreaterThan(0)

  for (const value of optionValues) {
    await page.getByTestId("deck-a-select").selectOption(value)
    await expect(page.getByTestId("deck-a-select")).toHaveValue(value)

    await page.getByTestId("deck-b-select").selectOption(value)
    await expect(page.getByTestId("deck-b-select")).toHaveValue(value)
  }
})
