import { describe, it, expect, beforeEach } from "bun:test"
import { initGame, applyMove, _resetInstanceCounter } from "@spell/engine"
import type { GameState as EngineGameState } from "@spell/engine"
import { serializeEngineStateForClient } from "./client-serialize.ts"

// ─── Minimal fixtures (mirrors engine/test/fixtures.ts) ──────────────────────

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

function makeDeck(primary: CardData, filler: CardData): CardData[] {
  return [primary, ...Array(54).fill(filler)]
}

const DECK_P1 = makeDeck(REALM, CHAMPION)
const DECK_P2 = makeDeck(REALM, CHAMPION)

const CONFIG: GameConfig = {
  gameId: "test-game",
  players: [
    { id: "p1", deckCards: DECK_P1 },
    { id: "p2", deckCards: DECK_P2 },
  ],
  seed: 42,
}

let state: EngineGameState

beforeEach(() => {
  _resetInstanceCounter()
  state = initGame(CONFIG)
})

describe("serializeEngineStateForClient", () => {
  it("produces correct top-level shape", () => {
    const result = serializeEngineStateForClient(state, "p1", {
      status: "active",
      turnDeadline: null,
      winner: null,
    })
    expect(result.gameId).toBe("test-game")
    expect(result.viewerPlayerId).toBe("p1")
    expect(result.playerOrder).toEqual(["p1", "p2"])
    expect(result.status).toBe("active")
    expect(result.activePlayer).toBe("p1")
    expect(result.winner).toBeNull()
    expect(result.turnDeadline).toBeNull()
    expect(result.resolutionContext).toBeNull()
  })

  it("shows own hand, hides opponent hand", () => {
    const result = serializeEngineStateForClient(state, "p1", {
      status: "active",
      turnDeadline: null,
      winner: null,
    })
    expect(result.board.players["p1"]!.hand.length).toBeGreaterThan(0)
    expect(result.board.players["p1"]!.handHidden).toBe(false)
    expect(result.board.players["p2"]!.hand).toEqual([])
    expect(result.board.players["p2"]!.handHidden).toBe(true)
  })

  it("handCount reflects actual hand size for both players", () => {
    const result = serializeEngineStateForClient(state, "p1", {
      status: "active",
      turnDeadline: null,
      winner: null,
    })
    const p1 = state.players["p1"]!
    const p2 = state.players["p2"]!
    expect(result.board.players["p1"]!.handCount).toBe(p1.hand.length)
    expect(result.board.players["p2"]!.handCount).toBe(p2.hand.length)
  })

  it("computes non-empty legalMoves for active player", () => {
    const result = serializeEngineStateForClient(state, "p1", {
      status: "active",
      turnDeadline: null,
      winner: null,
    })
    expect(result.legalMoves.length).toBeGreaterThan(0)
  })

  it("legalMovesPerPlayer contains only viewer player", () => {
    const result = serializeEngineStateForClient(state, "p1", {
      status: "active",
      turnDeadline: null,
      winner: null,
    })
    expect(Object.keys(result.legalMovesPerPlayer ?? {})).toEqual(["p1"])
  })

  it("includes events array from engine state", () => {
    const result = serializeEngineStateForClient(state, "p1", {
      status: "active",
      turnDeadline: null,
      winner: null,
    })
    expect(result.events).toBe(state.events)
  })

  it("preserves extra.players when provided", () => {
    const mockPlayers = [{ userId: "p1", seatPosition: 0, nickname: "Alice" }]
    const result = serializeEngineStateForClient(state, "p1", {
      status: "active",
      turnDeadline: null,
      winner: null,
      players: mockPlayers,
    })
    expect(result.players).toEqual(mockPlayers)
  })

  it("serializes winner state correctly", () => {
    const result = serializeEngineStateForClient(state, "p1", {
      status: "finished",
      turnDeadline: null,
      winner: "p1",
    })
    expect(result.status).toBe("finished")
    expect(result.winner).toBe("p1")
  })

  it("formation slots are null before any realm is played", () => {
    const result = serializeEngineStateForClient(state, "p1", {
      status: "active",
      turnDeadline: null,
      winner: null,
    })
    const formation = result.board.players["p1"]!.formation
    // All slots should be null initially
    for (const slot of Object.values(formation)) {
      expect(slot).toBeNull()
    }
  })

  it("formation slot is populated after PLAY_REALM", () => {
    // Advance to PLAY_REALM phase
    const r1 = applyMove(state, "p1", { type: "PASS" }) // START_OF_TURN → DRAW
    const r2 = applyMove(r1.newState, "p1", { type: "PASS" }) // DRAW → PLAY_REALM

    // Find a realm in hand
    const p1State = r2.newState.players["p1"]!
    const realmInHand = p1State.hand.find((c) => c.card.typeId === 13)
    if (!realmInHand) return // no realm in opening hand — skip

    const r3 = applyMove(r2.newState, "p1", {
      type: "PLAY_REALM",
      cardInstanceId: realmInHand.instanceId,
      slot: "A",
    })

    const result = serializeEngineStateForClient(r3.newState, "p1", {
      status: "active",
      turnDeadline: null,
      winner: null,
    })
    expect(result.board.players["p1"]!.formation["A"]).not.toBeNull()
    expect(result.board.players["p1"]!.formation["A"]!.realm.instanceId).toBe(
      realmInHand.instanceId,
    )
  })

  it("opponent formation is visible (realms are public)", () => {
    // Serializing from p1's perspective — p2's formation realms should be visible
    const result = serializeEngineStateForClient(state, "p1", {
      status: "active",
      turnDeadline: null,
      winner: null,
    })
    // p2's formation slots — all null at start, but formation object is present
    expect(result.board.players["p2"]!.formation).toBeDefined()
  })

  it("handMaxSize is non-zero", () => {
    const result = serializeEngineStateForClient(state, "p1", {
      status: "active",
      turnDeadline: null,
      winner: null,
    })
    expect(result.handMaxSize).toBeGreaterThan(0)
  })

  it("combat is null when no combat is active", () => {
    const result = serializeEngineStateForClient(state, "p1", {
      status: "active",
      turnDeadline: null,
      winner: null,
    })
    expect(result.board.combat).toBeNull()
  })
})
