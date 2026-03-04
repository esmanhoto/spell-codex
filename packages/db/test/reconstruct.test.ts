/**
 * Reconstruction tests — no real database required.
 *
 * We inline a mini-reconstruct that accepts data directly so the test runs
 * without a Postgres connection.
 */

import { describe, it, expect } from "bun:test"
import { initGame, applyMove, _resetInstanceCounter } from "@spell/engine"
import type { CardData, Move } from "@spell/engine"
import { Phase } from "@spell/engine"
import { hashState } from "../src/hash.ts"

// ─── Minimal deck ─────────────────────────────────────────────────────────────

const REALM: CardData = {
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

function makeDeck(total = 55): CardData[] {
  return Array.from({ length: total }, () => REALM)
}

const SEED = 42
const GAME_ID = "game-1"
const PLAYER_A = "player-a"
const PLAYER_B = "player-b"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeState0() {
  _resetInstanceCounter()
  return initGame({
    gameId: GAME_ID,
    seed: SEED,
    players: [
      { id: PLAYER_A, deckCards: makeDeck() },
      { id: PLAYER_B, deckCards: makeDeck() },
    ],
  })
}

function makeGamePlayers() {
  const deck = makeDeck()
  return [
    { id: "gp1", gameId: GAME_ID, userId: PLAYER_A, seatPosition: 0, deckSnapshot: deck },
    { id: "gp2", gameId: GAME_ID, userId: PLAYER_B, seatPosition: 1, deckSnapshot: deck },
  ]
}

/** Runs a sequence of moves and returns (actions, finalState). */
function buildActions(moves: Array<{ playerId: string; move: Move }>) {
  let current = makeState0()
  const actions = []

  for (let i = 0; i < moves.length; i++) {
    const { playerId, move } = moves[i]!
    const result = applyMove(current, playerId, move)
    current = result.newState
    actions.push({
      id: `a${i}`,
      gameId: GAME_ID,
      sequence: i,
      playerId,
      move,
      stateHash: hashState(current),
      createdAt: new Date(),
    })
  }

  return { actions, finalState: current }
}

/** In-memory reconstruct — mirrors src/reconstruct.ts without the DB calls. */
function reconstructInMemory(
  players: ReturnType<typeof makeGamePlayers>,
  actions: ReturnType<typeof buildActions>["actions"],
) {
  const sorted = [...players].sort((a, b) => a.seatPosition - b.seatPosition)
  const [p1, p2] = sorted as [(typeof sorted)[0], (typeof sorted)[0]]

  _resetInstanceCounter()
  let current = initGame({
    gameId: GAME_ID,
    seed: SEED,
    players: [
      { id: p1.userId, deckCards: p1.deckSnapshot as CardData[] },
      { id: p2.userId, deckCards: p2.deckSnapshot as CardData[] },
    ],
  })

  const errors: Array<{ kind: string; sequence: number; message: string }> = []

  for (const action of actions) {
    let result
    try {
      result = applyMove(current, action.playerId, action.move as Move)
    } catch (err) {
      errors.push({
        kind: "engine_error",
        sequence: action.sequence,
        message: err instanceof Error ? err.message : String(err),
      })
      continue
    }
    current = result.newState
    const actualHash = hashState(current)
    if (actualHash !== action.stateHash) {
      errors.push({
        kind: "hash_mismatch",
        sequence: action.sequence,
        message: `expected ${action.stateHash}, got ${actualHash}`,
      })
    }
  }

  return { state: current, errors }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("hashState", () => {
  it("returns a 64-char hex string", () => {
    const h = hashState(makeState0())
    expect(h).toHaveLength(64)
    expect(/^[0-9a-f]+$/.test(h)).toBe(true)
  })

  it("is stable — same state produces same hash", () => {
    const state = makeState0()
    expect(hashState(state)).toBe(hashState(state))
  })

  it("differs after a state change", () => {
    const state0 = makeState0()
    const result = applyMove(state0, PLAYER_A, { type: "PASS" })
    expect(hashState(state0)).not.toBe(hashState(result.newState))
  })
})

describe("reconstruct (mocked IO)", () => {
  it("reconstructs initial state with zero actions", () => {
    const players = makeGamePlayers()
    const { state, errors } = reconstructInMemory(players, [])
    expect(errors).toHaveLength(0)
    expect(state.phase).toBe(Phase.StartOfTurn)
  })

  it("reconstructs correctly after several PASS moves", () => {
    const passes: Array<{ playerId: string; move: Move }> = [
      { playerId: PLAYER_A, move: { type: "PASS" } }, // DRAW
      { playerId: PLAYER_A, move: { type: "PASS" } }, // PLAY_REALM
      { playerId: PLAYER_A, move: { type: "PASS" } }, // POOL
      { playerId: PLAYER_A, move: { type: "PASS" } }, // COMBAT
      { playerId: PLAYER_A, move: { type: "PASS" } }, // PHASE_FIVE → END_TURN
    ]

    const { actions, finalState } = buildActions(passes)
    const players = makeGamePlayers()
    const { state, errors } = reconstructInMemory(players, actions)

    expect(errors).toHaveLength(0)
    expect(state.activePlayer).toBe(finalState.activePlayer)
    expect(state.phase).toBe(finalState.phase)
    expect(state.currentTurn).toBe(finalState.currentTurn)
  })

  it("reports hash_mismatch when stored hash is wrong", () => {
    const passes: Array<{ playerId: string; move: Move }> = [
      { playerId: PLAYER_A, move: { type: "PASS" } },
    ]
    const { actions } = buildActions(passes)

    // Corrupt the stored hash.
    const corrupted = actions.map((a) => ({ ...a, stateHash: "deadbeef" + a.stateHash.slice(8) }))

    const players = makeGamePlayers()
    const { errors } = reconstructInMemory(players, corrupted)

    expect(errors).toHaveLength(1)
    expect(errors[0]!.kind).toBe("hash_mismatch")
  })
})
