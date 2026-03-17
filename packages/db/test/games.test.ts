/**
 * Integration tests for packages/db/src/games.ts
 * Requires a running Postgres instance (docker-compose up -d).
 */

import { describe, it, expect, afterAll } from "bun:test"
import { db } from "../src/connection.ts"
import { games } from "../src/schema.ts"
import { eq } from "drizzle-orm"
import {
  createGame,
  addGamePlayer,
  getGame,
  getGameBySlug,
  getGamePlayers,
  setGameStatus,
  touchGame,
  findExpiredGames,
} from "../src/games.ts"
import type { CardData } from "@spell/engine"

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

const P1 = crypto.randomUUID()
const P2 = crypto.randomUUID()
const P3 = crypto.randomUUID()

const createdGameIds: string[] = []

afterAll(async () => {
  if (createdGameIds.length > 0) {
    for (const id of createdGameIds) {
      await db.delete(games).where(eq(games.id, id))
    }
  }
  // Connection cleanup handled by process exit
})

// ─── createGame ──────────────────────────────────────────────────────────────

describe("createGame", () => {
  it("creates a game with players and returns the game row", async () => {
    const game = await createGame({
      formatId: "standard",
      seed: 42,
      players: [
        { userId: P1, seatPosition: 0, nickname: "Alice", deckSnapshot: deck() },
        { userId: P2, seatPosition: 1, nickname: "Bob", deckSnapshot: deck() },
      ],
    })
    createdGameIds.push(game.id)

    expect(game.id).toBeDefined()
    expect(game.formatId).toBe("standard")
    expect(game.seed).toBe(42)
    expect(game.status).toBe("waiting")
    expect(game.slug).toBeTruthy()
  })

  it("inserts game_players rows linked to the game", async () => {
    const game = await createGame({
      formatId: "standard",
      seed: 99,
      players: [
        { userId: P1, seatPosition: 0, deckSnapshot: deck() },
        { userId: P2, seatPosition: 1, deckSnapshot: deck() },
      ],
    })
    createdGameIds.push(game.id)

    const players = await getGamePlayers(game.id)
    expect(players).toHaveLength(2)
    expect(players.map((p) => p.userId).sort()).toEqual([P1, P2].sort())
  })

  it("defaults nickname to empty string when omitted", async () => {
    const game = await createGame({
      formatId: "standard",
      seed: 1,
      players: [{ userId: P1, seatPosition: 0, deckSnapshot: deck() }],
    })
    createdGameIds.push(game.id)

    const players = await getGamePlayers(game.id)
    expect(players[0]!.nickname).toBe("")
  })
})

// ─── addGamePlayer ───────────────────────────────────────────────────────────

describe("addGamePlayer", () => {
  it("adds a player to an existing game", async () => {
    const game = await createGame({
      formatId: "standard",
      seed: 10,
      players: [{ userId: P1, seatPosition: 0, deckSnapshot: deck() }],
    })
    createdGameIds.push(game.id)

    const row = await addGamePlayer({
      gameId: game.id,
      userId: P3,
      seatPosition: 1,
      nickname: "Charlie",
      deckSnapshot: deck(),
    })

    expect(row.gameId).toBe(game.id)
    expect(row.userId).toBe(P3)
    expect(row.nickname).toBe("Charlie")

    const players = await getGamePlayers(game.id)
    expect(players).toHaveLength(2)
  })

  it("rejects duplicate (gameId, userId)", async () => {
    const game = await createGame({
      formatId: "standard",
      seed: 11,
      players: [{ userId: P1, seatPosition: 0, deckSnapshot: deck() }],
    })
    createdGameIds.push(game.id)

    await expect(
      addGamePlayer({ gameId: game.id, userId: P1, seatPosition: 1, deckSnapshot: deck() }),
    ).rejects.toThrow()
  })
})

// ─── getGame / getGameBySlug ─────────────────────────────────────────────────

describe("getGame", () => {
  it("returns the game row by ID", async () => {
    const game = await createGame({
      formatId: "standard",
      seed: 20,
      players: [{ userId: P1, seatPosition: 0, deckSnapshot: deck() }],
    })
    createdGameIds.push(game.id)

    const fetched = await getGame(game.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.id).toBe(game.id)
    expect(fetched!.formatId).toBe("standard")
  })

  it("returns null for a nonexistent ID", async () => {
    const fetched = await getGame(crypto.randomUUID())
    expect(fetched).toBeNull()
  })
})

describe("getGameBySlug", () => {
  it("returns the game row by slug", async () => {
    const game = await createGame({
      formatId: "standard",
      seed: 21,
      players: [{ userId: P1, seatPosition: 0, deckSnapshot: deck() }],
    })
    createdGameIds.push(game.id)

    const fetched = await getGameBySlug(game.slug!)
    expect(fetched).not.toBeNull()
    expect(fetched!.id).toBe(game.id)
  })

  it("returns null for a nonexistent slug", async () => {
    const fetched = await getGameBySlug("nonexistent-slug-xyz")
    expect(fetched).toBeNull()
  })
})

// ─── getGamePlayers ──────────────────────────────────────────────────────────

describe("getGamePlayers", () => {
  it("returns empty array for a game with no players", async () => {
    // Insert a bare game row directly (no players)
    const [game] = await db
      .insert(games)
      .values({ formatId: "standard", seed: 30, slug: `test-bare-${Date.now()}` })
      .returning()
    createdGameIds.push(game!.id)

    const players = await getGamePlayers(game!.id)
    expect(players).toHaveLength(0)
  })

  it("preserves deckSnapshot as CardData[]", async () => {
    const d = deck(3)
    const game = await createGame({
      formatId: "standard",
      seed: 31,
      players: [{ userId: P1, seatPosition: 0, deckSnapshot: d }],
    })
    createdGameIds.push(game.id)

    const players = await getGamePlayers(game.id)
    const snap = players[0]!.deckSnapshot as CardData[]
    expect(snap).toHaveLength(3)
    expect(snap[0]!.name).toBe("Forest")
  })
})

// ─── setGameStatus ───────────────────────────────────────────────────────────

describe("setGameStatus", () => {
  it("updates the game status", async () => {
    const game = await createGame({
      formatId: "standard",
      seed: 40,
      players: [{ userId: P1, seatPosition: 0, deckSnapshot: deck() }],
    })
    createdGameIds.push(game.id)

    await setGameStatus(game.id, "active")
    const fetched = await getGame(game.id)
    expect(fetched!.status).toBe("active")
  })

  it("sets winnerId when provided", async () => {
    const game = await createGame({
      formatId: "standard",
      seed: 41,
      players: [
        { userId: P1, seatPosition: 0, deckSnapshot: deck() },
        { userId: P2, seatPosition: 1, deckSnapshot: deck() },
      ],
    })
    createdGameIds.push(game.id)

    await setGameStatus(game.id, "finished", P1)
    const fetched = await getGame(game.id)
    expect(fetched!.status).toBe("finished")
    expect(fetched!.winnerId).toBe(P1)
  })
})

// ─── findExpiredGames ────────────────────────────────────────────────────────

describe("findExpiredGames", () => {
  it("returns active games past their turnDeadline", async () => {
    const game = await createGame({
      formatId: "standard",
      seed: 50,
      players: [{ userId: P1, seatPosition: 0, deckSnapshot: deck() }],
    })
    createdGameIds.push(game.id)

    await setGameStatus(game.id, "active")
    // Set deadline in the past
    await touchGame(game.id, new Date(Date.now() - 60_000))

    const expired = await findExpiredGames()
    const ids = expired.map((g) => g.id)
    expect(ids).toContain(game.id)
  })

  it("excludes finished games even if past deadline", async () => {
    const game = await createGame({
      formatId: "standard",
      seed: 51,
      players: [{ userId: P1, seatPosition: 0, deckSnapshot: deck() }],
    })
    createdGameIds.push(game.id)

    await setGameStatus(game.id, "finished")
    await touchGame(game.id, new Date(Date.now() - 60_000))

    const expired = await findExpiredGames()
    const ids = expired.map((g) => g.id)
    expect(ids).not.toContain(game.id)
  })

  it("excludes active games whose deadline is in the future", async () => {
    const game = await createGame({
      formatId: "standard",
      seed: 52,
      players: [{ userId: P1, seatPosition: 0, deckSnapshot: deck() }],
    })
    createdGameIds.push(game.id)

    await setGameStatus(game.id, "active")
    await touchGame(game.id, new Date(Date.now() + 600_000))

    const expired = await findExpiredGames()
    const ids = expired.map((g) => g.id)
    expect(ids).not.toContain(game.id)
  })
})
