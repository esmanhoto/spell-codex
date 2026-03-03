import { expect, test } from "@playwright/test"
import { AUTH_USER_A, signInWithPassword } from "./helpers/auth.ts"

test("password login succeeds with mock Supabase", async ({ page }) => {
  await signInWithPassword(page, AUTH_USER_A)
  await expect(page.getByTestId("create-mode-btn")).toBeVisible()
  await expect(page.getByTestId("join-mode-btn")).toBeVisible()
})

test("password login rejects invalid credentials", async ({ page }) => {
  await page.goto("/login")
  await page.getByTestId("login-email-input").fill(AUTH_USER_A.email)
  await page.getByTestId("login-password-input").fill("wrong-password")
  await page.getByTestId("login-password-btn").click()
  await expect(page.getByTestId("login-error")).toContainText("Invalid login credentials")
})
