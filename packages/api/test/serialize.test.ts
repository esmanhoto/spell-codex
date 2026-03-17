/**
 * Unit tests for API serialization — visibility filtering, hand hiding,
 * peek context, deck images, turnDeadline, legalMoves per player.
 */

import { describe, it, expect } from "bun:test"
import { serializeGameState, serializeBoard } from "../src/serialize.ts"
import { initGame } from "@spell/engine"
import type { GameState, CardData } from "@spell/engine"
import type { TriggerEntry } from "@spell/engine/src/types.ts"

const P1 = "player-1"
const P2 = "player-2"

const REALM: CardData = {
  setId: "01",
  cardNumber: 1,
  name: "Test Realm",
  typeId: 3,
  worldId: 1,
  level: 0,
  description: "",
  attributes: [],
  supportIds: [],
  effects: [],
  isAvatar: false,
}

function makeState(): GameState {
  return initGame({
    gameId: "test-game",
    seed: 42,
    players: [
      { id: P1, deckCards: Array.from({ length: 55 }, () => REALM) },
      { id: P2, deckCards: Array.from({ length: 55 }, () => REALM) },
    ],
  })
}

// ─── Hand visibility ─────────────────────────────────────────────────────────

describe("hand visibility", () => {
  it("shows own hand when viewerPlayerId matches", () => {
    const state = makeState()
    const board = serializeBoard(state, P1)
    const p1Board = board.players[P1]!
    const p2Board = board.players[P2]!

    // P1 sees own hand
    expect(p1Board.hand.length).toBeGreaterThan(0)
    expect(p1Board.handHidden).toBe(false)

    // P1 does NOT see P2's hand
    expect(p2Board.hand).toEqual([])
    expect(p2Board.handHidden).toBe(true)
    expect(p2Board.handCount).toBeGreaterThan(0)
  })

  it("shows all hands when no viewerPlayerId (spectator/server)", () => {
    const state = makeState()
    const board = serializeBoard(state)

    expect(board.players[P1]!.hand.length).toBeGreaterThan(0)
    expect(board.players[P2]!.hand.length).toBeGreaterThan(0)
    expect(board.players[P1]!.handHidden).toBe(false)
    expect(board.players[P2]!.handHidden).toBe(false)
  })
})

// ─── serializeGameState ──────────────────────────────────────────────────────

describe("serializeGameState", () => {
  it("includes gameId, phase, activePlayer, playerOrder", () => {
    const state = makeState()
    const result = serializeGameState(state)

    expect(result.gameId).toBe("test-game")
    expect(result.phase).toBeDefined()
    expect(result.activePlayer).toBe(P1)
    expect(result.playerOrder).toEqual([P1, P2])
  })

  it("uses extra.status over derived status", () => {
    const state = makeState()
    const result = serializeGameState(state, { status: "waiting" })
    expect(result.status).toBe("waiting")
  })

  it("derives status from winner when no extra.status", () => {
    const state = makeState()
    expect(serializeGameState(state).status).toBe("active")

    const won = { ...state, winner: P1 }
    expect(serializeGameState(won).status).toBe("finished")
  })

  it("serializes turnDeadline from Date", () => {
    const state = makeState()
    const date = new Date("2026-03-17T12:00:00Z")
    const result = serializeGameState(state, { turnDeadline: date })
    expect(result.turnDeadline).toBe("2026-03-17T12:00:00.000Z")
  })

  it("passes through string turnDeadline", () => {
    const state = makeState()
    const result = serializeGameState(state, { turnDeadline: "2026-03-17T12:00:00.000Z" })
    expect(result.turnDeadline).toBe("2026-03-17T12:00:00.000Z")
  })

  it("sets turnDeadline to null when not provided", () => {
    const state = makeState()
    expect(serializeGameState(state).turnDeadline).toBeNull()
  })

  it("returns legalMoves for viewer only when viewerPlayerId set", () => {
    const state = makeState()
    const result = serializeGameState(state, undefined, P1)

    expect(result.legalMovesPerPlayer[P1]).toBeDefined()
    expect(result.legalMovesPerPlayer[P2]).toBeUndefined()
  })

  it("returns legalMoves for all players when no viewer", () => {
    const state = makeState()
    const result = serializeGameState(state)

    expect(result.legalMovesPerPlayer[P1]).toBeDefined()
    expect(result.legalMovesPerPlayer[P2]).toBeDefined()
  })

  it("sets viewerPlayerId in output", () => {
    const state = makeState()
    expect(serializeGameState(state, undefined, P1).viewerPlayerId).toBe(P1)
    expect(serializeGameState(state).viewerPlayerId).toBeNull()
  })

  it("includes winner as null when no winner", () => {
    const state = makeState()
    expect(serializeGameState(state).winner).toBeNull()
  })

  it("includes winner when set", () => {
    const state = { ...makeState(), winner: P1 }
    expect(serializeGameState(state).winner).toBe(P1)
  })
})

// ─── Deck card images ────────────────────────────────────────────────────────

describe("deckCardImages", () => {
  it("includes deck images when includeDeckImages is true", () => {
    const state = makeState()
    const result = serializeGameState(state, { includeDeckImages: true })
    expect(result.deckCardImages).toBeDefined()
    expect(Array.isArray(result.deckCardImages)).toBe(true)
    // All cards are the same realm, so only 1 unique image
    expect(result.deckCardImages!.length).toBe(1)
    expect(result.deckCardImages![0]).toEqual(["01", 1])
  })

  it("omits deck images when not requested", () => {
    const state = makeState()
    const result = serializeGameState(state)
    expect(result.deckCardImages).toBeUndefined()
  })
})

// ─── Peek context visibility ─────────────────────────────────────────────────

describe("peek context visibility", () => {
  it("shows peek cards to owning player", () => {
    const state = makeState()
    const trigger: TriggerEntry = {
      id: "t1",
      sourceCardInstanceId: "card-1",
      owningPlayerId: P1,
      effect: { type: "turn_trigger" as const, timing: "start" as const },
      peekContext: {
        targetPlayerId: P2,
        source: "draw_pile" as const,
        cards: [state.players[P1]!.hand[0]!],
      },
    }
    state.pendingTriggers = [trigger]

    const result = serializeGameState(state, undefined, P1)
    const t = result.pendingTriggers[0]!
    expect(t.peekContext).not.toBeNull()
    expect(t.peekContext!.cards.length).toBeGreaterThan(0)
  })

  it("hides peek cards from non-owning player", () => {
    const state = makeState()
    const trigger: TriggerEntry = {
      id: "t1",
      sourceCardInstanceId: "card-1",
      owningPlayerId: P1,
      effect: { type: "turn_trigger" as const, timing: "start" as const },
      peekContext: {
        targetPlayerId: P2,
        source: "draw_pile" as const,
        cards: [state.players[P1]!.hand[0]!],
      },
    }
    state.pendingTriggers = [trigger]

    const result = serializeGameState(state, undefined, P2)
    const t = result.pendingTriggers[0]!
    expect(t.peekContext).not.toBeNull()
    // Cards hidden from non-owner
    expect(t.peekContext!.cards).toEqual([])
  })

  it("shows peek cards to spectator (no viewer)", () => {
    const state = makeState()
    const trigger: TriggerEntry = {
      id: "t1",
      sourceCardInstanceId: "card-1",
      owningPlayerId: P1,
      effect: { type: "turn_trigger" as const, timing: "start" as const },
      peekContext: {
        targetPlayerId: P2,
        source: "draw_pile" as const,
        cards: [state.players[P1]!.hand[0]!],
      },
    }
    state.pendingTriggers = [trigger]

    const result = serializeGameState(state)
    const t = result.pendingTriggers[0]!
    expect(t.peekContext!.cards.length).toBeGreaterThan(0)
  })

  it("returns null peekContext when trigger has none", () => {
    const state = makeState()
    const trigger: TriggerEntry = {
      id: "t1",
      sourceCardInstanceId: "card-1",
      owningPlayerId: P1,
      effect: { type: "turn_trigger" as const, timing: "end" as const },
    }
    state.pendingTriggers = [trigger]

    const result = serializeGameState(state, undefined, P1)
    expect(result.pendingTriggers[0]!.peekContext).toBeNull()
  })
})

// ─── Combat serialization ────────────────────────────────────────────────────

describe("combat serialization", () => {
  it("returns null combat when no combatState", () => {
    const state = makeState()
    const board = serializeBoard(state)
    expect(board.combat).toBeNull()
  })
})

// ─── Resolution context ─────────────────────────────────────────────────────

describe("resolution context", () => {
  it("returns null when no resolutionContext", () => {
    const state = makeState()
    const result = serializeGameState(state)
    expect(result.resolutionContext).toBeNull()
  })
})
