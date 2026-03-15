import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { createDevGame, getGame, getGameBySlug, reconstructState, lastSequence, saveAction, hashState } from "@spell/db"
import { applyMove } from "@spell/engine"
import type { GameState } from "@spell/engine"
import { authBypassEnabled } from "../auth-verify.ts"
import { DEV_SCENARIOS } from "../dev/scenarios.ts"
import { buildScenarioState, DEV_P1_ID, DEV_P2_ID } from "../dev/build-state.ts"
import { lookupCard, searchCards } from "../dev/card-lookup.ts"
import { setCachedState, getGameCache } from "../state-cache.ts"

export const devRouter = new Hono()

// Guard: dev endpoints are only available when AUTH_BYPASS is enabled.
// In production (real Supabase auth), this entire router returns 404.
devRouter.use("*", async (c, next) => {
  if (!authBypassEnabled()) return c.json({ error: "Not found" }, 404)
  return next()
})

// ─── GET /dev/scenarios ───────────────────────────────────────────────────────

devRouter.get("/scenarios", (c) => {
  const list = Object.entries(DEV_SCENARIOS).map(([id, def]) => ({
    id,
    name: def.name,
    description: def.description,
  }))
  return c.json({ scenarios: list })
})

// ─── POST /dev/scenarios/:id/load ────────────────────────────────────────────

devRouter.post("/scenarios/:id/load", async (c) => {
  const scenarioId = c.req.param("id")
  const scenario = DEV_SCENARIOS[scenarioId]
  if (!scenario) return c.json({ error: "Scenario not found" }, 404)

  let state
  try {
    state = buildScenarioState(scenario)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: `Failed to build scenario state: ${message}` }, 500)
  }

  const game = await createDevGame({
    stateSnapshot: state,
    p1UserId: DEV_P1_ID,
    p2UserId: DEV_P2_ID,
  })

  return c.json({
    gameId: game.id,
    slug: game.slug,
    p1UserId: DEV_P1_ID,
    p2UserId: DEV_P2_ID,
  })
})

// ─── GET /dev/cards ────────────────────────────────────────────────────────────
// Query params: q (name substring), types (comma-separated typeIds)

devRouter.get("/cards", (c) => {
  const q = c.req.query("q") ?? ""
  const typesParam = c.req.query("types")
  const typeIds = typesParam ? typesParam.split(",").map(Number).filter(Number.isFinite) : null
  // Require at least 2 chars to avoid returning all 6000+ cards
  if (!q && !typeIds) return c.json({ cards: [] })
  const cards = searchCards(q, typeIds)
  return c.json({ cards })
})

// ─── POST /dev/games/:id/give-card ────────────────────────────────────────────

const GiveCardSchema = z.object({
  playerId: z.string(),
  setId: z.string(),
  cardNumber: z.number().int(),
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

devRouter.post("/games/:id/give-card", zValidator("json", GiveCardSchema), async (c) => {
  const idOrSlug = c.req.param("id")
  const { playerId, setId, cardNumber } = c.req.valid("json")

  let card
  try {
    card = lookupCard(setId, cardNumber)
  } catch {
    return c.json({ error: `Card not found: ${setId} #${cardNumber}` }, 404)
  }

  // Resolve game by UUID or slug
  const game = await (UUID_RE.test(idOrSlug) ? getGame(idOrSlug) : getGameBySlug(idOrSlug))
  if (!game) return c.json({ error: "Game not found" }, 404)
  const gameId = game.id

  // Reconstruct state from cache or DB
  const hit = getGameCache(gameId)
  let state: GameState
  let seq0: number

  if (hit) {
    state = hit.state
    seq0 = hit.sequence
  } else {
    seq0 = await lastSequence(gameId)
    const { state: reconstructed } = await reconstructState(gameId, game.seed, (game.stateSnapshot as GameState | null) ?? null)
    state = reconstructed
  }

  const instanceId = `dev-give-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const move = { type: "DEV_GIVE_CARD" as const, playerId, instanceId, card }

  let result
  try {
    result = applyMove(state, playerId, move)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Apply failed"
    return c.json({ error: msg }, 422)
  }

  const stateHash = hashState(result.newState)
  const action = await saveAction({ gameId, sequence: seq0 + 1, playerId, move, stateHash })
  setCachedState(gameId, result.newState, action.sequence)

  return c.json({ ok: true })
})
