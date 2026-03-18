import type { Context, Next } from "hono"
import { createMiddleware } from "hono/factory"
import { authBypassEnabled, verifySupabaseAccessTokenFull } from "./auth-verify.ts"

export type AppVariables = { userId: string; email: string | null }

/**
 * Auth middleware.
 *
 * Default mode:
 * - Requires `Authorization: Bearer <access_token>` (Supabase JWT)
 * - Verifies token with Supabase Auth API and derives userId + email
 *
 * Dev/test bypass (`AUTH_BYPASS=true`):
 * - Accepts `X-User-Id` when Authorization header is not present
 *
 * Usage:
 *   app.use(auth)
 *   const userId = c.get("userId")  // string, guaranteed present
 *   const email = c.get("email")    // string | null
 */
export const auth = createMiddleware<{ Variables: AppVariables }>(
  async (c: Context, next: Next) => {
    const authHeader = c.req.header("Authorization")
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice("Bearer ".length).trim()
      if (!token) return c.json({ error: "Missing bearer token" }, 401)
      try {
        const { id: userId, email } = await verifySupabaseAccessTokenFull(token)
        c.set("userId", userId)
        c.set("email", email)
        await next()
        return
      } catch {
        return c.json({ error: "Invalid bearer token" }, 401)
      }
    }

    if (authBypassEnabled()) {
      const userId = c.req.header("X-User-Id")
      if (!userId) return c.json({ error: "Missing X-User-Id header (AUTH_BYPASS=true)" }, 401)
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
        return c.json({ error: "Invalid user ID format" }, 400)
      }
      c.set("userId", userId)
      c.set("email", null)
      await next()
      return
    }

    return c.json({ error: "Missing Authorization bearer token" }, 401)
  },
)
