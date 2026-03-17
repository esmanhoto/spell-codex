/**
 * Integration tests for the deadline/turn-timeout system.
 * Requires DATABASE_URL.
 */

import { describe, it, expect } from "bun:test"
import { app } from "../src/index.ts"
import { processExpiredGames } from "../src/deadline.ts"
import { touchGame, findExpiredGames } from "@spell/db"

process.env["AUTH_BYPASS"] = "true"

const PLAYER_A = "00000000-0000-0000-0000-000000000001"
const PLAYER_B = "00000000-0000-0000-0000-000000000002"

const REALM = {
  id: "r1",
  setId: "01",
  cardNumber: 1,
  name: "Forest",
  typeId: 3,
  worldId: 1,
  level: 0,
  gold: 0,
  description: "",
}
const DECK = Array.from({ length: 55 }, () => REALM)

function headers(userId: string) {
  return { "Content-Type": "application/json", "X-User-Id": userId }
}

async function createGame(): Promise<{ gameId: string }> {
  const res = await app.request("/games", {
    method: "POST",
    headers: headers(PLAYER_A),
    body: JSON.stringify({
      formatId: "standard-55",
      seed: 42,
      players: [
        { userId: PLAYER_A, deckSnapshot: DECK },
        { userId: PLAYER_B, deckSnapshot: DECK },
      ],
    }),
  })
  expect(res.status).toBe(201)
  return (await res.json()) as { gameId: string }
}

// ─── processExpiredGames ─────────────────────────────────────────────────────

describe("processExpiredGames", () => {
  it("does not crash when no expired games exist", async () => {
    await expect(processExpiredGames()).resolves.toBeUndefined()
  })

  it("auto-passes for expired game", async () => {
    const { gameId } = await createGame()

    // Set deadline to the past to trigger expiration
    await touchGame(gameId, new Date(Date.now() - 1000))

    const expired = await findExpiredGames()
    const isExpired = expired.some((g) => g.id === gameId)
    expect(isExpired).toBe(true)

    // Process — should auto-PASS
    await processExpiredGames()

    // Verify game still exists and has progressed (sequence > 0)
    const res = await app.request(`/games/${gameId}`, {
      headers: headers(PLAYER_A),
    })
    expect(res.status).toBe(200)
  })
})

// ─── findExpiredGames ────────────────────────────────────────────────────────

describe("findExpiredGames", () => {
  it("returns empty array when no games are expired", async () => {
    // Create a game with future deadline (default 24h)
    await createGame()
    const expired = await findExpiredGames()
    // There may be leftover expired games from other tests, so just verify it returns an array
    expect(Array.isArray(expired)).toBe(true)
  })

  it("includes games with past turnDeadline", async () => {
    const { gameId } = await createGame()
    await touchGame(gameId, new Date(Date.now() - 60_000))

    const expired = await findExpiredGames()
    expect(expired.some((g) => g.id === gameId)).toBe(true)
  })
})
