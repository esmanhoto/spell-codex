/**
 * Tests that Bearer token takes precedence over X-User-Id header,
 * and that both auth paths resolve to the correct identity.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { Hono } from "hono"
import { auth } from "../src/auth.ts"

const PLAYER_A = "00000000-0000-0000-0000-000000000001"
const PLAYER_B = "00000000-0000-0000-0000-000000000002"

const testApp = new Hono<{ Variables: { userId: string } }>()
testApp.use("/*", auth)
testApp.get("/whoami", (c) => c.json({ userId: c.get("userId") }))

const realFetch = globalThis.fetch

beforeAll(() => {
  process.env["AUTH_BYPASS"] = "true"
  process.env["SUPABASE_URL"] = "http://supabase.mock"
  process.env["SUPABASE_ANON_KEY"] = "test-key"

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    if (url === "http://supabase.mock/auth/v1/user") {
      const authHeader = new Headers(init?.headers).get("Authorization")
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : ""
      if (token === "token-player-a") {
        return new Response(JSON.stringify({ id: PLAYER_A }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      return new Response(JSON.stringify({ message: "Invalid JWT" }), { status: 401 })
    }
    return realFetch(input)
  }) as typeof fetch
})

afterAll(() => {
  globalThis.fetch = realFetch
})

describe("auth header precedence", () => {
  it("Bearer token takes precedence over X-User-Id", async () => {
    // Bearer maps to PLAYER_A, X-User-Id says PLAYER_B
    const res = await testApp.request("/whoami", {
      headers: {
        Authorization: "Bearer token-player-a",
        "X-User-Id": PLAYER_B,
      },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { userId: string }
    // Should use Bearer identity (PLAYER_A), not X-User-Id (PLAYER_B)
    expect(body.userId).toBe(PLAYER_A)
  })

  it("falls back to X-User-Id when no Bearer present (bypass enabled)", async () => {
    const res = await testApp.request("/whoami", {
      headers: { "X-User-Id": PLAYER_B },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { userId: string }
    expect(body.userId).toBe(PLAYER_B)
  })

  it("rejects when invalid Bearer is present (even with valid X-User-Id)", async () => {
    const res = await testApp.request("/whoami", {
      headers: {
        Authorization: "Bearer bad-token",
        "X-User-Id": PLAYER_B,
      },
    })
    // Invalid Bearer should fail — not fall through to X-User-Id
    expect(res.status).toBe(401)
  })
})
