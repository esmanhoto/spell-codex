/**
 * Tests for CORS middleware behavior.
 */

import { describe, it, expect } from "bun:test"
import { app } from "../src/index.ts"

process.env["AUTH_BYPASS"] = "true"

describe("CORS headers", () => {
  it("includes Access-Control-Allow-Origin on regular GET", async () => {
    const res = await app.request("/health", {
      headers: { Origin: "http://localhost:5173" },
    })
    expect(res.status).toBe(200)
    const acao = res.headers.get("Access-Control-Allow-Origin")
    expect(acao).toBeDefined()
    // Hono cors() defaults to "*"
    expect(acao).toBe("*")
  })

  it("responds to OPTIONS preflight with CORS headers", async () => {
    const res = await app.request("/health", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, Authorization",
      },
    })
    // Preflight should return 204 or 200
    expect([200, 204]).toContain(res.status)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeDefined()
    expect(res.headers.get("Access-Control-Allow-Methods")).toBeDefined()
  })

  it("includes CORS headers on authenticated routes", async () => {
    const res = await app.request("/games", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "X-User-Id": "test-user",
      },
    })
    // Request will fail validation (400) but CORS headers should still be present
    const acao = res.headers.get("Access-Control-Allow-Origin")
    expect(acao).toBe("*")
  })

  it("includes CORS headers on public routes", async () => {
    const res = await app.request("/cards/cardback.jpg", {
      headers: { Origin: "http://example.com" },
    })
    // May 404 if file doesn't exist, but CORS headers should be present
    const acao = res.headers.get("Access-Control-Allow-Origin")
    expect(acao).toBe("*")
  })
})
