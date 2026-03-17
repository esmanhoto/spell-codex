/**
 * Phase 3c — Migration schema verification tests.
 * Verifies that all expected tables, columns, constraints, and indexes
 * exist in the database after migrations have run.
 *
 * Requires a running Postgres instance (docker-compose up -d).
 */

import { describe, it, expect } from "bun:test"
import { sql } from "../src/connection.ts"

// ─── Helper ──────────────────────────────────────────────────────────────────

async function getColumns(table: string) {
  const rows = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = ${table}
    ORDER BY ordinal_position
  `
  return rows
}

async function getConstraints(table: string) {
  const rows = await sql`
    SELECT constraint_name, constraint_type
    FROM information_schema.table_constraints
    WHERE table_name = ${table}
    ORDER BY constraint_name
  `
  return rows
}

async function getIndexes(table: string) {
  const rows = await sql`
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = ${table}
    ORDER BY indexname
  `
  return rows
}

// ─── games table ─────────────────────────────────────────────────────────────

describe("games table schema", () => {
  it("has all expected columns", async () => {
    const cols = await getColumns("games")
    const names = cols.map((c) => c.column_name)
    expect(names).toContain("id")
    expect(names).toContain("status")
    expect(names).toContain("format_id")
    expect(names).toContain("seed")
    expect(names).toContain("play_mode")
    expect(names).toContain("created_at")
    expect(names).toContain("last_action_at")
    expect(names).toContain("turn_deadline")
    expect(names).toContain("winner_id")
    expect(names).toContain("slug")
    expect(names).toContain("state_snapshot")
  })

  it("has a primary key on id", async () => {
    const constraints = await getConstraints("games")
    const pk = constraints.find((c) => c.constraint_type === "PRIMARY KEY")
    expect(pk).toBeDefined()
  })

  it("has a unique constraint on slug", async () => {
    const constraints = await getConstraints("games")
    const unique = constraints.filter((c) => c.constraint_type === "UNIQUE")
    const slugUnique = unique.find((c) => c.constraint_name.includes("slug"))
    expect(slugUnique).toBeDefined()
  })

  it("turn_deadline is nullable", async () => {
    const cols = await getColumns("games")
    const td = cols.find((c) => c.column_name === "turn_deadline")
    expect(td!.is_nullable).toBe("YES")
  })
})

// ─── game_players table ──────────────────────────────────────────────────────

describe("game_players table schema", () => {
  it("has all expected columns including nickname", async () => {
    const cols = await getColumns("game_players")
    const names = cols.map((c) => c.column_name)
    expect(names).toContain("id")
    expect(names).toContain("game_id")
    expect(names).toContain("user_id")
    expect(names).toContain("seat_position")
    expect(names).toContain("deck_snapshot")
    expect(names).toContain("nickname")
  })

  it("has unique constraint on (game_id, user_id)", async () => {
    const constraints = await getConstraints("game_players")
    const unique = constraints.find(
      (c) => c.constraint_type === "UNIQUE" && c.constraint_name.includes("game_user"),
    )
    expect(unique).toBeDefined()
  })

  it("has foreign key to games", async () => {
    const constraints = await getConstraints("game_players")
    const fk = constraints.find((c) => c.constraint_type === "FOREIGN KEY")
    expect(fk).toBeDefined()
  })

  it("has index on game_id", async () => {
    const indexes = await getIndexes("game_players")
    const gameIdIdx = indexes.find((i) => i.indexname.includes("game_id"))
    expect(gameIdIdx).toBeDefined()
  })
})

// ─── game_actions table ──────────────────────────────────────────────────────

describe("game_actions table schema", () => {
  it("has all expected columns", async () => {
    const cols = await getColumns("game_actions")
    const names = cols.map((c) => c.column_name)
    expect(names).toContain("id")
    expect(names).toContain("game_id")
    expect(names).toContain("sequence")
    expect(names).toContain("player_id")
    expect(names).toContain("move")
    expect(names).toContain("state_hash")
    expect(names).toContain("created_at")
  })

  it("has unique constraint on (game_id, sequence)", async () => {
    const constraints = await getConstraints("game_actions")
    const unique = constraints.find(
      (c) => c.constraint_type === "UNIQUE" && c.constraint_name.includes("game_sequence"),
    )
    expect(unique).toBeDefined()
  })

  it("has foreign key to games", async () => {
    const constraints = await getConstraints("game_actions")
    const fk = constraints.find((c) => c.constraint_type === "FOREIGN KEY")
    expect(fk).toBeDefined()
  })

  it("has index on game_id", async () => {
    const indexes = await getIndexes("game_actions")
    const gameIdIdx = indexes.find((i) => i.indexname.includes("game_id"))
    expect(gameIdIdx).toBeDefined()
  })
})

// ─── profiles table ──────────────────────────────────────────────────────────

describe("profiles table schema", () => {
  it("has all expected columns", async () => {
    const cols = await getColumns("profiles")
    const names = cols.map((c) => c.column_name)
    expect(names).toContain("user_id")
    expect(names).toContain("nickname")
    expect(names).toContain("updated_at")
  })

  it("has primary key on user_id", async () => {
    const constraints = await getConstraints("profiles")
    const pk = constraints.find((c) => c.constraint_type === "PRIMARY KEY")
    expect(pk).toBeDefined()
  })
})
