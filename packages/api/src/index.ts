import { Hono } from "hono"
import { logger } from "hono/logger"
import { cors } from "hono/cors"
import { auth } from "./auth.ts"
import { gamesRouter } from "./routes/games.ts"
import { movesRouter } from "./routes/moves.ts"
import { cardsRouter } from "./routes/cards.ts"
import { decksRouter } from "./routes/decks.ts"
import { wsHandlers } from "./ws.ts"

const app = new Hono()

// ─── Global middleware ────────────────────────────────────────────────────────

app.use(logger())
app.use(cors())

app.onError((err, c) => {
  const message = err instanceof Error ? err.message : String(err)
  const code =
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code?: unknown }).code === "string"
      ? (err as { code: string }).code
      : undefined

  if (code === "ECONNREFUSED" || message.includes("ECONNREFUSED")) {
    return c.json(
      {
        error: "Database unavailable. Verify DATABASE_URL and DB availability.",
      },
      503,
    )
  }

  console.error(err)
  return c.json({ error: "Internal server error" }, 500)
})

// ─── Public routes ────────────────────────────────────────────────────────────

app.get("/health", (c) => c.json({ ok: true }))
app.route("/cards", cardsRouter)
app.route("/decks", decksRouter)

// ─── WebSocket upgrade (handled in Bun.serve fetch, not Hono) ────────────────
// The /ws path is intercepted before Hono in the default export below.

// ─── Authenticated routes ─────────────────────────────────────────────────────

app.use("/games/*", auth)
app.route("/games", gamesRouter)
app.route("/games", movesRouter)

// ─── Export app for tests ─────────────────────────────────────────────────────

export { app }

// ─── Start ────────────────────────────────────────────────────────────────────

const port = Number(process.env["PORT"] ?? 3001)
console.log(`API listening on http://localhost:${port}`)

export default {
  port,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetch(req: Request, server: any) {
    // Intercept WebSocket upgrade requests before passing to Hono
    const url = new URL(req.url)
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req)
      if (upgraded) return undefined as unknown as Response
      return new Response("WebSocket upgrade required", { status: 426 })
    }
    return app.fetch(req)
  },
  websocket: wsHandlers,
}
