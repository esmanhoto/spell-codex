import { createMiddleware } from "hono/factory"
import type { AppVariables } from "./auth.ts"
import { authBypassEnabled } from "./auth-verify.ts"

/**
 * Simple in-memory sliding-window rate limiter.
 * Keyed by authenticated userId (post-auth) or x-forwarded-for / IP.
 */

interface WindowEntry {
  timestamps: number[]
}

const store = new Map<string, WindowEntry>()

// Periodic cleanup of expired entries (every 60s)
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((ts) => now - ts < 60_000)
    if (entry.timestamps.length === 0) store.delete(key)
  }
}, 60_000).unref()

export function rateLimiter(opts: { windowMs: number; limit: number }) {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    // Skip rate limiting in dev/test mode
    if (authBypassEnabled()) return next()

    const key = c.get("userId") ?? c.req.header("x-forwarded-for") ?? "unknown"
    const now = Date.now()

    let entry = store.get(key)
    if (!entry) {
      entry = { timestamps: [] }
      store.set(key, entry)
    }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter((ts) => now - ts < opts.windowMs)

    if (entry.timestamps.length >= opts.limit) {
      c.header("Retry-After", String(Math.ceil(opts.windowMs / 1000)))
      return c.json({ error: "Too many requests" }, 429)
    }

    entry.timestamps.push(now)
    await next()
  })
}
