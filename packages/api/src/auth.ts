import type { Context, Next } from "hono"
import { createMiddleware } from "hono/factory"
import { authBypassEnabled, verifySupabaseAccessToken } from "./auth-verify.ts"

/**
 * Auth middleware.
 *
 * Default mode:
 * - Requires `Authorization: Bearer <access_token>` (Supabase JWT)
 * - Verifies token with Supabase Auth API and derives userId
 *
 * Dev/test bypass (`AUTH_BYPASS=true`):
 * - Accepts `X-User-Id` when Authorization header is not present
 *
 * Usage:
 *   app.use(auth)
 *   const userId = c.get("userId")  // string, guaranteed present
 */
export const auth = createMiddleware<{ Variables: { userId: string } }>(
  async (c: Context, next: Next) => {
    const authHeader = c.req.header("Authorization")
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice("Bearer ".length).trim()
      if (!token) return c.json({ error: "Missing bearer token" }, 401)
      try {
        const userId = await verifySupabaseAccessToken(token)
        c.set("userId", userId)
        await next()
        return
      } catch {
        return c.json({ error: "Invalid bearer token" }, 401)
      }
    }

    if (authBypassEnabled()) {
      const userId = c.req.header("X-User-Id")
      if (!userId) return c.json({ error: "Missing X-User-Id header (AUTH_BYPASS=true)" }, 401)
      c.set("userId", userId)
      await next()
      return
    }

    return c.json({ error: "Missing Authorization bearer token" }, 401)
  },
)
