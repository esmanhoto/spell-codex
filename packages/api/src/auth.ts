import type { Context, Next } from "hono"
import { createMiddleware } from "hono/factory"

/**
 * Auth middleware — Phase 4 placeholder.
 *
 * Reads the player identity from the `X-User-Id` request header.
 * In Phase 5 this will be replaced by Supabase JWT verification.
 *
 * Usage:
 *   app.use(auth)
 *   const userId = c.get("userId")  // string, guaranteed present
 */
export const auth = createMiddleware<{ Variables: { userId: string } }>(
  async (c: Context, next: Next) => {
    const userId = c.req.header("X-User-Id")
    if (!userId) {
      return c.json({ error: "Missing X-User-Id header" }, 401)
    }
    c.set("userId", userId)
    await next()
  }
)
