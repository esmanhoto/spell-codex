import { Hono } from "hono"
import { createDevGame } from "@spell/db"
import { authBypassEnabled } from "../auth-verify.ts"
import { DEV_SCENARIOS } from "../dev/scenarios.ts"
import { buildScenarioState, DEV_P1_ID, DEV_P2_ID } from "../dev/build-state.ts"

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
