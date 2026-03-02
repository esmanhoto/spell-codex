import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import {
  createGame,
  addGamePlayer,
  getGame,
  getGamePlayers,
  reconstructState,
  setGameStatus,
} from "@spell/db"
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
})

const CreateGameSchema = z.object({
  formatId: z.string(),
  seed:     z.number().int(),
  players:  z.tuple([PlayerInputSchema, PlayerInputSchema]),
})

const CreateLobbySchema = z.object({
  formatId: z.string(),
  seed: z.number().int(),
  deckSnapshot: z.array(CardDataSchema).min(55).max(110),
})

const JoinLobbySchema = z.object({
  deckSnapshot: z.array(CardDataSchema).min(55).max(110),
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
    })),
  })
  await setGameStatus(game.id, "active")

  return c.json({ gameId: game.id }, 201)
})

// ─── POST /games/lobby (create waiting room) ─────────────────────────────────

gamesRouter.post("/lobby", zValidator("json", CreateLobbySchema), async (c) => {
  const userId = c.get("userId")
  const body = c.req.valid("json")

  const game = await createGame({
    formatId: body.formatId,
    seed: body.seed,
    players: [{
      userId,
      seatPosition: 0,
      deckSnapshot: body.deckSnapshot,
    }],
  })

  return c.json({ gameId: game.id, status: "waiting" as const }, 201)
})

// ─── GET /games/:id/lobby (waiting room status) ─────────────────────────────

gamesRouter.get("/:id/lobby", async (c) => {
  const gameId = c.req.param("id")

  const game = await getGame(gameId)
  if (!game) return c.json({ error: "Game not found" }, 404)

  const players = await getGamePlayers(gameId)
  return c.json({
    gameId,
    status: game.status,
    playerCount: players.length,
    isFull: players.length >= 2,
  })
})

// ─── POST /games/:id/join (join waiting room by game ID) ────────────────────

gamesRouter.post("/:id/join", zValidator("json", JoinLobbySchema), async (c) => {
  const userId = c.get("userId")
  const gameId = c.req.param("id")
  const body = c.req.valid("json")

  const game = await getGame(gameId)
  if (!game) return c.json({ error: "Game not found" }, 404)
  if (game.status === "finished" || game.status === "abandoned") {
    return c.json({ error: "Game is not joinable" }, 409)
  }

  const players = await getGamePlayers(gameId)
  if (players.some(p => p.userId === userId)) {
    return c.json({
      gameId,
      status: game.status,
      playerCount: players.length,
      joined: true,
      alreadyParticipant: true,
    })
  }
  if (players.length >= 2) {
    return c.json({ error: "Game already has 2 players" }, 409)
  }

  await addGamePlayer({
    gameId,
    userId,
    seatPosition: players.length,
    deckSnapshot: body.deckSnapshot,
  })

  const newPlayerCount = players.length + 1
  const newStatus = newPlayerCount >= 2 ? "active" : "waiting"
  if (newStatus !== game.status) {
    await setGameStatus(gameId, newStatus)
  }

  return c.json({
    gameId,
    status: newStatus,
    playerCount: newPlayerCount,
    joined: true,
    alreadyParticipant: false,
  })
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
  if (game.status === "waiting" && players.length < 2) {
    return c.json({ error: "Game is waiting for an opponent to join" }, 409)
  }

  const { state, errors } = await reconstructState(gameId, game.seed)

  return c.json({
    ...serializeGameState(state, { status: game.status, turnDeadline: game.turnDeadline }, userId),
    integrityErrors: errors.length > 0 ? errors : undefined,
  })
})
