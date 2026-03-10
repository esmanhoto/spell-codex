import { drizzle } from "drizzle-orm/postgres-js"
import { eq } from "drizzle-orm"
import type { CardData } from "@spell/engine"
import { sql } from "./connection.ts"
import { games, gamePlayers } from "./schema.ts"
import type { Game, GamePlayer } from "./schema.ts"
import { generateGameSlug } from "./slug.ts"

const db = drizzle(sql)

// ─── Create ───────────────────────────────────────────────────────────────────

export interface CreateGameInput {
  formatId: string
  seed: number
  players: Array<{
    userId: string
    seatPosition: number
    nickname?: string
    deckSnapshot: CardData[]
  }>
}

export interface AddGamePlayerInput {
  gameId: string
  userId: string
  seatPosition: number
  nickname?: string
  deckSnapshot: CardData[]
}

async function generateUniqueSlug(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const slug = generateGameSlug()
    const existing = await db.select({ id: games.id }).from(games).where(eq(games.slug, slug))
    if (existing.length === 0) return slug
  }
  throw new Error("Could not generate a unique game slug after 10 attempts")
}

export async function createGame(input: CreateGameInput): Promise<Game> {
  const slug = await generateUniqueSlug()
  const [game] = await db
    .insert(games)
    .values({
      formatId: input.formatId,
      seed: input.seed,
      slug,
    })
    .returning()
  if (!game) throw new Error("Failed to insert game row")

  await db.insert(gamePlayers).values(
    input.players.map((p) => ({
      gameId: game.id,
      userId: p.userId,
      seatPosition: p.seatPosition,
      nickname: p.nickname ?? "",
      deckSnapshot: p.deckSnapshot,
    })),
  )

  return game
}

export async function addGamePlayer(input: AddGamePlayerInput): Promise<GamePlayer> {
  const [row] = await db
    .insert(gamePlayers)
    .values({
      gameId: input.gameId,
      userId: input.userId,
      seatPosition: input.seatPosition,
      nickname: input.nickname ?? "",
      deckSnapshot: input.deckSnapshot,
    })
    .returning()

  if (!row) throw new Error("Failed to insert game player row")
  return row
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getGame(gameId: string): Promise<Game | null> {
  const [row] = await db.select().from(games).where(eq(games.id, gameId))
  return row ?? null
}

export async function getGameBySlug(slug: string): Promise<Game | null> {
  const [row] = await db.select().from(games).where(eq(games.slug, slug))
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
  await db
    .update(games)
    .set({ status, ...(winnerId ? { winnerId } : {}) })
    .where(eq(games.id, gameId))
}

export async function touchGame(gameId: string, turnDeadline?: Date): Promise<void> {
  await db
    .update(games)
    .set({ lastActionAt: new Date(), ...(turnDeadline ? { turnDeadline } : {}) })
    .where(eq(games.id, gameId))
}

/** Returns all active games whose turnDeadline has passed. */
// ─── Dev scenarios ────────────────────────────────────────────────────────────

export interface CreateDevGameInput {
  stateSnapshot: object
  p1UserId: string
  p2UserId: string
}

/**
 * Creates a fully-active game from a pre-built GameState snapshot.
 * Used only by the dev scenario loader — never called in normal game flow.
 * Both players are seeded with an empty deckSnapshot (unused, since state
 * reconstruction will use stateSnapshot directly).
 */
export async function createDevGame(input: CreateDevGameInput): Promise<Game> {
  const slug = await generateUniqueSlug()

  const [game] = await db
    .insert(games)
    .values({ formatId: "dev", seed: 0, slug, status: "active" })
    .returning()
  if (!game) throw new Error("Failed to insert dev game row")

  // Re-insert with the corrected state ID (now that we have the DB UUID)
  const snapshot = { ...input.stateSnapshot, id: game.id }
  await db.update(games).set({ stateSnapshot: snapshot }).where(eq(games.id, game.id))

  await db.insert(gamePlayers).values([
    { gameId: game.id, userId: input.p1UserId, seatPosition: 0, deckSnapshot: [] },
    { gameId: game.id, userId: input.p2UserId, seatPosition: 1, deckSnapshot: [] },
  ])

  return game
}

export async function findExpiredGames(): Promise<Game[]> {
  const { lt } = await import("drizzle-orm")
  return db
    .select()
    .from(games)
    .where(lt(games.turnDeadline, new Date()))
    .then((rows) => rows.filter((r) => r.status === "active"))
}
