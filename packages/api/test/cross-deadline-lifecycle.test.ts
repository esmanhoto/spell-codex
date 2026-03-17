/**
 * Phase 6a — Deadline expiration lifecycle integration test.
 * Covers: api + db + engine end-to-end.
 * Flow: create game → expire deadline → processExpiredGames → verify
 *       DB action persisted + engine state valid + sequence incremented.
 * Requires DATABASE_URL.
 */

import { describe, it, expect } from "bun:test"
import { app } from "../src/index.ts"
import { processExpiredGames } from "../src/deadline.ts"
import { evictCachedState } from "../src/state-cache.ts"
import {
  touchGame,
  listActions,
  getGame,
  reconstructState,
  hashState,
  lastSequence,
  setGameStatus,
} from "@spell/db"
import { applyMove } from "@spell/engine"

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

async function createGame(seed = 42): Promise<string> {
  const res = await app.request("/games", {
    method: "POST",
    headers: headers(PLAYER_A),
    body: JSON.stringify({
      formatId: "standard-55",
      seed,
      players: [
        { userId: PLAYER_A, deckSnapshot: DECK },
        { userId: PLAYER_B, deckSnapshot: DECK },
      ],
    }),
  })
  expect(res.status).toBe(201)
  return ((await res.json()) as { gameId: string }).gameId
}

// ─── Deadline lifecycle ──────────────────────────────────────────────────────

describe("Deadline expiration lifecycle (api + db + engine)", () => {
  it("auto-PASS creates a valid DB action with correct hash", async () => {
    const gameId = await createGame(600)

    // Get initial state for comparison
    const game = await getGame(gameId)
    const { state: stateBefore } = await reconstructState(gameId, game!.seed)
    const seqBefore = await lastSequence(gameId)

    // Expire the deadline
    await touchGame(gameId, new Date(Date.now() - 1000))
    evictCachedState(gameId)

    await processExpiredGames()

    // Verify action in DB
    const actions = await listActions(gameId)
    expect(actions.length).toBe(1)
    expect(actions[0]!.move).toEqual({ type: "PASS" })
    expect(actions[0]!.sequence).toBe(seqBefore + 1)

    // Verify hash matches engine result
    const expectedResult = applyMove(stateBefore, stateBefore.activePlayer, { type: "PASS" })
    const expectedHash = hashState(expectedResult.newState)
    expect(actions[0]!.stateHash).toBe(expectedHash)
  })

  it("auto-PASS state matches full DB reconstruct", async () => {
    const gameId = await createGame(601)

    await touchGame(gameId, new Date(Date.now() - 1000))
    evictCachedState(gameId)
    await processExpiredGames()

    // Reconstruct from DB
    const game = await getGame(gameId)
    const { state: reconstructed } = await reconstructState(gameId, game!.seed)

    // Verify hash of reconstructed matches last action
    const actions = await listActions(gameId)
    expect(hashState(reconstructed)).toBe(actions[actions.length - 1]!.stateHash)
  })

  it("skips non-active games", async () => {
    const gameId = await createGame(602)
    await touchGame(gameId, new Date(Date.now() - 1000))
    await setGameStatus(gameId, "finished")
    evictCachedState(gameId)

    await processExpiredGames()

    // No actions should be created
    const actions = await listActions(gameId)
    expect(actions.length).toBe(0)
  })

  it("multiple expired games processed independently", async () => {
    const gameId1 = await createGame(603)
    const gameId2 = await createGame(604)

    await touchGame(gameId1, new Date(Date.now() - 1000))
    await touchGame(gameId2, new Date(Date.now() - 1000))
    evictCachedState(gameId1)
    evictCachedState(gameId2)

    await processExpiredGames()

    const actions1 = await listActions(gameId1)
    const actions2 = await listActions(gameId2)
    expect(actions1.length).toBe(1)
    expect(actions2.length).toBe(1)

    // Both should have valid hashes
    for (const [gameId, actions] of [
      [gameId1, actions1],
      [gameId2, actions2],
    ] as const) {
      const game = await getGame(gameId)
      const { state } = await reconstructState(gameId, game!.seed)
      expect(hashState(state)).toBe(actions[actions.length - 1]!.stateHash)
    }
  })
})
