import { describe, it, expect } from "bun:test"
import { applyOptimisticMove } from "./optimistic-state.ts"
import type { GameState, CardInfo, PlayerBoard } from "../api.ts"

function makeCard(instanceId: string, typeId = 0): CardInfo {
  return {
    instanceId,
    name: "Test",
    typeId,
    worldId: 0,
    level: 1,
    setId: "1st",
    cardNumber: 1,
    description: "",
    supportIds: [],
    spellNature: null,
    castPhases: [],
  }
}

function makeBoard(overrides: Partial<PlayerBoard> = {}): PlayerBoard {
  return {
    hand: [],
    handCount: 0,
    handHidden: false,
    formation: {},
    pool: [],
    drawPileCount: 0,
    discardCount: 0,
    discardPile: [],
    lastingEffects: [],
    ...overrides,
  }
}

function makeState(p1: Partial<PlayerBoard> = {}): GameState {
  return {
    gameId: "g1",
    viewerPlayerId: "p1",
    playerOrder: ["p1", "p2"],
    status: "active",
    phase: "PLAY_REALM",
    activePlayer: "p1",
    turnNumber: 1,
    turnDeadline: null,
    winner: null,
    handMaxSize: 8,
    legalMoves: [{ type: "PASS" }],
    board: {
      players: { p1: makeBoard(p1), p2: makeBoard() },
      combat: null,
    },
    resolutionContext: null,
    pendingTriggers: [],
  }
}

describe("applyOptimisticMove", () => {
  describe("PASS / END_TURN", () => {
    it("PASS clears legalMoves", () => {
      const result = applyOptimisticMove(makeState(), "p1", { type: "PASS" })
      expect(result).not.toBeNull()
      expect(result!.legalMoves).toEqual([])
    })

    it("END_TURN clears legalMoves", () => {
      const result = applyOptimisticMove(makeState(), "p1", { type: "END_TURN" })
      expect(result!.legalMoves).toEqual([])
    })

    it("DECLINE_DEFENSE clears legalMoves", () => {
      const result = applyOptimisticMove(makeState(), "p1", { type: "DECLINE_DEFENSE" })
      expect(result!.legalMoves).toEqual([])
    })

    it("preserves board state unchanged", () => {
      const card = makeCard("c1")
      const state = makeState({ hand: [card] })
      const result = applyOptimisticMove(state, "p1", { type: "PASS" })
      expect(result!.board.players["p1"]!.hand).toHaveLength(1)
    })
  })

  describe("PLAY_REALM", () => {
    it("moves card from hand to formation slot", () => {
      const card = makeCard("realm-1")
      const state = makeState({ hand: [card] })
      const result = applyOptimisticMove(state, "p1", {
        type: "PLAY_REALM",
        cardInstanceId: "realm-1",
        slot: "A",
      })
      expect(result).not.toBeNull()
      expect(result!.board.players["p1"]!.hand).toHaveLength(0)
      const slot = result!.board.players["p1"]!.formation["A"]
      expect(slot?.realm.instanceId).toBe("realm-1")
      expect(slot?.holdings).toEqual([])
      expect(slot?.isRazed).toBe(false)
      expect(result!.legalMoves).toEqual([])
    })

    it("preserves other hand cards", () => {
      const r = makeCard("realm-1")
      const other = makeCard("other")
      const state = makeState({ hand: [r, other] })
      const result = applyOptimisticMove(state, "p1", {
        type: "PLAY_REALM",
        cardInstanceId: "realm-1",
        slot: "A",
      })
      expect(result!.board.players["p1"]!.hand).toHaveLength(1)
      expect(result!.board.players["p1"]!.hand[0]!.instanceId).toBe("other")
    })

    it("returns null if card not in hand", () => {
      const result = applyOptimisticMove(makeState(), "p1", {
        type: "PLAY_REALM",
        cardInstanceId: "missing",
        slot: "A",
      })
      expect(result).toBeNull()
    })

    it("returns null for unknown player", () => {
      const result = applyOptimisticMove(makeState(), "p99", {
        type: "PLAY_REALM",
        cardInstanceId: "c1",
        slot: "A",
      })
      expect(result).toBeNull()
    })
  })

  describe("PLAY_HOLDING", () => {
    it("adds holding to existing realm slot", () => {
      const realm = makeCard("realm-1")
      const holding = makeCard("holding-1")
      const state = makeState({
        hand: [holding],
        formation: {
          A: { realm, holdings: [], holdingCount: 0, isRazed: false, holdingRevealedToAll: false },
        },
      })
      const result = applyOptimisticMove(state, "p1", {
        type: "PLAY_HOLDING",
        cardInstanceId: "holding-1",
        realmSlot: "A",
      })
      expect(result).not.toBeNull()
      expect(result!.board.players["p1"]!.hand).toHaveLength(0)
      const slot = result!.board.players["p1"]!.formation["A"]!
      expect(slot.holdings).toHaveLength(1)
      expect(slot.holdings[0]!.instanceId).toBe("holding-1")
      expect(slot.realm.instanceId).toBe("realm-1")
    })

    it("returns null if realm slot does not exist", () => {
      const state = makeState({ hand: [makeCard("h1")] })
      const result = applyOptimisticMove(state, "p1", {
        type: "PLAY_HOLDING",
        cardInstanceId: "h1",
        realmSlot: "X",
      })
      expect(result).toBeNull()
    })
  })

  describe("PLACE_CHAMPION", () => {
    it("moves card from hand to pool", () => {
      const card = makeCard("champ-1", 5)
      const state = makeState({ hand: [card] })
      const result = applyOptimisticMove(state, "p1", {
        type: "PLACE_CHAMPION",
        cardInstanceId: "champ-1",
      })
      expect(result).not.toBeNull()
      expect(result!.board.players["p1"]!.hand).toHaveLength(0)
      expect(result!.board.players["p1"]!.pool).toHaveLength(1)
      expect(result!.board.players["p1"]!.pool[0]!.champion.instanceId).toBe("champ-1")
      expect(result!.board.players["p1"]!.pool[0]!.attachments).toEqual([])
    })

    it("appends to existing pool entries", () => {
      const existing = makeCard("champ-0", 5)
      const newChamp = makeCard("champ-1", 5)
      const state = makeState({
        hand: [newChamp],
        pool: [{ champion: existing, attachments: [] }],
      })
      const result = applyOptimisticMove(state, "p1", {
        type: "PLACE_CHAMPION",
        cardInstanceId: "champ-1",
      })
      expect(result!.board.players["p1"]!.pool).toHaveLength(2)
    })
  })

  describe("ATTACH_ITEM", () => {
    it("attaches item to champion in pool", () => {
      const champ = makeCard("champ-1", 5)
      const item = makeCard("item-1", 3)
      const state = makeState({
        hand: [item],
        pool: [{ champion: champ, attachments: [] }],
      })
      const result = applyOptimisticMove(state, "p1", {
        type: "ATTACH_ITEM",
        cardInstanceId: "item-1",
        championId: "champ-1",
      })
      expect(result).not.toBeNull()
      expect(result!.board.players["p1"]!.hand).toHaveLength(0)
      expect(result!.board.players["p1"]!.pool[0]!.attachments).toHaveLength(1)
      expect(result!.board.players["p1"]!.pool[0]!.attachments[0]!.instanceId).toBe("item-1")
    })

    it("only modifies the target champion's attachments", () => {
      const champ1 = makeCard("champ-1", 5)
      const champ2 = makeCard("champ-2", 5)
      const item = makeCard("item-1", 3)
      const state = makeState({
        hand: [item],
        pool: [
          { champion: champ1, attachments: [] },
          { champion: champ2, attachments: [] },
        ],
      })
      const result = applyOptimisticMove(state, "p1", {
        type: "ATTACH_ITEM",
        cardInstanceId: "item-1",
        championId: "champ-2",
      })
      expect(result!.board.players["p1"]!.pool[0]!.attachments).toHaveLength(0)
      expect(result!.board.players["p1"]!.pool[1]!.attachments).toHaveLength(1)
    })

    it("returns null if champion not found in pool", () => {
      const state = makeState({ hand: [makeCard("item-1")] })
      const result = applyOptimisticMove(state, "p1", {
        type: "ATTACH_ITEM",
        cardInstanceId: "item-1",
        championId: "nobody",
      })
      expect(result).toBeNull()
    })
  })

  describe("DISCARD_CARD", () => {
    it("removes from hand, increments discardCount, adds to discardPile", () => {
      const card = makeCard("c1")
      const state = makeState({ hand: [card], discardCount: 2 })
      const result = applyOptimisticMove(state, "p1", {
        type: "DISCARD_CARD",
        cardInstanceId: "c1",
      })
      expect(result).not.toBeNull()
      expect(result!.board.players["p1"]!.hand).toHaveLength(0)
      expect(result!.board.players["p1"]!.discardCount).toBe(3)
      expect(result!.board.players["p1"]!.discardPile).toHaveLength(1)
      expect(result!.board.players["p1"]!.discardPile[0]!.instanceId).toBe("c1")
    })

    it("returns null if card not in hand", () => {
      const result = applyOptimisticMove(makeState(), "p1", {
        type: "DISCARD_CARD",
        cardInstanceId: "missing",
      })
      expect(result).toBeNull()
    })
  })

  describe("PLACE_CHAMPION: missing card", () => {
    it("returns null if card not in hand", () => {
      const result = applyOptimisticMove(makeState(), "p1", {
        type: "PLACE_CHAMPION",
        cardInstanceId: "missing",
      })
      expect(result).toBeNull()
    })
  })

  describe("ATTACH_ITEM: missing card", () => {
    it("returns null if item not in hand", () => {
      const champ = makeCard("champ-1", 5)
      const state = makeState({ pool: [{ champion: champ, attachments: [] }] })
      const result = applyOptimisticMove(state, "p1", {
        type: "ATTACH_ITEM",
        cardInstanceId: "missing",
        championId: "champ-1",
      })
      expect(result).toBeNull()
    })
  })

  describe("pass-family moves", () => {
    it("STOP_PLAYING clears legalMoves", () => {
      const result = applyOptimisticMove(makeState(), "p1", { type: "STOP_PLAYING" })
      expect(result!.legalMoves).toEqual([])
    })

    it("END_ATTACK clears legalMoves", () => {
      const result = applyOptimisticMove(makeState(), "p1", { type: "END_ATTACK" })
      expect(result!.legalMoves).toEqual([])
    })

    it("INTERRUPT_COMBAT clears legalMoves", () => {
      const result = applyOptimisticMove(makeState(), "p1", { type: "INTERRUPT_COMBAT" })
      expect(result!.legalMoves).toEqual([])
    })
  })

  describe("unhandled moves", () => {
    it("returns null for DECLARE_ATTACK", () => {
      const result = applyOptimisticMove(makeState(), "p1", {
        type: "DECLARE_ATTACK",
        championId: "c1",
        targetPlayerId: "p2",
        targetRealmSlot: "A",
      })
      expect(result).toBeNull()
    })

    it("returns null for PLAY_PHASE3_CARD", () => {
      const result = applyOptimisticMove(makeState(), "p1", {
        type: "PLAY_PHASE3_CARD",
        cardInstanceId: "spell-1",
      })
      expect(result).toBeNull()
    })
  })
})
