import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { createGame, getGame, getGamePlayers, reconstructState } from "@spell/db"
import type { CardData } from "@spell/engine"
import { serializeGameState } from "../serialize.ts"

// ─── Validation schemas ───────────────────────────────────────────────────────

const CardDataSchema = z.object({
  setId:       z.string(),
  cardNumber:  z.number().int(),
  name:        z.string(),
  typeId:      z.number().int(),
  worldId:     z.number().int(),
  isAvatar:    z.boolean().default(false),
  level:       z.union([z.number(), z.string(), z.null()]),
  description: z.string().default(""),
  attributes:  z.array(z.string()).default([]),
  supportIds:  z.array(z.union([z.number(), z.string()])).default([]),
  effects:     z.array(z.unknown()).default([]),
}).passthrough() as z.ZodType<CardData>

const PlayerInputSchema = z.object({
  userId:       z.string().uuid(),
  deckSnapshot: z.array(CardDataSchema).min(55).max(110),
  isBot:        z.boolean().default(false),
})

const CreateGameSchema = z.object({
  formatId: z.string(),
  seed:     z.number().int(),
  players:  z.tuple([PlayerInputSchema, PlayerInputSchema]),
})

export const gamesRouter = new Hono<{ Variables: { userId: string } }>()

// ─── POST /games ──────────────────────────────────────────────────────────────

gamesRouter.post("/", zValidator("json", CreateGameSchema), async (c) => {
  const userId = c.get("userId")
  const body   = c.req.valid("json")

  // Requester must be one of the two players
  const ids = body.players.map(p => p.userId)
  if (!ids.includes(userId)) {
    return c.json({ error: "You must be one of the two players" }, 400)
  }

  const game = await createGame({
    formatId: body.formatId,
    seed:     body.seed,
    players: body.players.map((p, i) => ({
      userId:       p.userId,
      seatPosition: i,
      deckSnapshot: p.deckSnapshot,
      isBot:        p.isBot,
    })),
  })

  return c.json({ gameId: game.id }, 201)
})

// ─── GET /games/:id ───────────────────────────────────────────────────────────

gamesRouter.get("/:id", async (c) => {
  const userId = c.get("userId")
  const gameId = c.req.param("id")

  const game = await getGame(gameId)
  if (!game) return c.json({ error: "Game not found" }, 404)

  const players = await getGamePlayers(gameId)
  if (!players.some(p => p.userId === userId)) {
    return c.json({ error: "Forbidden" }, 403)
  }

  const { state, errors } = await reconstructState(gameId, game.seed)

  return c.json({
    ...serializeGameState(state, { status: game.status, turnDeadline: game.turnDeadline }, userId),
    integrityErrors: errors.length > 0 ? errors : undefined,
  })
})
