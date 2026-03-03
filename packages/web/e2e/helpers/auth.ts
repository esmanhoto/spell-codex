import { expect, type Page } from "@playwright/test"

export const AUTH_USER_A = {
  email: "player.a@example.com",
  password: "password123",
  userId: "00000000-0000-0000-0000-000000000001",
}

export const AUTH_USER_B = {
  email: "player.b@example.com",
  password: "password123",
  userId: "00000000-0000-0000-0000-000000000002",
}

export async function signInWithPassword(page: Page, creds: { email: string; password: string }) {
  await page.goto("/login")
  if (await page.getByTestId("lobby-page").isVisible()) {
    throw new Error("Auth e2e is running in bypass session. Use test:e2e:auth or test:e2e:auth:ui.")
  }
  await expect(page.getByTestId("login-page")).toBeVisible()
  await page.getByTestId("login-email-input").fill(creds.email)
  await page.getByTestId("login-password-input").fill(creds.password)
  await page.getByTestId("login-password-btn").click()
  await expect(page.getByTestId("lobby-page")).toBeVisible()
}
