import { test, expect } from "@playwright/test"
import { startGame } from "./helpers/game.ts"

test("formation is visible by default", async ({ page, request }) => {
  await startGame(page, request)
  await expect(page.getByTestId("formation-body-self")).toBeVisible()
})

test("clicking the collapse toggle hides the formation", async ({ page, request }) => {
  await startGame(page, request)
  await page.getByTestId("formation-collapse-toggle").click()
  await expect(page.getByTestId("formation-body-self")).not.toBeVisible()
})

test("clicking the collapse toggle twice restores the formation", async ({ page, request }) => {
  await startGame(page, request)
  await page.getByTestId("formation-collapse-toggle").click()
  await page.getByTestId("formation-collapse-toggle").click()
  await expect(page.getByTestId("formation-body-self")).toBeVisible()
})

test("opponent formation has no collapse toggle", async ({ page, request }) => {
  await startGame(page, request)
  // Only one toggle should exist — the own player's
  await expect(page.getByTestId("formation-collapse-toggle")).toHaveCount(1)
})
