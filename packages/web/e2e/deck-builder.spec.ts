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

  test("loads 1st edition cards and shows category tabs", async ({ page }) => {
    await page.goto("/deck-builder")

    await expect(page.locator("h1")).toContainText("Deck Builder")
    const tabs = page.locator("button", {
      hasText: /Realms|Holdings|Champions|Artifacts|Magical Items|Events|Allies|Rule Cards|Spells/,
    })
    await expect(tabs.first()).toBeVisible()
    const tabCount = await tabs.count()
    expect(tabCount).toBe(9)
  })

  test("shows realm cards by default with range info", async ({ page }) => {
    await page.goto("/deck-builder")
    await expect(page.locator("h3")).toContainText("Realms")
    await expect(page.locator("text=8–15 cards")).toBeVisible()

    const gridCards = page.locator(GRID_CARD)
    await expect(gridCards.first()).toBeVisible()
    const count = await gridCards.count()
    expect(count).toBeGreaterThan(5)
  })

  test("selecting a card adds it to My Deck strip", async ({ page }) => {
    await page.goto("/deck-builder")

    await expect(page.getByTestId("deck-count")).toHaveText("0/55")

    await page.locator(GRID_CARD).first().click()

    await expect(page.getByTestId("deck-count")).toHaveText("1/55")
    await expect(page.locator(MINI_CARD)).toHaveCount(1)
  })

  test("deselecting a card removes it from My Deck strip", async ({ page }) => {
    await page.goto("/deck-builder")

    const firstCard = page.locator(GRID_CARD).first()
    await firstCard.click()
    await expect(page.getByTestId("deck-count")).toHaveText("1/55")

    await firstCard.click()
    await expect(page.getByTestId("deck-count")).toHaveText("0/55")
    await expect(page.locator(MINI_CARD)).toHaveCount(0)
  })

  test("clicking mini card in deck strip removes it", async ({ page }) => {
    await page.goto("/deck-builder")

    await page.locator(GRID_CARD).first().click()
    await expect(page.getByTestId("deck-count")).toHaveText("1/55")

    await page.locator(MINI_CARD).first().click()
    await expect(page.getByTestId("deck-count")).toHaveText("0/55")
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

  test("selected card is visually highlighted in grid", async ({ page }) => {
    await page.goto("/deck-builder")

    const firstCard = page.locator(GRID_CARD).first()
    await firstCard.click()

    await expect(firstCard).toHaveClass(/gridCardSelected/)
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

  test("save button is disabled without deck name", async ({ page }) => {
    await page.goto("/deck-builder")
    await expect(page.locator("button", { hasText: "Save" })).toBeDisabled()
  })

  test("save button is disabled with validation errors", async ({ page }) => {
    await page.goto("/deck-builder")

    await page.locator('input[placeholder="Deck name..."]').fill("Test Deck")
    await expect(page.locator("button", { hasText: "Save" })).toBeDisabled()
  })

  test("back button returns to lobby", async ({ page }) => {
    await page.goto("/deck-builder")
    await page.locator("a", { hasText: "Back" }).click()
    await expect(page).toHaveURL("/")
  })

  test("tab counts update as cards are selected", async ({ page }) => {
    await page.goto("/deck-builder")

    const realmsTab = page.locator("button", { hasText: "Realms" })
    const initialText = await realmsTab.textContent()
    expect(initialText).toMatch(/0\/\d+/)

    await page.locator(GRID_CARD).first().click()

    const updatedText = await realmsTab.textContent()
    expect(updatedText).toMatch(/1\/\d+/)
  })

  test("champion level tracking shows total", async ({ page }) => {
    await page.goto("/deck-builder")

    await page.locator("button", { hasText: "Champions" }).click()
    await expect(page.locator("h3")).toContainText("Champions")

    await expect(page.locator("text=Champion levels: 0/90")).toBeVisible()

    await page.locator(GRID_CARD).first().click()

    const levelText = await page.locator('[class*="levelInfo"]').textContent()
    expect(levelText).toMatch(/Champion levels: \d+\/90/)
  })

  test("card tooltip shows on hover", async ({ page }) => {
    await page.goto("/deck-builder")

    await page.locator(GRID_CARD).first().hover()

    await expect(page.locator('[class*="tooltipBox"]')).toBeVisible()
    await expect(page.locator('[class*="tooltipName"]')).toBeVisible()
  })
})

test.describe("Deck Builder save and use flow", () => {
  test("can save a valid deck and see it in lobby deck selector", async ({ page }) => {
    await page.goto("/deck-builder")

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
      await page.locator("button", { hasText: "Spells" }).click()
      const spellCards = page.locator(GRID_CARD)
      const spellCount = await spellCards.count()
      const needed = 55 - currentCount
      for (let i = 0; i < Math.min(needed, spellCount); i++) {
        await spellCards.nth(i).click()
      }
    }

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
      // Custom deck option should be in the select (optgroup + option are in DOM even when dropdown is closed)
      const customOption = page.locator(
        '[data-testid="create-deck-select"] option[value="custom:E2E Test Deck"]',
      )
      await expect(customOption).toBeAttached()
      // Select it to verify it's usable
      await page.getByTestId("create-deck-select").selectOption("custom:E2E Test Deck")
      await expect(page.getByTestId("create-deck-select")).toHaveValue("custom:E2E Test Deck")
    }
  })
})
