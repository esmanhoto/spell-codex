import postgres from "postgres"

const url = process.env["DATABASE_URL"]
if (!url) throw new Error("DATABASE_URL environment variable is required")

export const sql = postgres(url)
