/**
 * Tests for dev-only endpoints (gated by AUTH_BYPASS=true).
 * Requires DATABASE_URL.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { app } from "../src/index.ts"

const savedBypass = process.env["AUTH_BYPASS"]

// ─── With AUTH_BYPASS enabled ────────────────────────────────────────────────

describe("dev routes (AUTH_BYPASS=true)", () => {
  beforeAll(() => {
    process.env["AUTH_BYPASS"] = "true"
  })

  afterAll(() => {
    process.env["AUTH_BYPASS"] = savedBypass
  })

  // ─── GET /dev/scenarios ──────────────────────────────────────────────────

  describe("GET /dev/scenarios", () => {
    it("returns list of available scenarios", async () => {
      const res = await app.request("/dev/scenarios")
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        scenarios: Array<{ id: string; name: string; description: string }>
      }
      expect(Array.isArray(body.scenarios)).toBe(true)
      for (const s of body.scenarios) {
        expect(typeof s.id).toBe("string")
        expect(typeof s.name).toBe("string")
        expect(typeof s.description).toBe("string")
      }
    })
  })

  // ─── POST /dev/scenarios/:id/load ────────────────────────────────────────

  describe("POST /dev/scenarios/:id/load", () => {
    it("returns 404 for nonexistent scenario", async () => {
      const res = await app.request("/dev/scenarios/nonexistent/load", { method: "POST" })
      expect(res.status).toBe(404)
    })

    it("loads a valid scenario and returns gameId + slug", async () => {
      // Get first available scenario
      const listRes = await app.request("/dev/scenarios")
      const { scenarios } = (await listRes.json()) as { scenarios: Array<{ id: string }> }
      if (scenarios.length === 0) return // skip if no scenarios defined

      const scenarioId = scenarios[0]!.id
      const res = await app.request(`/dev/scenarios/${scenarioId}/load`, { method: "POST" })
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        gameId: string
        slug: string
        p1UserId: string
        p2UserId: string
      }
      expect(body.gameId).toBeString()
      expect(body.slug).toBeString()
      expect(body.p1UserId).toBeString()
      expect(body.p2UserId).toBeString()
    })
  })

  // ─── GET /dev/cards ──────────────────────────────────────────────────────

  describe("GET /dev/cards", () => {
    it("returns empty array when no query or types provided", async () => {
      const res = await app.request("/dev/cards")
      expect(res.status).toBe(200)
      const body = (await res.json()) as { cards: unknown[] }
      expect(body.cards).toEqual([])
    })

    it("searches cards by name substring", async () => {
      const res = await app.request("/dev/cards?q=dragon")
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        cards: Array<{ name: string; setId: string; cardNumber: number }>
      }
      expect(body.cards.length).toBeGreaterThan(0)
      for (const card of body.cards) {
        expect(card.name.toLowerCase()).toContain("dragon")
      }
    })

    it("filters cards by typeId", async () => {
      // typeId 3 = realm; combine with name to ensure results
      const res = await app.request("/dev/cards?q=realm&types=3")
      expect(res.status).toBe(200)
      const body = (await res.json()) as { cards: Array<{ typeId: number }> }
      // All returned cards must match the type filter
      for (const card of body.cards) {
        expect(card.typeId).toBe(3)
      }
    })

    it("combines name and type filters", async () => {
      const res = await app.request("/dev/cards?q=forest&types=3")
      expect(res.status).toBe(200)
      const body = (await res.json()) as { cards: Array<{ name: string; typeId: number }> }
      for (const card of body.cards) {
        expect(card.name.toLowerCase()).toContain("forest")
        expect(card.typeId).toBe(3)
      }
    })
  })

  // ─── POST /dev/games/:id/give-card ───────────────────────────────────────

  describe("POST /dev/games/:id/give-card", () => {
    it("returns 404 for nonexistent game", async () => {
      const res = await app.request("/dev/games/00000000-0000-0000-0000-000000000000/give-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: "p1", setId: "01", cardNumber: 1 }),
      })
      expect(res.status).toBe(404)
    })

    it("returns 404 for nonexistent card", async () => {
      // Create a dev game first
      const listRes = await app.request("/dev/scenarios")
      const { scenarios } = (await listRes.json()) as { scenarios: Array<{ id: string }> }
      if (scenarios.length === 0) return

      const loadRes = await app.request(`/dev/scenarios/${scenarios[0]!.id}/load`, {
        method: "POST",
      })
      const { gameId, p1UserId } = (await loadRes.json()) as { gameId: string; p1UserId: string }

      const res = await app.request(`/dev/games/${gameId}/give-card`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: p1UserId, setId: "99", cardNumber: 9999 }),
      })
      expect(res.status).toBe(404)
    })

    it("gives a valid card to a player in a dev game", async () => {
      const listRes = await app.request("/dev/scenarios")
      const { scenarios } = (await listRes.json()) as { scenarios: Array<{ id: string }> }
      if (scenarios.length === 0) return

      const loadRes = await app.request(`/dev/scenarios/${scenarios[0]!.id}/load`, {
        method: "POST",
      })
      const { gameId, p1UserId } = (await loadRes.json()) as { gameId: string; p1UserId: string }

      const res = await app.request(`/dev/games/${gameId}/give-card`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: p1UserId, setId: "1st", cardNumber: 1 }),
      })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
    })

    it("rejects non-integer cardNumber", async () => {
      const res = await app.request("/dev/games/some-id/give-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: "p1", setId: "01", cardNumber: 1.5 }),
      })
      expect(res.status).toBe(400)
    })
  })
})

// ─── With AUTH_BYPASS disabled ───────────────────────────────────────────────

describe("dev routes (AUTH_BYPASS=false)", () => {
  beforeAll(() => {
    process.env["AUTH_BYPASS"] = "false"
  })

  afterAll(() => {
    process.env["AUTH_BYPASS"] = savedBypass
  })

  it("all dev endpoints return 404", async () => {
    const endpoints: Array<{ path: string; method?: string; body?: string }> = [
      { path: "/dev/scenarios" },
      { path: "/dev/cards?q=dragon" },
      { path: "/dev/scenarios/some-id/load", method: "POST" },
      {
        path: "/dev/games/some-id/give-card",
        method: "POST",
        body: JSON.stringify({ playerId: "p1", setId: "01", cardNumber: 1 }),
      },
    ]

    for (const { path, method, body } of endpoints) {
      const res = await app.request(path, {
        method: method ?? "GET",
        ...(body ? { headers: { "Content-Type": "application/json" }, body } : {}),
      })
      expect(res.status).toBe(404)
    }
  })
})
