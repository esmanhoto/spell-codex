import { defineConfig } from "drizzle-kit"
import { readFileSync } from "fs"
import path from "path"

// Load root .env when DATABASE_URL isn't already in the environment
// (e.g. when drizzle-kit is called directly without a bun wrapper).
if (!process.env["DATABASE_URL"]) {
  try {
    const envPath = path.resolve(process.cwd(), "../../.env")
    for (const line of readFileSync(envPath, "utf-8").split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eq = trimmed.indexOf("=")
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim()
      process.env[key] = val
    }
  } catch {
    // .env not present — DATABASE_URL must be set externally
  }
}

export default defineConfig({
  schema:    "./src/schema.ts",
  out:       "./drizzle",
  dialect:   "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "",
  },
})
