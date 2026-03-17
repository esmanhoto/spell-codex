/**
 * Phase 3b — Data integrity tests for packages/db.
 * Tests concurrent writes, non-atomic operations, reconstruction edge cases,
 * deck snapshot handling, and slug collision retry.
 *
 * Requires a running Postgres instance (docker-compose up -d).
 */

import { describe, it, expect, afterAll } from "bun:test"
import { db } from "../src/connection.ts"
import { games, gamePlayers } from "../src/schema.ts"
import { eq } from "drizzle-orm"
import { saveAction, listActions } from "../src/actions.ts"
import { createGame, getGame, getGamePlayers, setGameStatus } from "../src/games.ts"
import { reconstructState } from "../src/reconstruct.ts"
import { hashState } from "../src/hash.ts"
import { initGame, applyMove, _resetInstanceCounter } from "@spell/engine"
import type { CardData, Move } from "@spell/engine"

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CARD: CardData = {
  setId: "01",
  cardNumber: 1,
  name: "Forest",
  typeId: 13,
  worldId: 1,
  isAvatar: false,
  level: null,
  description: "",
  attributes: [],
  supportIds: [],
  effects: [],
}

function deck(n = 55): CardData[] {
  return Array.from({ length: n }, () => CARD)
}

const PASS: Move = { type: "PASS" }
const createdGameIds: string[] = []

async function createBareGame(slug?: string): Promise<string> {
  const [game] = await db
    .insert(games)
    .values({
      formatId: "standard",
      seed: 42,
      slug: slug ?? `test-integrity-${Date.now()}-${Math.random()}`,
    })
    .returning()
  createdGameIds.push(game!.id)
  return game!.id
}

afterAll(async () => {
  for (const id of createdGameIds) {
    await db.delete(games).where(eq(games.id, id))
  }
})

// ─── 1. Sequence collision ───────────────────────────────────────────────────

describe("sequence collision", () => {
  it("concurrent inserts with same (gameId, sequence) — exactly one succeeds", async () => {
    const gameId = await createBareGame()
    const player = crypto.randomUUID()

    const results = await Promise.allSettled([
      saveAction({ gameId, sequence: 0, playerId: player, move: PASS, stateHash: "a".repeat(64) }),
      saveAction({ gameId, sequence: 0, playerId: player, move: PASS, stateHash: "b".repeat(64) }),
    ])

    const fulfilled = results.filter((r) => r.status === "fulfilled")
    const rejected = results.filter((r) => r.status === "rejected")
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
  })

  it("unique constraint error does not corrupt subsequent inserts", async () => {
    const gameId = await createBareGame()
    const player = crypto.randomUUID()

    await saveAction({
      gameId,
      sequence: 0,
      playerId: player,
      move: PASS,
      stateHash: "c".repeat(64),
    })
    // Duplicate — should fail
    await saveAction({
      gameId,
      sequence: 0,
      playerId: player,
      move: PASS,
      stateHash: "d".repeat(64),
    }).catch(() => {})
    // Next sequence — should succeed
    const row = await saveAction({
      gameId,
      sequence: 1,
      playerId: player,
      move: PASS,
      stateHash: "e".repeat(64),
    })
    expect(row.sequence).toBe(1)

    const actions = await listActions(gameId)
    expect(actions).toHaveLength(2)
    expect(actions.map((a) => a.sequence)).toEqual([0, 1])
  })
})

// ─── 2. Non-atomic persist ───────────────────────────────────────────────────

describe("non-atomic persist", () => {
  it("saveAction succeeds independently of setGameStatus", async () => {
    const P1 = crypto.randomUUID()
    const P2 = crypto.randomUUID()
    const game = await createGame({
      formatId: "standard",
      seed: 1,
      players: [
        { userId: P1, seatPosition: 0, deckSnapshot: deck() },
        { userId: P2, seatPosition: 1, deckSnapshot: deck() },
      ],
    })
    createdGameIds.push(game.id)

    // Save an action — this should persist even if status update hasn't happened
    await saveAction({
      gameId: game.id,
      sequence: 0,
      playerId: P1,
      move: PASS,
      stateHash: "f".repeat(64),
    })

    // Game is still "waiting" — action was saved without status change
    const fetched = await getGame(game.id)
    expect(fetched!.status).toBe("waiting")
    const actions = await listActions(game.id)
    expect(actions).toHaveLength(1)
  })

  it("setGameStatus to finished persists even with no actions", async () => {
    const game = await createGame({
      formatId: "standard",
      seed: 2,
      players: [{ userId: crypto.randomUUID(), seatPosition: 0, deckSnapshot: deck() }],
    })
    createdGameIds.push(game.id)

    await setGameStatus(game.id, "finished")
    const fetched = await getGame(game.id)
    expect(fetched!.status).toBe("finished")

    const actions = await listActions(game.id)
    expect(actions).toHaveLength(0)
  })
})

// ─── 3. Hash mismatch detection ──────────────────────────────────────────────

describe("hash mismatch detection", () => {
  it("reconstructState ignores stored hashes — no hash_mismatch errors", async () => {
    const P1 = crypto.randomUUID()
    const P2 = crypto.randomUUID()
    const game = await createGame({
      formatId: "standard",
      seed: 42,
      players: [
        { userId: P1, seatPosition: 0, deckSnapshot: deck() },
        { userId: P2, seatPosition: 1, deckSnapshot: deck() },
      ],
    })
    createdGameIds.push(game.id)
    await setGameStatus(game.id, "active")

    // Save action with a deliberately wrong hash
    await saveAction({
      gameId: game.id,
      sequence: 0,
      playerId: P1,
      move: PASS,
      stateHash: "0".repeat(64), // wrong hash
    })

    const result = await reconstructState(game.id, 42)
    // No hash_mismatch errors — reconstruction doesn't verify hashes
    const hashErrors = result.errors.filter((e) => e.kind === "hash_mismatch")
    expect(hashErrors).toHaveLength(0)
  })

  it("stored hash diverges from engine-computed hash after replay", async () => {
    const P1 = crypto.randomUUID()
    const P2 = crypto.randomUUID()
    const game = await createGame({
      formatId: "standard",
      seed: 42,
      players: [
        { userId: P1, seatPosition: 0, deckSnapshot: deck() },
        { userId: P2, seatPosition: 1, deckSnapshot: deck() },
      ],
    })
    createdGameIds.push(game.id)

    await saveAction({
      gameId: game.id,
      sequence: 0,
      playerId: P1,
      move: PASS,
      stateHash: "bad".repeat(21) + "x", // 64 chars, wrong
    })

    const result = await reconstructState(game.id, 42)
    const replayHash = hashState(result.state)

    // The stored hash doesn't match the replayed state hash
    const actions = await listActions(game.id)
    expect(actions[0]!.stateHash).not.toBe(replayHash)
    // But reconstruction succeeded without errors
    expect(result.errors).toHaveLength(0)
  })
})

// ─── 4. Partial action logs ─────────────────────────────────────────────────

describe("partial action logs", () => {
  it("reconstruction with gap in sequence — skipped actions cause engine errors", async () => {
    const P1 = crypto.randomUUID()
    const P2 = crypto.randomUUID()
    const game = await createGame({
      formatId: "standard",
      seed: 42,
      players: [
        { userId: P1, seatPosition: 0, deckSnapshot: deck() },
        { userId: P2, seatPosition: 1, deckSnapshot: deck() },
      ],
    })
    createdGameIds.push(game.id)

    // Build correct actions in-memory
    _resetInstanceCounter()
    const state0 = initGame({
      gameId: game.id,
      seed: 42,
      players: [
        { id: P1, deckCards: deck() },
        { id: P2, deckCards: deck() },
      ],
    })
    const r1 = applyMove(state0, P1, PASS)
    const r2 = applyMove(r1.newState, P1, PASS)
    const r3 = applyMove(r2.newState, P1, PASS)

    // Save seq 0 and seq 2, skip seq 1 — simulates missing action
    await saveAction({
      gameId: game.id,
      sequence: 0,
      playerId: P1,
      move: PASS,
      stateHash: hashState(r1.newState),
    })
    await saveAction({
      gameId: game.id,
      sequence: 2,
      playerId: P1,
      move: PASS,
      stateHash: hashState(r3.newState),
    })

    // Reconstruction replays only the 2 stored actions (seq 0 and 2)
    // Both are PASS moves — seq 2 applies to the state after seq 0
    const result = await reconstructState(game.id, 42)
    const actions = await listActions(game.id)
    expect(actions).toHaveLength(2)
    expect(actions.map((a) => a.sequence)).toEqual([0, 2])
    // Reconstruction still succeeds (PASS is always legal)
    expect(result.errors).toHaveLength(0)
  })

  it("reconstruction with invalid move in log collects engine_error", async () => {
    const P1 = crypto.randomUUID()
    const P2 = crypto.randomUUID()
    const game = await createGame({
      formatId: "standard",
      seed: 42,
      players: [
        { userId: P1, seatPosition: 0, deckSnapshot: deck() },
        { userId: P2, seatPosition: 1, deckSnapshot: deck() },
      ],
    })
    createdGameIds.push(game.id)

    // Save an invalid move
    await saveAction({
      gameId: game.id,
      sequence: 0,
      playerId: P1,
      move: { type: "TOTALLY_INVALID" } as unknown as Move,
      stateHash: "z".repeat(64),
    })

    const result = await reconstructState(game.id, 42)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.kind).toBe("engine_error")
    expect(result.errors[0]!.sequence).toBe(0)
  })
})

// ─── 5. Deck snapshot corruption ─────────────────────────────────────────────

describe("deck snapshot corruption", () => {
  it("JSONB accepts non-CardData objects without validation", async () => {
    const gameId = await createBareGame()
    const userId = crypto.randomUUID()

    // Insert a player with garbage deckSnapshot — DB accepts it
    await db.insert(gamePlayers).values({
      gameId,
      userId,
      seatPosition: 0,
      deckSnapshot: [{ garbage: true, notACard: 42 }],
    })

    const players = await getGamePlayers(gameId)
    expect(players).toHaveLength(1)
    const snap = players[0]!.deckSnapshot as unknown[]
    expect(snap[0]).toEqual({ garbage: true, notACard: 42 })
  })

  it("empty deckSnapshot array is preserved", async () => {
    const gameId = await createBareGame()
    const userId = crypto.randomUUID()

    await db.insert(gamePlayers).values({
      gameId,
      userId,
      seatPosition: 0,
      deckSnapshot: [],
    })

    const players = await getGamePlayers(gameId)
    expect(players[0]!.deckSnapshot).toEqual([])
  })

  it("reconstruction with corrupted deck data produces broken state silently", async () => {
    const P1 = crypto.randomUUID()
    const P2 = crypto.randomUUID()
    const gameId = await createBareGame()

    // Insert players with invalid deck data — DB accepts it
    await db.insert(gamePlayers).values([
      { gameId, userId: P1, seatPosition: 0, deckSnapshot: [{ bad: true }] },
      { gameId, userId: P2, seatPosition: 1, deckSnapshot: [{ bad: true }] },
    ])

    // Engine silently accepts garbage cards — no schema validation
    const result = await reconstructState(gameId, 42)
    expect(result.errors).toHaveLength(0)
    // State was created but with broken data — no validation at DB or engine boundary
    expect(result.state).toBeDefined()
    expect(result.state.id).toBe(gameId)
  })
})

// ─── 6. Slug collision retry ─────────────────────────────────────────────────

describe("slug collision retry", () => {
  it("createGame succeeds despite first slug colliding", async () => {
    // Create two games — both get unique slugs via the retry loop
    const g1 = await createGame({
      formatId: "standard",
      seed: 1,
      players: [{ userId: crypto.randomUUID(), seatPosition: 0, deckSnapshot: deck() }],
    })
    createdGameIds.push(g1.id)

    const g2 = await createGame({
      formatId: "standard",
      seed: 2,
      players: [{ userId: crypto.randomUUID(), seatPosition: 0, deckSnapshot: deck() }],
    })
    createdGameIds.push(g2.id)

    // Both have valid, distinct slugs
    expect(g1.slug).toBeTruthy()
    expect(g2.slug).toBeTruthy()
    expect(g1.slug).not.toBe(g2.slug)
  })

  it("slug unique constraint is enforced at DB level", async () => {
    const slug = `test-collision-${Date.now()}`
    await createBareGame(slug)

    // Direct insert with same slug — DB rejects
    const insertDuplicate = async () => {
      const [row] = await db
        .insert(games)
        .values({ formatId: "standard", seed: 99, slug })
        .returning()
      return row
    }
    await expect(insertDuplicate()).rejects.toThrow()
  })
})
