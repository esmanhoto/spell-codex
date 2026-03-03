import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { Hono } from "hono"
import { auth } from "../src/auth.ts"

const PLAYER_A = "00000000-0000-0000-0000-000000000001"
const PLAYER_B = "00000000-0000-0000-0000-000000000002"
const OUTSIDER = "00000000-0000-0000-0000-000000000099"
const PARTICIPANTS = new Set([PLAYER_A, PLAYER_B])

const app = new Hono<{ Variables: { userId: string } }>()
app.use("/protected/*", auth)

app.post("/protected/resource", (c) => {
  const userId = c.get("userId")
  return c.json({ userId }, 201)
})

app.get("/protected/participant-only", (c) => {
  const userId = c.get("userId")
  if (!PARTICIPANTS.has(userId)) {
    return c.json({ error: "Forbidden" }, 403)
  }
  return c.json({ ok: true }, 200)
})

const realFetch = globalThis.fetch

beforeAll(() => {
  process.env["AUTH_BYPASS"] = "false"
  process.env["SUPABASE_URL"] = "http://supabase.mock"
  process.env["SUPABASE_ANON_KEY"] = "test-key"

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url

    if (url === "http://supabase.mock/auth/v1/user") {
      const authHeader = new Headers(init?.headers).get("Authorization")
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : ""

      if (token === "token-player-a") {
        return new Response(JSON.stringify({ id: PLAYER_A }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (token === "token-outsider") {
        return new Response(JSON.stringify({ id: OUTSIDER }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      return new Response(JSON.stringify({ message: "Invalid JWT" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }

    return realFetch(input, init)
  }) as typeof fetch
})

afterAll(() => {
  globalThis.fetch = realFetch
})

describe("auth middleware (bearer token, no bypass)", () => {
  it("accepts a valid bearer token on protected endpoint", async () => {
    const res = await app.request("/protected/resource", {
      method: "POST",
      headers: { Authorization: "Bearer token-player-a" },
    })

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ userId: PLAYER_A })
  })

  it("rejects an invalid bearer token", async () => {
    const res = await app.request("/protected/resource", {
      method: "POST",
      headers: { Authorization: "Bearer invalid-token" },
    })

    expect(res.status).toBe(401)
  })

  it("rejects missing bearer token", async () => {
    const res = await app.request("/protected/resource", { method: "POST" })
    expect(res.status).toBe(401)
  })

  it("returns 403 for non-participant with valid bearer token", async () => {
    const res = await app.request("/protected/participant-only", {
      headers: { Authorization: "Bearer token-outsider" },
    })

    expect(res.status).toBe(403)
  })
})
