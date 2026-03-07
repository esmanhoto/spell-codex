import { defineConfig, devices } from "@playwright/test"

const repoRoot = new URL("../..", import.meta.url).pathname
const rootEnvFile = `${repoRoot}.env`
const apiDir = `${repoRoot}packages/api`

function env(name: string): string | undefined {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } }
  return g.process?.env?.[name]
}

function envMap(values: Record<string, string>): Record<string, string> {
  return values
}

export default defineConfig({
  testDir: "./e2e",
  testIgnore: [/auth-.*\.spec\.ts/],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: env("CI") ? 2 : 0,
  ...(env("CI") ? { workers: 1 } : {}),
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  // Dedicated ports + no reuse so this suite never attaches to auth-mode dev servers.
  use: (() => {
    const webPort = env("E2E_WEB_PORT") ?? "4175"
    return {
      baseURL: `http://127.0.0.1:${webPort}`,
      trace: "retain-on-failure" as const,
    }
  })(),
  webServer: (() => {
    const apiPort = env("E2E_API_PORT") ?? "3100"
    const webPort = env("E2E_WEB_PORT") ?? "4175"
    const apiUrl = `http://127.0.0.1:${apiPort}`
    const webUrl = `http://127.0.0.1:${webPort}`
    return [
      {
        command: `bun --env-file=${rootEnvFile} --cwd ${apiDir} src/index.ts`,
        url: `${apiUrl}/health`,
        reuseExistingServer: false,
        timeout: 120_000,
        env: envMap({
          PORT: apiPort,
          AUTH_BYPASS: "true",
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
          VITE_AUTH_BYPASS: "true",
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
