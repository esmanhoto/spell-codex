/**
 * Tests for the production request routing added in the Koyeb deploy plan:
 *   /api/*  → strip /api prefix → Hono handlers
 *   /ws     → WebSocket upgrade (426 if not an upgrade request)
 *   /*      → serve packages/web/dist/ with SPA fallback to index.html
 *
 * Requires WEB_DIST_PATH to be read inside the fetch handler (not at module level)
 * so that process.env["WEB_DIST_PATH"] set in beforeAll is picked up at call time.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import serverConfig from "../src/index.ts"

const mockServer = { upgrade: () => false }

// ─── /api/* prefix stripping ──────────────────────────────────────────────────

describe("/api prefix routing", () => {
  it("GET /api/health strips prefix and returns ok", async () => {
    const res = await serverConfig.fetch(new Request("http://localhost/api/health"), mockServer)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })

  it("GET /api/ (trailing slash only) routes to Hono root without 5xx", async () => {
    const res = await serverConfig.fetch(new Request("http://localhost/api/"), mockServer)
    expect(res.status).toBeLessThan(500)
  })

  it("GET /api/unknown returns 404 from Hono (not a routing crash)", async () => {
    const res = await serverConfig.fetch(
      new Request("http://localhost/api/nonexistent-xyz"),
      mockServer,
    )
    expect(res.status).toBe(404)
  })
})

// ─── /ws without upgrade ─────────────────────────────────────────────────────

describe("/ws routing", () => {
  it("GET /ws without WebSocket upgrade returns 426", async () => {
    const res = await serverConfig.fetch(new Request("http://localhost/ws"), mockServer)
    expect(res.status).toBe(426)
  })
})

// ─── Static file serving / SPA fallback ──────────────────────────────────────

describe("static file serving", () => {
  let distDir: string

  beforeAll(() => {
    distDir = mkdtempSync(join(tmpdir(), "spell-dist-"))
    writeFileSync(join(distDir, "index.html"), "<html><body>SPA</body></html>")
    mkdirSync(join(distDir, "assets"))
    writeFileSync(join(distDir, "assets", "app.js"), "console.log('app')")
    process.env["WEB_DIST_PATH"] = distDir
  })

  afterAll(() => {
    rmSync(distDir, { recursive: true })
    delete process.env["WEB_DIST_PATH"]
  })

  it("serves an existing static asset", async () => {
    const res = await serverConfig.fetch(new Request("http://localhost/assets/app.js"), mockServer)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain("console.log")
  })

  it("falls back to index.html for unknown SPA routes", async () => {
    const res = await serverConfig.fetch(
      new Request("http://localhost/game/some-game-id"),
      mockServer,
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toContain("SPA")
  })

  it("serves index.html for root path /", async () => {
    const res = await serverConfig.fetch(new Request("http://localhost/"), mockServer)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain("SPA")
  })

  it("/api/* is not intercepted by static serving", async () => {
    // Even with WEB_DIST_PATH set, /api/* must still route to Hono
    const res = await serverConfig.fetch(new Request("http://localhost/api/health"), mockServer)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })
})
