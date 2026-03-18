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
    expect(acao).toBe("http://localhost:5173")
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
    expect(res.status).toBe(204)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173")
    expect(res.headers.get("Access-Control-Allow-Methods")).toBeString()
  })

  it("includes CORS headers on authenticated routes", async () => {
    const res = await app.request("/games", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "X-User-Id": "00000000-0000-0000-0000-000000000001",
      },
    })
    // Request will fail validation (400) but CORS headers should still be present
    const acao = res.headers.get("Access-Control-Allow-Origin")
    expect(acao).toBe("http://localhost:5173")
  })

  it("rejects CORS from disallowed origins", async () => {
    const res = await app.request("/health", {
      headers: { Origin: "http://evil.com" },
    })
    expect(res.status).toBe(200)
    const acao = res.headers.get("Access-Control-Allow-Origin")
    expect(acao).toBeNull()
  })
})
