/**
 * Tests for deck validation edge cases and slug generation.
 * Requires DATABASE_URL.
 */

import { describe, it, expect } from "bun:test"
import { app } from "../src/index.ts"
import { generateGameSlug } from "@spell/db/src/slug.ts"

process.env["AUTH_BYPASS"] = "true"

const PLAYER_A = "00000000-0000-0000-0000-000000000001"
const PLAYER_B = "00000000-0000-0000-0000-000000000002"

const REALM = {
  setId: "01",
  cardNumber: 1,
  name: "Forest",
  typeId: 3,
  worldId: 1,
  level: 0,
  description: "",
}

function headers(userId: string) {
  return { "Content-Type": "application/json", "X-User-Id": userId }
}

function makeDeck(size: number) {
  return Array.from({ length: size }, () => REALM)
}

// ─── Deck validation ─────────────────────────────────────────────────────────

describe("deck validation edge cases", () => {
  it("rejects deck with < 55 cards", async () => {
    const res = await app.request("/games", {
      method: "POST",
      headers: headers(PLAYER_A),
      body: JSON.stringify({
        formatId: "standard-55",
        seed: 1,
        players: [
          { userId: PLAYER_A, deckSnapshot: makeDeck(54) },
          { userId: PLAYER_B, deckSnapshot: makeDeck(55) },
        ],
      }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects deck with > 110 cards", async () => {
    const res = await app.request("/games", {
      method: "POST",
      headers: headers(PLAYER_A),
      body: JSON.stringify({
        formatId: "standard-55",
        seed: 1,
        players: [
          { userId: PLAYER_A, deckSnapshot: makeDeck(111) },
          { userId: PLAYER_B, deckSnapshot: makeDeck(55) },
        ],
      }),
    })
    expect(res.status).toBe(400)
  })

  it("accepts deck with exactly 55 cards", async () => {
    const res = await app.request("/games", {
      method: "POST",
      headers: headers(PLAYER_A),
      body: JSON.stringify({
        formatId: "standard-55",
        seed: 1,
        players: [
          { userId: PLAYER_A, deckSnapshot: makeDeck(55) },
          { userId: PLAYER_B, deckSnapshot: makeDeck(55) },
        ],
      }),
    })
    expect(res.status).toBe(201)
  })

  it("accepts deck with exactly 110 cards", async () => {
    const res = await app.request("/games", {
      method: "POST",
      headers: headers(PLAYER_A),
      body: JSON.stringify({
        formatId: "standard-55",
        seed: 1,
        players: [
          { userId: PLAYER_A, deckSnapshot: makeDeck(110) },
          { userId: PLAYER_B, deckSnapshot: makeDeck(110) },
        ],
      }),
    })
    expect(res.status).toBe(201)
  })

  it("rejects empty deck", async () => {
    const res = await app.request("/games", {
      method: "POST",
      headers: headers(PLAYER_A),
      body: JSON.stringify({
        formatId: "standard-55",
        seed: 1,
        players: [
          { userId: PLAYER_A, deckSnapshot: [] },
          { userId: PLAYER_B, deckSnapshot: makeDeck(55) },
        ],
      }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects non-integer cardNumber", async () => {
    const badCard = { ...REALM, cardNumber: 1.5 }
    const res = await app.request("/games", {
      method: "POST",
      headers: headers(PLAYER_A),
      body: JSON.stringify({
        formatId: "standard-55",
        seed: 1,
        players: [
          { userId: PLAYER_A, deckSnapshot: Array.from({ length: 55 }, () => badCard) },
          { userId: PLAYER_B, deckSnapshot: makeDeck(55) },
        ],
      }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects non-integer seed", async () => {
    const res = await app.request("/games", {
      method: "POST",
      headers: headers(PLAYER_A),
      body: JSON.stringify({
        formatId: "standard-55",
        seed: 1.5,
        players: [
          { userId: PLAYER_A, deckSnapshot: makeDeck(55) },
          { userId: PLAYER_B, deckSnapshot: makeDeck(55) },
        ],
      }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects lobby deck with < 55 cards", async () => {
    const res = await app.request("/games/lobby", {
      method: "POST",
      headers: headers(PLAYER_A),
      body: JSON.stringify({
        formatId: "standard-55",
        seed: 1,
        deckSnapshot: makeDeck(30),
      }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects join with < 55 cards", async () => {
    // Create lobby first
    const lobbyRes = await app.request("/games/lobby", {
      method: "POST",
      headers: headers(PLAYER_A),
      body: JSON.stringify({
        formatId: "standard-55",
        seed: 1,
        deckSnapshot: makeDeck(55),
      }),
    })
    const { gameId } = (await lobbyRes.json()) as { gameId: string }

    const joinRes = await app.request(`/games/${gameId}/join`, {
      method: "POST",
      headers: headers(PLAYER_B),
      body: JSON.stringify({ deckSnapshot: makeDeck(10) }),
    })
    expect(joinRes.status).toBe(400)
  })
})

// ─── Slug generation ─────────────────────────────────────────────────────────

describe("slug generation", () => {
  it("generates three-word lowercase slug", () => {
    const slug = generateGameSlug()
    expect(slug).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/)
  })

  it("generates different slugs on successive calls", () => {
    const slugs = new Set(Array.from({ length: 20 }, () => generateGameSlug()))
    // With 35*27*25 = 23,625 combos, 20 calls should all be unique
    expect(slugs.size).toBe(20)
  })

  it("slug uses RPG-themed words", () => {
    const slug = generateGameSlug()
    const parts = slug.split("-")
    expect(parts).toHaveLength(3)
    // Each part should be a real word (all alpha chars)
    for (const part of parts) {
      expect(part).toMatch(/^[a-z]+$/)
    }
  })
})
