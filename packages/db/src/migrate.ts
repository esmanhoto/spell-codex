/**
 * Run as: DATABASE_URL=... bun src/migrate.ts
 * Applies all pending SQL migrations from the ./drizzle folder.
 */
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"
import path from "path"

const url = process.env["DATABASE_URL"]
if (!url) throw new Error("DATABASE_URL is required")

// Use a separate connection with max:1 for migrations (required by drizzle migrator)
const migrationClient = postgres(url, { max: 1 })
const db = drizzle(migrationClient)

const migrationsFolder = path.join(import.meta.dir, "..", "drizzle")

console.log("Running migrations from", migrationsFolder)
await migrate(db, { migrationsFolder })
console.log("Migrations complete.")

await migrationClient.end()
