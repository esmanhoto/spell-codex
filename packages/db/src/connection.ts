import postgres from "postgres"

const url = process.env["DATABASE_URL"]
if (!url) throw new Error("DATABASE_URL environment variable is required")

const prepare = process.env["DB_PREPARE"] !== "false"
const rawMaxConnections = Number(process.env["DB_MAX_CONNECTIONS"] ?? "10")
const maxConnections =
  Number.isFinite(rawMaxConnections) && rawMaxConnections > 0 ? Math.floor(rawMaxConnections) : 10

const options = {
  prepare,
  max: maxConnections,
  ...(process.env["DB_SSL"] === "require" ? { ssl: "require" as const } : {}),
}

export const sql = postgres(url, options)
