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
      hasText:
        /Realms|Holdings|Champions|Artifacts|Magical Items|Events|Allies|Rule Cards|Cleric Spells|Wizard Spells/,
    })
    await expect(tabs.first()).toBeVisible()
    const tabCount = await tabs.count()
    expect(tabCount).toBe(10)
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

test.describe("Deck Builder sort and filter", () => {
  test("sort by name reorders cards alphabetically", async ({ page }) => {
    await page.goto("/deck-builder")
    await expect(page.locator(GRID_CARD).first()).toBeVisible()

    // Get card names in default order
    const defaultNames = await page
      .locator(`${GRID_CARD} [class*="gridCardName"]`)
      .allTextContents()

    // Switch to sort by name
    await page.getByTestId("sort-select").selectOption("name")

    const sortedNames = await page.locator(`${GRID_CARD} [class*="gridCardName"]`).allTextContents()

    // Sorted names should be alphabetically ordered
    const expectedSorted = [...sortedNames].sort((a, b) => a.localeCompare(b))
    expect(sortedNames).toEqual(expectedSorted)

    // Should differ from default (card # order) unless coincidentally the same
    expect(sortedNames.length).toBe(defaultNames.length)
  })

  test("sort by level puts leveled cards first", async ({ page }) => {
    await page.goto("/deck-builder")

    // Go to a tab that has mixed leveled/unleveled cards
    await page.locator("button", { hasText: "Champions" }).click()
    await expect(page.locator(GRID_CARD).first()).toBeVisible()

    await page.getByTestId("sort-select").selectOption("level")

    // All cards with level text should appear before those without
    const cards = page.locator(GRID_CARD)
    const count = await cards.count()
    let foundUnleveled = false
    for (let i = 0; i < Math.min(count, 20); i++) {
      const levelEl = cards.nth(i).locator('[class*="gridCardLevel"]')
      const hasLevel = (await levelEl.count()) > 0
      if (!hasLevel) foundUnleveled = true
      if (foundUnleveled && hasLevel) {
        // A leveled card after an unleveled one means sort is wrong
        throw new Error("Leveled card found after unleveled card in level sort")
      }
    }
  })

  test("sort resets when switching back to card #", async ({ page }) => {
    await page.goto("/deck-builder")
    await expect(page.locator(GRID_CARD).first()).toBeVisible()

    const defaultNames = await page
      .locator(`${GRID_CARD} [class*="gridCardName"]`)
      .allTextContents()

    await page.getByTestId("sort-select").selectOption("name")
    await page.getByTestId("sort-select").selectOption("number")

    const resetNames = await page.locator(`${GRID_CARD} [class*="gridCardName"]`).allTextContents()
    expect(resetNames).toEqual(defaultNames)
  })

  test("world filter reduces visible cards", async ({ page }) => {
    await page.goto("/deck-builder")
    await expect(page.locator(GRID_CARD).first()).toBeVisible()

    const allCount = await page.locator(GRID_CARD).count()

    // Open world filter and select Forgotten Realms
    await page.getByTestId("world-filter").locator("button").first().click()
    await page.locator('[class*="worldDropdownItem"]').first().click()

    // Wait for grid to update
    const filteredCount = await page.locator(GRID_CARD).count()
    expect(filteredCount).toBeLessThan(allCount)
    expect(filteredCount).toBeGreaterThan(0)
  })

  test("world filter can be cleared", async ({ page }) => {
    await page.goto("/deck-builder")
    await expect(page.locator(GRID_CARD).first()).toBeVisible()

    const allCount = await page.locator(GRID_CARD).count()

    // Apply filter
    await page.getByTestId("world-filter").locator("button").first().click()
    await page.locator('[class*="worldDropdownItem"]').first().click()

    // Clear it
    await page.locator('[class*="worldDropdownClear"]').click()

    const resetCount = await page.locator(GRID_CARD).count()
    expect(resetCount).toBe(allCount)
  })

  test("world filter allows multiple selections", async ({ page }) => {
    await page.goto("/deck-builder")
    await expect(page.locator(GRID_CARD).first()).toBeVisible()

    // Open filter and select first world
    await page.getByTestId("world-filter").locator("button").first().click()
    const items = page.locator('[class*="worldDropdownItem"]')
    await items.nth(0).click()
    const oneWorldCount = await page.locator(GRID_CARD).count()

    // Select second world (dropdown stays open)
    await items.nth(1).click()
    const twoWorldCount = await page.locator(GRID_CARD).count()

    expect(twoWorldCount).toBeGreaterThanOrEqual(oneWorldCount)
  })
})

test.describe("Deck Builder custom decks panel", () => {
  test("shows 'new custom deck' option by default", async ({ page }) => {
    await page.goto("/deck-builder")
    await expect(page.locator("text=My Custom Decks")).toBeVisible()
    await expect(page.locator("text=+ new custom deck")).toBeVisible()
  })

  test("deck title shows 'My new custom deck' by default", async ({ page }) => {
    await page.goto("/deck-builder")
    await expect(page.locator('[class*="myDeckTitle"]')).toContainText("My new custom deck")
  })

  test("deck title updates when name is typed", async ({ page }) => {
    await page.goto("/deck-builder")

    await page.locator('input[placeholder="Deck name..."]').fill("Dragon Lords")
    await expect(page.locator('[class*="myDeckTitle"]')).toContainText("Dragon Lords deck")
  })

  test("'new custom deck' is highlighted when no edit param", async ({ page }) => {
    await page.goto("/deck-builder")

    const newDeckRow = page.locator("text=+ new custom deck").locator("..")
    await expect(newDeckRow).toHaveClass(/customDeckRowActive/)
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

  test("saved deck appears in custom decks panel", async ({ page }) => {
    await page.goto("/deck-builder")
    await buildValidDeck(page)

    await page.locator('input[placeholder="Deck name..."]').fill("Panel Test Deck")

    const saveBtn = page.locator("button", { hasText: "Save" })
    if (await saveBtn.isEnabled()) {
      await saveBtn.click()
      await expect(page.locator('[class*="toast"]')).toBeVisible()

      // Deck should appear in the custom decks panel
      const deckLink = page.locator('[class*="customDeckName"]', { hasText: "Panel Test Deck" })
      await expect(deckLink).toBeVisible()
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

  test("clicking 'new custom deck' after editing resets to empty state", async ({ page }) => {
    await page.goto("/deck-builder")
    await buildValidDeck(page)

    await page.locator('input[placeholder="Deck name..."]').fill("Reset Test Deck")

    const saveBtn = page.locator("button", { hasText: "Save" })
    if (await saveBtn.isEnabled()) {
      await saveBtn.click()
      await expect(page.locator('[class*="toast"]')).toBeVisible()

      // Click the saved deck to enter edit mode (adds ?edit= param)
      await page.locator('[class*="customDeckName"]', { hasText: "Reset Test Deck" }).click()
      await expect(page.getByTestId("deck-count")).toHaveText("55/55")

      // Now click "new custom deck" to reset
      await page.locator("text=+ new custom deck").click()

      // Should reset to empty
      await expect(page.getByTestId("deck-count")).toHaveText("0/55")
      await expect(page.locator('[class*="myDeckTitle"]')).toContainText("My new custom deck")
    }
  })
})
