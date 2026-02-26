import { Hono } from "hono"
import { logger } from "hono/logger"
import { cors } from "hono/cors"
import { auth } from "./auth.ts"
import { gamesRouter } from "./routes/games.ts"
import { movesRouter } from "./routes/moves.ts"
import { cardsRouter } from "./routes/cards.ts"
import { decksRouter } from "./routes/decks.ts"
import { startDeadlineChecker } from "./deadline.ts"

const app = new Hono()

// ─── Global middleware ────────────────────────────────────────────────────────

app.use(logger())
app.use(cors())

// ─── Public routes ────────────────────────────────────────────────────────────

app.get("/health", (c) => c.json({ ok: true }))
app.route("/cards", cardsRouter)
app.route("/decks", decksRouter)

// ─── Authenticated routes ─────────────────────────────────────────────────────

app.use("/games/*", auth)
app.route("/games",  gamesRouter)
app.route("/games",  movesRouter)

// ─── Export app for tests ─────────────────────────────────────────────────────

export { app }

// ─── Start ────────────────────────────────────────────────────────────────────

const port = Number(process.env["PORT"] ?? 3001)
console.log(`API listening on http://localhost:${port}`)
startDeadlineChecker()

export default {
  port,
  fetch: app.fetch,
}
