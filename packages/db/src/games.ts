import { drizzle } from "drizzle-orm/postgres-js"
import { eq } from "drizzle-orm"
import type { CardData } from "@spell/engine"
import { sql } from "./connection.ts"
import { games, gamePlayers } from "./schema.ts"
import type { Game, GamePlayer } from "./schema.ts"

const db = drizzle(sql)

// ─── Create ───────────────────────────────────────────────────────────────────

export interface CreateGameInput {
  formatId: string
  seed: number
  players: Array<{
    userId: string
    seatPosition: number
    deckSnapshot: CardData[]
  }>
}

export async function createGame(input: CreateGameInput): Promise<Game> {
  const [game] = await db.insert(games).values({ formatId: input.formatId, seed: input.seed }).returning()
  if (!game) throw new Error("Failed to insert game row")

  await db.insert(gamePlayers).values(
    input.players.map(p => ({
      gameId:       game.id,
      userId:       p.userId,
      seatPosition: p.seatPosition,
      deckSnapshot: p.deckSnapshot,
    }))
  )

  return game
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getGame(gameId: string): Promise<Game | null> {
  const [row] = await db.select().from(games).where(eq(games.id, gameId))
  return row ?? null
}

export async function getGamePlayers(gameId: string): Promise<GamePlayer[]> {
  return db.select().from(gamePlayers).where(eq(gamePlayers.gameId, gameId))
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function setGameStatus(
  gameId: string,
  status: Game["status"],
  winnerId?: string,
): Promise<void> {
  await db.update(games)
    .set({ status, ...(winnerId ? { winnerId } : {}) })
    .where(eq(games.id, gameId))
}

export async function touchGame(gameId: string, turnDeadline?: Date): Promise<void> {
  await db.update(games)
    .set({ lastActionAt: new Date(), ...(turnDeadline ? { turnDeadline } : {}) })
    .where(eq(games.id, gameId))
}

/** Returns all active games whose turnDeadline has passed. */
export async function findExpiredGames(): Promise<Game[]> {
  const { lt } = await import("drizzle-orm")
  return db.select().from(games).where(
    lt(games.turnDeadline, new Date())
  ).then(rows => rows.filter(r => r.status === "active"))
}
