/**
 * Integration tests for packages/db/src/actions.ts
 * Requires a running Postgres instance (docker-compose up -d).
 */

import { describe, it, expect, afterAll } from "bun:test"
import { db } from "../src/connection.ts"
import { games } from "../src/schema.ts"
import { eq } from "drizzle-orm"
import { saveAction, listActions, lastSequence } from "../src/actions.ts"
import type { Move } from "@spell/engine"

// ─── Fixtures ────────────────────────────────────────────────────────────────

const createdGameIds: string[] = []

async function createTestGame(): Promise<string> {
  const [game] = await db
    .insert(games)
    .values({ formatId: "standard", seed: 1, slug: `test-actions-${Date.now()}-${Math.random()}` })
    .returning()
  createdGameIds.push(game!.id)
  return game!.id
}

const PLAYER = crypto.randomUUID()
const PASS: Move = { type: "PASS" }

afterAll(async () => {
  for (const id of createdGameIds) {
    await db.delete(games).where(eq(games.id, id))
  }
})

// ─── saveAction ──────────────────────────────────────────────────────────────

describe("saveAction", () => {
  it("inserts a row and returns it with all fields", async () => {
    const gameId = await createTestGame()
    const row = await saveAction({
      gameId,
      sequence: 0,
      playerId: PLAYER,
      move: PASS,
      stateHash: "a".repeat(64),
    })

    expect(row.gameId).toBe(gameId)
    expect(row.sequence).toBe(0)
    expect(row.playerId).toBe(PLAYER)
    expect(row.move).toEqual(PASS)
    expect(row.stateHash).toBe("a".repeat(64))
    expect(row.createdAt).toBeInstanceOf(Date)
  })

  it("allows same sequence on different games", async () => {
    const g1 = await createTestGame()
    const g2 = await createTestGame()

    await saveAction({
      gameId: g1,
      sequence: 0,
      playerId: PLAYER,
      move: PASS,
      stateHash: "d".repeat(64),
    })
    const row = await saveAction({
      gameId: g2,
      sequence: 0,
      playerId: PLAYER,
      move: PASS,
      stateHash: "e".repeat(64),
    })

    expect(row.gameId).toBe(g2)
  })
})

// ─── listActions ─────────────────────────────────────────────────────────────

describe("listActions", () => {
  it("returns actions ordered by sequence ascending", async () => {
    const gameId = await createTestGame()
    // Insert out of order
    await saveAction({
      gameId,
      sequence: 2,
      playerId: PLAYER,
      move: PASS,
      stateHash: "f".repeat(64),
    })
    await saveAction({
      gameId,
      sequence: 0,
      playerId: PLAYER,
      move: PASS,
      stateHash: "g".repeat(64),
    })
    await saveAction({
      gameId,
      sequence: 1,
      playerId: PLAYER,
      move: PASS,
      stateHash: "h".repeat(64),
    })

    const rows = await listActions(gameId)
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.sequence)).toEqual([0, 1, 2])
  })

  it("returns empty array for a game with no actions", async () => {
    const gameId = await createTestGame()
    const rows = await listActions(gameId)
    expect(rows).toHaveLength(0)
  })

  it("isolates actions between games", async () => {
    const g1 = await createTestGame()
    const g2 = await createTestGame()
    await saveAction({
      gameId: g1,
      sequence: 0,
      playerId: PLAYER,
      move: PASS,
      stateHash: "i".repeat(64),
    })
    await saveAction({
      gameId: g1,
      sequence: 1,
      playerId: PLAYER,
      move: PASS,
      stateHash: "j".repeat(64),
    })
    await saveAction({
      gameId: g2,
      sequence: 0,
      playerId: PLAYER,
      move: PASS,
      stateHash: "k".repeat(64),
    })

    expect(await listActions(g1)).toHaveLength(2)
    expect(await listActions(g2)).toHaveLength(1)
  })
})

// ─── lastSequence ────────────────────────────────────────────────────────────

describe("lastSequence", () => {
  it("returns -1 for a game with no actions", async () => {
    const gameId = await createTestGame()
    expect(await lastSequence(gameId)).toBe(-1)
  })

  it("returns the highest sequence number", async () => {
    const gameId = await createTestGame()
    await saveAction({
      gameId,
      sequence: 0,
      playerId: PLAYER,
      move: PASS,
      stateHash: "l".repeat(64),
    })
    await saveAction({
      gameId,
      sequence: 1,
      playerId: PLAYER,
      move: PASS,
      stateHash: "m".repeat(64),
    })
    await saveAction({
      gameId,
      sequence: 2,
      playerId: PLAYER,
      move: PASS,
      stateHash: "n".repeat(64),
    })

    expect(await lastSequence(gameId)).toBe(2)
  })

  it("returns -1 for a nonexistent game", async () => {
    expect(await lastSequence(crypto.randomUUID())).toBe(-1)
  })
})
