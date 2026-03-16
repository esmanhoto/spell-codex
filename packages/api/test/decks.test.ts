import { describe, it, expect } from "bun:test"
import { app } from "../src/index.ts"

describe("GET /decks/cards/:setId", () => {
  it("returns all cards for a valid set", async () => {
    const res = await app.request("/decks/cards/1st")
    expect(res.status).toBe(200)

    const body = (await res.json()) as {
      setId: string
      cards: Array<{ cardNumber: number; typeId: number; name: string }>
    }
    expect(body.setId).toBe("1st")
    expect(Array.isArray(body.cards)).toBe(true)
    expect(body.cards.length).toBeGreaterThan(100)

    // Every card should have required fields
    for (const card of body.cards.slice(0, 10)) {
      expect(typeof card.cardNumber).toBe("number")
      expect(typeof card.typeId).toBe("number")
      expect(typeof card.name).toBe("string")
    }
  })

  it("returns 404 for an unknown set", async () => {
    const res = await app.request("/decks/cards/nonexistent_set_xyz")
    expect(res.status).toBe(404)
  })
})

describe("GET /decks", () => {
  it("returns only playable 55-card deck names", async () => {
    const res = await app.request("/decks")
    expect(res.status).toBe(200)

    const body = (await res.json()) as { decks: string[] }
    expect(Array.isArray(body.decks)).toBe(true)
    expect(body.decks.length).toBeGreaterThan(0)

    // Known playable starter deck should be present.
    expect(body.decks).toContain("1st_edition_starter_deck_a-1")
    // Known non-playable deck should be filtered out.
    expect(body.decks).not.toContain("battle_mages")
  })
})

describe("GET /decks/:name", () => {
  it("returns hydrated 55 cards for a playable deck", async () => {
    const res = await app.request("/decks/1st_edition_starter_deck_a-1")
    expect(res.status).toBe(200)

    const body = (await res.json()) as { name: string; cards: unknown[] }
    expect(body.name).toBe("1st_edition_starter_deck_a-1")
    expect(Array.isArray(body.cards)).toBe(true)
    expect(body.cards).toHaveLength(55)
  })

  it("returns 422 for deck that is not playable in current format", async () => {
    const res = await app.request("/decks/battle_mages")
    expect(res.status).toBe(422)

    const body = (await res.json()) as {
      error: string
      requested: string
      refCount: number
      hydratedCount: number
    }
    expect(body.requested).toBe("battle_mages")
    expect(body.refCount).toBeGreaterThan(0)
    expect(body.hydratedCount).toBeLessThan(body.refCount)
  })
})
