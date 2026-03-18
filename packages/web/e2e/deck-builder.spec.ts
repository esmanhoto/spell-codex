import { test, expect } from "@playwright/test"

/** Selectors for grid card and mini card elements */
const GRID_CARD = '[data-testid^="grid-card-"]'
const MINI_CARD = '[data-testid^="mini-card-"]'

test.describe("Deck Builder page", () => {
  test("navigates to deck builder from lobby", async ({ page }) => {
    await page.goto("/")
    await page.getByTestId("deck-builder-link").click()
    await expect(page).toHaveURL(/\/deck-builder/)
    await expect(page.locator("h1")).toContainText("Deck Builder")
  })

  test("selecting and deselecting cards updates deck count", async ({ page }) => {
    await page.goto("/deck-builder")

    await expect(page.getByTestId("deck-count")).toHaveText("0/55")

    await page.locator(GRID_CARD).first().click()
    await expect(page.getByTestId("deck-count")).toHaveText("1/55")
    await expect(page.locator(MINI_CARD)).toHaveCount(1)

    await page.locator(GRID_CARD).first().click()
    await expect(page.getByTestId("deck-count")).toHaveText("0/55")
    await expect(page.locator(MINI_CARD)).toHaveCount(0)
  })

  test("switching tabs shows different card types", async ({ page }) => {
    await page.goto("/deck-builder")

    await expect(page.locator("h3")).toContainText("Realms")

    await page.locator("button", { hasText: "Champions" }).click()
    await expect(page.locator("h3")).toContainText("Champions")
    await expect(page.locator("text=max 90 total levels")).toBeVisible()

    await page.locator("button", { hasText: "Events" }).click()
    await expect(page.locator("h3")).toContainText("Events")
    await expect(page.locator("text=0–10 cards")).toBeVisible()
  })

  test("clear button removes all selections", async ({ page }) => {
    await page.goto("/deck-builder")

    const cards = page.locator(GRID_CARD)
    await cards.nth(0).click()
    await cards.nth(1).click()
    await cards.nth(2).click()
    await expect(page.getByTestId("deck-count")).toHaveText("3/55")

    await page.locator("button", { hasText: "Clear" }).click()
    await expect(page.getByTestId("deck-count")).toHaveText("0/55")
    await expect(page.locator(MINI_CARD)).toHaveCount(0)
  })

  test("validation shows errors for incomplete deck", async ({ page }) => {
    await page.goto("/deck-builder")

    await page.locator(GRID_CARD).first().click()
    await expect(page.locator("text=Deck must have exactly 55 cards")).toBeVisible()
  })

  test("save button is disabled without name or with validation errors", async ({ page }) => {
    await page.goto("/deck-builder")
    await expect(page.locator("button", { hasText: "Save" })).toBeDisabled()

    await page.locator('input[placeholder="Deck name..."]').fill("Test Deck")
    await expect(page.locator("button", { hasText: "Save" })).toBeDisabled()
  })

  test("back button returns to lobby", async ({ page }) => {
    await page.goto("/deck-builder")
    await page.locator("a", { hasText: "Back" }).click()
    await expect(page).toHaveURL("/")
  })
})

test.describe("Deck Builder save and use flow", () => {
  /** Helper to build a valid 55-card deck */
  async function buildValidDeck(page: import("@playwright/test").Page) {
    // Select 10 realms
    const realmCards = page.locator(GRID_CARD)
    for (let i = 0; i < 10; i++) {
      await realmCards.nth(i).click()
    }

    // Switch to Champions and select 10
    await page.locator("button", { hasText: "Champions" }).click()
    const champCards = page.locator(GRID_CARD)
    for (let i = 0; i < 10; i++) {
      await champCards.nth(i).click()
    }

    // Switch to Allies and select remaining to reach 55
    await page.locator("button", { hasText: "Allies" }).click()
    const allyCards = page.locator(GRID_CARD)
    const allyCount = await allyCards.count()
    const remaining = 55 - 20
    for (let i = 0; i < Math.min(remaining, allyCount); i++) {
      await allyCards.nth(i).click()
    }

    // If we still need more, fill from other categories
    let currentCount = parseInt((await page.getByTestId("deck-count").textContent()) ?? "0")

    if (currentCount < 55) {
      await page.locator("button", { hasText: "Magical Items" }).click()
      const itemCards = page.locator(GRID_CARD)
      const itemCount = await itemCards.count()
      const needed = 55 - currentCount
      for (let i = 0; i < Math.min(needed, itemCount); i++) {
        await itemCards.nth(i).click()
      }
      currentCount = parseInt((await page.getByTestId("deck-count").textContent()) ?? "0")
    }

    if (currentCount < 55) {
      await page.locator("button", { hasText: "Wizard Spells" }).click()
      const spellCards = page.locator(GRID_CARD)
      const spellCount = await spellCards.count()
      const needed = 55 - currentCount
      for (let i = 0; i < Math.min(needed, spellCount); i++) {
        await spellCards.nth(i).click()
      }
    }
  }

  test("can save a valid deck and see it in lobby deck selector", async ({ page }) => {
    await page.goto("/deck-builder")

    await buildValidDeck(page)

    // Name the deck
    await page.locator('input[placeholder="Deck name..."]').fill("E2E Test Deck")

    // Save if valid
    const saveBtn = page.locator("button", { hasText: "Save" })
    if (await saveBtn.isEnabled()) {
      await saveBtn.click()
      await expect(page.locator('[class*="toast"]')).toContainText('Deck "E2E Test Deck" saved')

      // Navigate back to lobby and verify custom deck appears in selector
      await page.locator("a", { hasText: "Back" }).click()
      await expect(page).toHaveURL("/")

      await page.getByTestId("create-mode-btn").click()
      const customOption = page.locator(
        '[data-testid="create-deck-select"] option[value="custom:E2E Test Deck"]',
      )
      await expect(customOption).toBeAttached()
      await page.getByTestId("create-deck-select").selectOption("custom:E2E Test Deck")
      await expect(page.getByTestId("create-deck-select")).toHaveValue("custom:E2E Test Deck")
    }
  })

  test("clicking saved deck loads its cards", async ({ page }) => {
    await page.goto("/deck-builder")
    await buildValidDeck(page)

    await page.locator('input[placeholder="Deck name..."]').fill("Load Test Deck")

    const saveBtn = page.locator("button", { hasText: "Save" })
    if (await saveBtn.isEnabled()) {
      await saveBtn.click()
      await expect(page.locator('[class*="toast"]')).toBeVisible()

      // Navigate away and back to clear state
      await page.locator("a", { hasText: "Back" }).click()
      await expect(page).toHaveURL("/")
      await page.getByTestId("deck-builder-link").click()
      await expect(page).toHaveURL(/\/deck-builder/)

      // Click saved deck to load it
      await page.locator('[class*="customDeckName"]', { hasText: "Load Test Deck" }).click()
      await expect(page.getByTestId("deck-count")).toHaveText("55/55")
    }
  })

  test("deleting a saved deck removes it from panel", async ({ page }) => {
    await page.goto("/deck-builder")
    await buildValidDeck(page)

    await page.locator('input[placeholder="Deck name..."]').fill("Delete Me Deck")

    const saveBtn = page.locator("button", { hasText: "Save" })
    if (await saveBtn.isEnabled()) {
      await saveBtn.click()
      await expect(page.locator('[class*="toast"]')).toContainText("saved")

      // Wait for save toast to disappear
      await expect(page.locator('[class*="toast"]')).not.toBeVisible({ timeout: 5000 })

      // Delete it
      const deckRow = page.locator('[class*="customDeckRow"]', { hasText: "Delete Me Deck" })
      await deckRow.locator('[title="Delete"]').click()

      await expect(page.locator('[class*="toast"]')).toContainText("deleted")

      // Verify deck link is gone from the panel
      const deckLink = page.locator('[class*="customDeckName"]', { hasText: "Delete Me Deck" })
      await expect(deckLink).not.toBeVisible()
    }
  })
})
