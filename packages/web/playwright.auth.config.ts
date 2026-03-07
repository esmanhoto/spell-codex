import { defineConfig, devices } from "@playwright/test"
import { readFileSync } from "node:fs"
import path from "node:path"

function env(name: string): string | undefined {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } }
  return g.process?.env?.[name]
}

function envMap(values: Record<string, string>): Record<string, string> {
  return values
}

function readRootEnvValue(name: string): string | undefined {
  const envPath = path.resolve(process.cwd(), "../../.env")
  try {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eq = trimmed.indexOf("=")
      if (eq < 1) continue
      const key = trimmed.slice(0, eq).trim()
      if (key !== name) continue
      return trimmed.slice(eq + 1).trim()
    }
  } catch {
    // ignore missing .env
  }
  return undefined
}

function requiredDatabaseUrl(): string {
  const value = env("DATABASE_URL") ?? readRootEnvValue("DATABASE_URL")
  if (!value) {
    throw new Error("DATABASE_URL required for auth e2e. Set env or root .env")
  }
  return value
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: /auth-.*\.spec\.ts/,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  retries: env("CI") ? 2 : 0,
  ...(env("CI") ? { workers: 1 } : {}),
  reporter: [["list"], ["html", { outputFolder: "playwright-report-auth", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
  },
  // Use dedicated ports to avoid collisions with locally running dev servers.
  webServer: (() => {
    const mockPort = env("MOCK_SUPABASE_PORT") ?? "55439"
    const apiPort = env("AUTH_E2E_API_PORT") ?? "3101"
    const webPort = env("AUTH_E2E_WEB_PORT") ?? "4174"
    const mockUrl = `http://127.0.0.1:${mockPort}`
    const apiUrl = `http://127.0.0.1:${apiPort}`
    const webUrl = `http://127.0.0.1:${webPort}`
    const databaseUrl = requiredDatabaseUrl()
    return [
      {
        command: "bun e2e/helpers/mock-supabase-server.ts",
        url: `${mockUrl}/health`,
        reuseExistingServer: false,
        timeout: 120_000,
        env: envMap({
          MOCK_SUPABASE_PORT: mockPort,
          SUPABASE_ANON_KEY: "test-key",
        }),
      },
      {
        command: "bun --cwd ../api src/index.ts",
        url: `${apiUrl}/health`,
        reuseExistingServer: false,
        timeout: 120_000,
        env: envMap({
          PORT: apiPort,
          DATABASE_URL: databaseUrl,
          AUTH_BYPASS: "false",
          SUPABASE_URL: mockUrl,
          SUPABASE_ANON_KEY: "test-key",
        }),
      },
      {
        command: `bun run dev -- --host 127.0.0.1 --port ${webPort}`,
        url: webUrl,
        reuseExistingServer: false,
        timeout: 120_000,
        env: envMap({
          API_PROXY_TARGET: apiUrl,
          WS_PROXY_TARGET: `ws://127.0.0.1:${apiPort}`,
          VITE_AUTH_BYPASS: "false",
          VITE_SUPABASE_URL: mockUrl,
          VITE_SUPABASE_ANON_KEY: "test-key",
        }),
      },
    ]
  })(),
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
