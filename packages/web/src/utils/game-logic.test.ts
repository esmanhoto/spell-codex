import { describe, it, expect, beforeEach } from "bun:test"
import { initGame, _resetInstanceCounter } from "@spell/engine"
import type { GameState as EngineGameState, CardData, GameConfig } from "@spell/engine"
import {
  filterLocalState,
  collectCardImageUrls,
  buildLingeringSpellsByPlayer,
  applyMoveLocally,
} from "./game-logic.ts"
import type { CardInfo, PlayerBoard } from "../api.ts"

// ─── Fixtures ────────────────────────────────────────────────────────────────

const REALM: CardData = {
  setId: "1st", cardNumber: 1, name: "Waterdeep", typeId: 13, worldId: 1,
  isAvatar: false, level: null, description: "", attributes: [], supportIds: [], effects: [],
}

const CHAMPION: CardData = {
  setId: "1st", cardNumber: 2, name: "Hero", typeId: 5, worldId: 1,
  isAvatar: false, level: 5, description: "", attributes: [], supportIds: [], effects: [],
}

function makeDeck(primary: CardData, filler: CardData): CardData[] {
  return [primary, ...Array(54).fill(filler)]
}

const CONFIG: GameConfig = {
  gameId: "test-game",
  players: [
    { id: "p1", deckCards: makeDeck(REALM, CHAMPION) },
    { id: "p2", deckCards: makeDeck(REALM, CHAMPION) },
  ],
  seed: 42,
}

let state: EngineGameState

beforeEach(() => {
  _resetInstanceCounter()
  state = initGame(CONFIG)
})

// ─── filterLocalState ────────────────────────────────────────────────────────

describe("filterLocalState", () => {
  it("preserves viewer's hand and drawPile", () => {
    const filtered = filterLocalState(state, "p1")
    expect(filtered.players.p1!.hand.length).toBe(state.players.p1!.hand.length)
    expect(filtered.players.p1!.drawPile.length).toBe(state.players.p1!.drawPile.length)
  })

  it("zeroes out opponent's hand and drawPile", () => {
    const filtered = filterLocalState(state, "p1")
    expect(filtered.players.p2!.hand).toEqual([])
    expect(filtered.players.p2!.drawPile).toEqual([])
  })

  it("does not mutate original state", () => {
    const originalP2Hand = state.players.p2!.hand.length
    filterLocalState(state, "p1")
    expect(state.players.p2!.hand.length).toBe(originalP2Hand)
  })

  it("preserves all other player fields", () => {
    const filtered = filterLocalState(state, "p1")
    expect(filtered.players.p2!.discardPile).toEqual(state.players.p2!.discardPile)
    expect(filtered.players.p2!.formation).toEqual(state.players.p2!.formation)
    expect(filtered.players.p2!.pool).toEqual(state.players.p2!.pool)
  })

  it("works symmetrically for the other viewer", () => {
    const filtered = filterLocalState(state, "p2")
    expect(filtered.players.p1!.hand).toEqual([])
    expect(filtered.players.p1!.drawPile).toEqual([])
    expect(filtered.players.p2!.hand.length).toBeGreaterThan(0)
  })
})

// ─── collectCardImageUrls ────────────────────────────────────────────────────

describe("collectCardImageUrls", () => {
  it("always includes the card back", () => {
    const urls = collectCardImageUrls()
    expect(urls).toContain("/api/cards/cardback.jpg")
  })

  it("includes URLs for each deck card", () => {
    const urls = collectCardImageUrls([["1st", 42], ["2nd", 7]])
    expect(urls).toContain("/api/cards/1st/42.jpg")
    expect(urls).toContain("/api/cards/2nd/7.jpg")
  })

  it("deduplicates identical card images", () => {
    const urls = collectCardImageUrls([["1st", 1], ["1st", 1], ["1st", 1]])
    const matches = urls.filter((u) => u === "/api/cards/1st/1.jpg")
    expect(matches.length).toBe(1)
  })

  it("handles undefined deckCardImages", () => {
    const urls = collectCardImageUrls(undefined)
    expect(urls).toEqual(["/api/cards/cardback.jpg"])
  })

  it("handles empty array", () => {
    const urls = collectCardImageUrls([])
    expect(urls).toEqual(["/api/cards/cardback.jpg"])
  })
})

// ─── buildLingeringSpellsByPlayer ────────────────────────────────────────────

describe("buildLingeringSpellsByPlayer", () => {
  const makeCard = (id: string): CardInfo => ({
    instanceId: id, name: "Spell", typeId: 4, worldId: 0, level: null,
    setId: "1st", cardNumber: 1, description: "", supportIds: [],
    spellNature: null, castPhases: [], effects: [],
  })

  const EMPTY_BOARD: PlayerBoard = {
    hand: [], handCount: 0, handHidden: false,
    formation: {}, pool: [],
    drawPileCount: 0, discardCount: 0, discardPile: [], lastingEffects: [],
  }

  it("returns empty arrays when boards is undefined", () => {
    const result = buildLingeringSpellsByPlayer(["p1", "p2"], undefined)
    expect(result).toEqual({ p1: [], p2: [] })
  })

  it("returns lastingEffects from each player", () => {
    const spell1 = makeCard("s1")
    const spell2 = makeCard("s2")
    const boards = {
      p1: { ...EMPTY_BOARD, lastingEffects: [spell1] },
      p2: { ...EMPTY_BOARD, lastingEffects: [spell2] },
    }
    const result = buildLingeringSpellsByPlayer(["p1", "p2"], boards)
    expect(result.p1).toEqual([spell1])
    expect(result.p2).toEqual([spell2])
  })

  it("returns empty array for player with no lasting effects", () => {
    const boards = { p1: EMPTY_BOARD }
    const result = buildLingeringSpellsByPlayer(["p1"], boards)
    expect(result.p1).toEqual([])
  })

  it("handles player IDs not in boards", () => {
    const result = buildLingeringSpellsByPlayer(["p1", "p3"], { p1: EMPTY_BOARD })
    expect(result.p3).toEqual([])
  })
})

// ─── applyMoveLocally ────────────────────────────────────────────────────────

describe("applyMoveLocally", () => {
  it("applies a PASS move and returns new engine state + API state", () => {
    const result = applyMoveLocally({
      engineState: state,
      playerId: state.activePlayer,
      move: { type: "PASS" },
      viewerId: "p1",
      status: "active",
      turnDeadline: null,
      winner: null,
    })
    expect(result).not.toBeNull()
    expect(result!.newEngineState.currentTurn).toBeGreaterThanOrEqual(state.currentTurn)
    expect(result!.apiState.gameId).toBe("test-game")
    expect(result!.apiState.board).toBeDefined()
    expect(result!.apiState.board.players).toBeDefined()
  })

  it("returns null for an invalid move", () => {
    const result = applyMoveLocally({
      engineState: state,
      playerId: "p1",
      move: { type: "DECLARE_ATTACK", championId: "nonexistent", targetPlayerId: "p2", targetRealmSlot: "0" },
      viewerId: "p1",
      status: "active",
      turnDeadline: null,
      winner: null,
    })
    expect(result).toBeNull()
  })

  it("advances the engine state correctly through multiple moves", () => {
    // PASS draws cards and ends turn
    const r1 = applyMoveLocally({
      engineState: state,
      playerId: state.activePlayer,
      move: { type: "PASS" },
      viewerId: "p1",
      status: "active",
      turnDeadline: null,
      winner: null,
    })
    expect(r1).not.toBeNull()

    // Second player can now PASS
    const r2 = applyMoveLocally({
      engineState: r1!.newEngineState,
      playerId: r1!.newEngineState.activePlayer,
      move: { type: "PASS" },
      viewerId: "p2",
      status: "active",
      turnDeadline: null,
      winner: null,
    })
    expect(r2).not.toBeNull()
    expect(r2!.newEngineState.currentTurn).toBeGreaterThanOrEqual(r1!.newEngineState.currentTurn)
  })

  it("preserves deckCardImages from currentApiState", () => {
    const deckCardImages: Array<[string, number]> = [["1st", 42]]
    const result = applyMoveLocally({
      engineState: state,
      playerId: state.activePlayer,
      move: { type: "PASS" },
      viewerId: "p1",
      status: "active",
      turnDeadline: null,
      winner: null,
      currentApiState: { deckCardImages } as unknown as import("../api.ts").GameState,
    })
    expect(result).not.toBeNull()
    expect(result!.apiState.deckCardImages).toEqual(deckCardImages)
  })

  it("includes winner and status from server message", () => {
    const result = applyMoveLocally({
      engineState: state,
      playerId: state.activePlayer,
      move: { type: "PASS" },
      viewerId: "p1",
      status: "finished",
      turnDeadline: "2026-01-01T00:00:00Z",
      winner: "p1",
    })
    expect(result).not.toBeNull()
    expect(result!.apiState.status).toBe("finished")
    expect(result!.apiState.winner).toBe("p1")
    expect(result!.apiState.turnDeadline).toBe("2026-01-01T00:00:00Z")
  })

  it("API state has correct viewer perspective (opponent hand hidden)", () => {
    const result = applyMoveLocally({
      engineState: state,
      playerId: state.activePlayer,
      move: { type: "PASS" },
      viewerId: "p1",
      status: "active",
      turnDeadline: null,
      winner: null,
    })
    expect(result).not.toBeNull()
    const p2Board = result!.apiState.board.players.p2
    expect(p2Board!.handHidden).toBe(true)
    expect(p2Board!.hand).toEqual([])
    // Viewer's hand should be visible
    const p1Board = result!.apiState.board.players.p1
    expect(p1Board!.handHidden).toBe(false)
  })

  it("returns null when move is applied by wrong player", () => {
    const wrongPlayer = state.activePlayer === "p1" ? "p2" : "p1"
    const result = applyMoveLocally({
      engineState: state,
      playerId: wrongPlayer,
      move: { type: "PASS" },
      viewerId: "p1",
      status: "active",
      turnDeadline: null,
      winner: null,
    })
    expect(result).toBeNull()
  })
})
