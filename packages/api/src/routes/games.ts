import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import {
  createGame,
  addGamePlayer,
  getGame,
  getGameBySlug,
  getGamePlayers,
  reconstructState,
  setGameStatus,
  getProfile,
} from "@spell/db"
import type { GameState } from "@spell/engine"
import type { CardData } from "@spell/engine"
import { serializeGameState } from "../serialize.ts"
import type { AppVariables } from "../auth.ts"
import { formatEmailAsName } from "../utils.ts"

async function resolveNickname(userId: string, email: string | null): Promise<string> {
  const profile = await getProfile(userId)
  if (profile?.nickname) return profile.nickname
  if (email) return formatEmailAsName(email)
  return ""
}

// ─── Validation schemas ───────────────────────────────────────────────────────

const CardDataSchema = z
  .object({
    setId: z.string(),
    cardNumber: z.number().int(),
    name: z.string(),
    typeId: z.number().int(),
    worldId: z.number().int(),
    isAvatar: z.boolean().default(false),
    level: z.union([z.number(), z.string(), z.null()]),
    description: z.string().default(""),
    attributes: z.array(z.string()).default([]),
    supportIds: z.array(z.union([z.number(), z.string()])).default([]),
    effects: z.array(z.unknown()).default([]),
  })
  .passthrough() as z.ZodType<CardData>

const PlayerInputSchema = z.object({
  userId: z.string().uuid(),
  deckSnapshot: z.array(CardDataSchema).min(55).max(110),
})

const CreateGameSchema = z.object({
  formatId: z.string(),
  seed: z.number().int(),
  players: z.tuple([PlayerInputSchema, PlayerInputSchema]),
})

const CreateLobbySchema = z.object({
  formatId: z.string(),
  seed: z.number().int(),
  deckSnapshot: z.array(CardDataSchema).min(55).max(110),
})

const JoinLobbySchema = z.object({
  deckSnapshot: z.array(CardDataSchema).min(55).max(110),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Resolves a game by UUID or slug. */
async function resolveGame(idOrSlug: string) {
  if (UUID_RE.test(idOrSlug)) return getGame(idOrSlug)
  return getGameBySlug(idOrSlug)
}

export const gamesRouter = new Hono<{ Variables: AppVariables }>()

// ─── POST /games ──────────────────────────────────────────────────────────────

gamesRouter.post("/", zValidator("json", CreateGameSchema), async (c) => {
  const userId = c.get("userId")
  const email = c.get("email")
  const body = c.req.valid("json")

  // Requester must be one of the two players
  const ids = body.players.map((p) => p.userId)
  if (!ids.includes(userId)) {
    return c.json({ error: "You must be one of the two players" }, 400)
  }

  const callerNickname = await resolveNickname(userId, email)
  const game = await createGame({
    formatId: body.formatId,
    seed: body.seed,
    players: body.players.map((p, i) => ({
      userId: p.userId,
      seatPosition: i,
      nickname: p.userId === userId ? callerNickname : "",
      deckSnapshot: p.deckSnapshot,
    })),
  })
  await setGameStatus(game.id, "active")

  return c.json({ gameId: game.id, slug: game.slug }, 201)
})

// ─── POST /games/lobby (create waiting room) ─────────────────────────────────

gamesRouter.post("/lobby", zValidator("json", CreateLobbySchema), async (c) => {
  const userId = c.get("userId")
  const email = c.get("email")
  const body = c.req.valid("json")

  const nickname = await resolveNickname(userId, email)
  const game = await createGame({
    formatId: body.formatId,
    seed: body.seed,
    players: [{ userId, seatPosition: 0, nickname, deckSnapshot: body.deckSnapshot }],
  })

  return c.json({ gameId: game.id, slug: game.slug, status: "waiting" as const }, 201)
})

// ─── GET /games/:id/lobby (waiting room status) ─────────────────────────────

gamesRouter.get("/:id/lobby", async (c) => {
  const idOrSlug = c.req.param("id")

  const game = await resolveGame(idOrSlug)
  if (!game) return c.json({ error: "Game not found" }, 404)

  const players = await getGamePlayers(game.id)
  return c.json({
    gameId: game.id,
    slug: game.slug,
    status: game.status,
    playerCount: players.length,
    isFull: players.length >= 2,
    players: players.map((p) => ({ userId: p.userId, nickname: p.nickname })),
  })
})

// ─── POST /games/:id/join (join waiting room by game ID) ────────────────────

gamesRouter.post("/:id/join", zValidator("json", JoinLobbySchema), async (c) => {
  const userId = c.get("userId")
  const email = c.get("email")
  const idOrSlug = c.req.param("id")
  const body = c.req.valid("json")

  const game = await resolveGame(idOrSlug)
  if (!game) return c.json({ error: "Game not found" }, 404)
  const gameId = game.id
  if (game.status === "finished" || game.status === "abandoned") {
    return c.json({ error: "Game is not joinable" }, 409)
  }

  const players = await getGamePlayers(gameId)
  if (players.some((p) => p.userId === userId)) {
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

  const nickname = await resolveNickname(userId, email)
  await addGamePlayer({
    gameId,
    userId,
    seatPosition: players.length,
    nickname,
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
  const idOrSlug = c.req.param("id")

  const game = await resolveGame(idOrSlug)
  if (!game) return c.json({ error: "Game not found" }, 404)
  const gameId = game.id

  const players = await getGamePlayers(gameId)
  if (!players.some((p) => p.userId === userId)) {
    return c.json({ error: "Forbidden" }, 403)
  }
  if (game.status === "waiting" && players.length < 2) {
    return c.json({ error: "Game is waiting for an opponent to join" }, 409)
  }

  const { state, errors } = await reconstructState(
    gameId,
    game.seed,
    (game.stateSnapshot as GameState | null) ?? null,
  )

  return c.json({
    ...serializeGameState(state, { status: game.status, turnDeadline: game.turnDeadline }, userId),
    players: players.map((p) => ({
      userId: p.userId,
      seatPosition: p.seatPosition,
      nickname: p.nickname,
    })),
    integrityErrors: errors.length > 0 ? errors : undefined,
  })
})
