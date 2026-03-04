import { test, expect } from "@playwright/test"

test("lobby page loads with create and join actions", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("lobby-page")).toBeVisible()
  await expect(page.getByTestId("create-mode-btn")).toBeVisible()
  await expect(page.getByTestId("join-mode-btn")).toBeVisible()
})

test("create flow shows waiting room with sharable game id", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("create-mode-btn").click()
  await expect(page.locator('[data-testid="create-deck-select"] option')).toHaveCount(12)
  await page.getByTestId("create-game-btn").click()

  await expect(page.getByTestId("waiting-room")).toBeVisible()
  await expect(page.getByTestId("created-game-id-input")).toHaveValue(/[0-9a-f-]{36}/)
})

test("all listed decks are selectable in create and join selectors", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("create-mode-btn").click()
  await expect(page.locator('[data-testid="create-deck-select"] option')).toHaveCount(12)

  const optionValues = await page
    .locator('[data-testid="create-deck-select"] option')
    .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value))
  for (const value of optionValues) {
    await page.getByTestId("create-deck-select").selectOption(value)
    await expect(page.getByTestId("create-deck-select")).toHaveValue(value)
  }

  await page.getByRole("button", { name: "Back" }).click()
  await page.getByTestId("join-mode-btn").click()
  await expect(page.locator('[data-testid="join-deck-select"] option')).toHaveCount(12)

  for (const value of optionValues) {
    await page.getByTestId("join-deck-select").selectOption(value)
    await expect(page.getByTestId("join-deck-select")).toHaveValue(value)
  }
})
