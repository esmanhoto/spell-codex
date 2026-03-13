import { describe, it, expect, beforeEach } from "bun:test"
import { initGame, applyMove, _resetInstanceCounter } from "@spell/engine"
import type { GameState as EngineGameState } from "@spell/engine"
import { hashEngineState } from "./state-hash.ts"
import { createHash } from "crypto"

// ─── Minimal fixture ──────────────────────────────────────────────────────────

import type { CardData, GameConfig } from "@spell/engine"

const REALM: CardData = {
  setId: "1st",
  cardNumber: 1,
  name: "Waterdeep",
  typeId: 13,
  worldId: 1,
  isAvatar: false,
  level: null,
  description: "",
  attributes: [],
  supportIds: [],
  effects: [],
}

const CHAMPION: CardData = {
  setId: "1st",
  cardNumber: 2,
  name: "Hero",
  typeId: 5,
  worldId: 1,
  isAvatar: false,
  level: 5,
  description: "",
  attributes: [],
  supportIds: [],
  effects: [],
}

const CONFIG: GameConfig = {
  gameId: "hash-test",
  players: [
    { id: "p1", deckCards: [REALM, ...Array(54).fill(CHAMPION)] },
    { id: "p2", deckCards: [REALM, ...Array(54).fill(CHAMPION)] },
  ],
  seed: 1,
}

/** Mirrors packages/db/src/hash.ts — Node.js implementation for parity check */
function serverHashState(state: EngineGameState): string {
  const { events: _events, ...boardState } = state
  const json = JSON.stringify(boardState)
  return createHash("sha256").update(json).digest("hex")
}

let state: EngineGameState

beforeEach(() => {
  _resetInstanceCounter()
  state = initGame(CONFIG)
})

describe("hashEngineState", () => {
  it("is deterministic — same state produces same hash", async () => {
    const h1 = await hashEngineState(state)
    const h2 = await hashEngineState(state)
    expect(h1).toBe(h2)
  })

  it("produces a 64-character hex string", async () => {
    const h = await hashEngineState(state)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it("produces different hashes for different states", async () => {
    const r = applyMove(state, "p1", { type: "PASS" })
    const h1 = await hashEngineState(state)
    const h2 = await hashEngineState(r.newState)
    expect(h1).not.toBe(h2)
  })

  it("matches the server hash implementation (parity check)", async () => {
    const clientHash = await hashEngineState(state)
    const serverHash = serverHashState(state)
    expect(clientHash).toBe(serverHash)
  })

  it("matches server hash after a move", async () => {
    const r = applyMove(state, "p1", { type: "PASS" })
    const clientHash = await hashEngineState(r.newState)
    const serverHash = serverHashState(r.newState)
    expect(clientHash).toBe(serverHash)
  })

  it("excludes events from hash (events do not affect result)", async () => {
    // Two states differing only in events produce different hashes
    // (this verifies events ARE excluded, since they ARE in the state)
    const stateWithNoEvents: EngineGameState = { ...state, events: [] }
    const stateWithEvents: EngineGameState = {
      ...state,
      events: [{ type: "GAME_STARTED", players: ["p1", "p2"] }],
    }
    const h1 = await hashEngineState(stateWithNoEvents)
    const h2 = await hashEngineState(stateWithEvents)
    // Events are excluded from hash, so hashes should be equal
    expect(h1).toBe(h2)
  })
})
