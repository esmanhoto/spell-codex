import { defineConfig, devices } from "@playwright/test"

function env(name: string): string | undefined {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } }
  return g.process?.env?.[name]
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: env("CI") ? 2 : 0,
  workers: env("CI") ? 1 : undefined,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "bun --cwd ../api src/index.ts",
      url: "http://127.0.0.1:3001/health",
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        AUTH_BYPASS: "true",
        DATABASE_URL: env("DATABASE_URL") ?? "postgres://spell:spell@localhost:5433/spell",
      },
    },
    {
      command: "bun run dev -- --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        VITE_AUTH_BYPASS: "true",
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
