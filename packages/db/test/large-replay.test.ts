/**
 * Phase 3c — Large replay performance test.
 * Verifies reconstruction with 100+ moves completes correctly and within
 * acceptable time bounds.
 *
 * Requires a running Postgres instance (docker-compose up -d).
 */

import { describe, it, expect, afterAll } from "bun:test"
import { db } from "../src/connection.ts"
import { games } from "../src/schema.ts"
import { eq } from "drizzle-orm"
import { createGame, setGameStatus } from "../src/games.ts"
import { saveAction, listActions, lastSequence } from "../src/actions.ts"
import { reconstructState } from "../src/reconstruct.ts"
import { hashState } from "../src/hash.ts"
import { initGame, applyMove, getLegalMoves } from "@spell/engine"
import type { CardData, Move, GameState } from "@spell/engine"

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CARD: CardData = {
  setId: "01",
  cardNumber: 1,
  name: "Forest",
  typeId: 13,
  worldId: 1,
  isAvatar: false,
  level: null,
  description: "",
  attributes: [],
  supportIds: [],
  effects: [],
}

function deck(n = 55): CardData[] {
  return Array.from({ length: n }, () => CARD)
}

const createdGameIds: string[] = []

afterAll(async () => {
  for (const id of createdGameIds) {
    await db.delete(games).where(eq(games.id, id))
  }
})

/** Pick PASS if legal, otherwise first legal move (handles DISCARD_CARD). */
function pickMove(state: GameState): { playerId: string; move: Move } {
  const playerId = state.activePlayer
  const legal = getLegalMoves(state, playerId)
  const pass = legal.find((m) => m.type === "PASS")
  return { playerId, move: pass ?? legal[0]! }
}

// ─── Large replay ────────────────────────────────────────────────────────────

describe("large replay reconstruction", () => {
  it("reconstructs 120 moves correctly", async () => {
    const P1 = crypto.randomUUID()
    const P2 = crypto.randomUUID()
    const game = await createGame({
      formatId: "standard",
      seed: 42,
      players: [
        { userId: P1, seatPosition: 0, deckSnapshot: deck() },
        { userId: P2, seatPosition: 1, deckSnapshot: deck() },
      ],
    })
    createdGameIds.push(game.id)
    await setGameStatus(game.id, "active")

    let state = initGame({
      gameId: game.id,
      seed: 42,
      players: [
        { id: P1, deckCards: deck() },
        { id: P2, deckCards: deck() },
      ],
    })

    const MOVE_COUNT = 120
    const moves: Array<{ playerId: string; move: Move }> = []
    for (let i = 0; i < MOVE_COUNT; i++) {
      const { playerId, move } = pickMove(state)
      const result = applyMove(state, playerId, move)
      state = result.newState
      moves.push({ playerId, move })
      await saveAction({
        gameId: game.id,
        sequence: i,
        playerId,
        move,
        stateHash: hashState(state),
      })
    }

    const actions = await listActions(game.id)
    expect(actions).toHaveLength(MOVE_COUNT)

    const start = performance.now()
    const result = await reconstructState(game.id, 42)
    const elapsed = performance.now() - start

    expect(result.errors).toHaveLength(0)
    expect(result.state.currentTurn).toBe(state.currentTurn)
    expect(result.state.activePlayer).toBe(state.activePlayer)
    // Should complete in under 5 seconds
    expect(elapsed).toBeLessThan(5000)
  })

  it("reconstructs 200 moves without errors", async () => {
    const P1 = crypto.randomUUID()
    const P2 = crypto.randomUUID()
    const game = await createGame({
      formatId: "standard",
      seed: 99,
      players: [
        { userId: P1, seatPosition: 0, deckSnapshot: deck() },
        { userId: P2, seatPosition: 1, deckSnapshot: deck() },
      ],
    })
    createdGameIds.push(game.id)

    let state = initGame({
      gameId: game.id,
      seed: 99,
      players: [
        { id: P1, deckCards: deck() },
        { id: P2, deckCards: deck() },
      ],
    })

    const MOVE_COUNT = 200
    for (let i = 0; i < MOVE_COUNT; i++) {
      const { playerId, move } = pickMove(state)
      const result = applyMove(state, playerId, move)
      state = result.newState
      await saveAction({
        gameId: game.id,
        sequence: i,
        playerId,
        move,
        stateHash: hashState(state),
      })
    }

    const result = await reconstructState(game.id, 99)
    expect(result.errors).toHaveLength(0)
    expect(result.state.currentTurn).toBe(state.currentTurn)
  })

  it("lastSequence is correct after large insert batch", async () => {
    const P1 = crypto.randomUUID()
    const game = await createGame({
      formatId: "standard",
      seed: 7,
      players: [{ userId: P1, seatPosition: 0, deckSnapshot: deck() }],
    })
    createdGameIds.push(game.id)

    const COUNT = 150
    const PASS: Move = { type: "PASS" }
    for (let i = 0; i < COUNT; i++) {
      await saveAction({
        gameId: game.id,
        sequence: i,
        playerId: P1,
        move: PASS,
        stateHash: "a".repeat(64),
      })
    }

    expect(await lastSequence(game.id)).toBe(COUNT - 1)
  })
})
