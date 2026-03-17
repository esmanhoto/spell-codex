import { describe, test, expect, beforeEach } from "bun:test"
import { handleResolveTriggerPeek } from "../../src/triggers.ts"
import { initGame } from "../../src/init.ts"
import { _resetInstanceCounter } from "../../src/utils.ts"
import type { GameState, GameEvent, TriggerEntry } from "../../src/types.ts"
import { DEFAULT_CONFIG } from "../fixtures.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

const TRIGGER: TriggerEntry = {
  id: "test-trigger-0",
  sourceCardInstanceId: "src-card",
  owningPlayerId: "p1",
  effect: { type: "turn_trigger", timing: "start" },
}

function stateWithDrawPile(count: number): GameState {
  const base = initGame(DEFAULT_CONFIG)
  return {
    ...base,
    pendingTriggers: [TRIGGER],
    players: {
      ...base.players,
      p1: {
        ...base.players["p1"]!,
        drawPile: base.players["p1"]!.drawPile.slice(0, count),
      },
    },
  }
}

describe("peek with small draw pile", () => {
  test("peek 3 from pile with 3+ cards: returns 3", () => {
    const state = stateWithDrawPile(5)
    const events: GameEvent[] = []
    const newState = handleResolveTriggerPeek(state, "p1", {
      type: "RESOLVE_TRIGGER_PEEK",
      targetPlayerId: "p1",
      source: "draw_pile",
      count: 3,
    }, events)

    const peek = newState.pendingTriggers[0]!.peekContext!
    expect(peek.cards).toHaveLength(3)
    expect(peek.source).toBe("draw_pile")
    expect(events.some((e) => e.type === "TRIGGER_PEEK_OPENED" && e.cardCount === 3)).toBe(true)
  })

  test("peek 3 from pile with 2 cards: returns only 2", () => {
    const state = stateWithDrawPile(2)
    const events: GameEvent[] = []
    const newState = handleResolveTriggerPeek(state, "p1", {
      type: "RESOLVE_TRIGGER_PEEK",
      targetPlayerId: "p1",
      source: "draw_pile",
      count: 3,
    }, events)

    const peek = newState.pendingTriggers[0]!.peekContext!
    expect(peek.cards).toHaveLength(2)
    expect(events.some((e) => e.type === "TRIGGER_PEEK_OPENED" && e.cardCount === 2)).toBe(true)
  })

  test("peek 3 from pile with 1 card: returns only 1", () => {
    const state = stateWithDrawPile(1)
    const events: GameEvent[] = []
    const newState = handleResolveTriggerPeek(state, "p1", {
      type: "RESOLVE_TRIGGER_PEEK",
      targetPlayerId: "p1",
      source: "draw_pile",
      count: 3,
    }, events)

    const peek = newState.pendingTriggers[0]!.peekContext!
    expect(peek.cards).toHaveLength(1)
  })

  test("peek from empty pile throws EMPTY_DRAW_PILE", () => {
    const state = stateWithDrawPile(0)
    const events: GameEvent[] = []
    expect(() =>
      handleResolveTriggerPeek(state, "p1", {
        type: "RESOLVE_TRIGGER_PEEK",
        targetPlayerId: "p1",
        source: "draw_pile",
        count: 3,
      }, events),
    ).toThrow("No cards to peek")
  })

  test("peeked cards are removed from draw pile", () => {
    const state = stateWithDrawPile(2)
    const drawBefore = state.players["p1"]!.drawPile.length
    const events: GameEvent[] = []
    const newState = handleResolveTriggerPeek(state, "p1", {
      type: "RESOLVE_TRIGGER_PEEK",
      targetPlayerId: "p1",
      source: "draw_pile",
      count: 3,
    }, events)

    expect(newState.players["p1"]!.drawPile.length).toBe(drawBefore - 2)
  })
})

describe("peek hand: always returns all cards regardless of count", () => {
  test("hand peek copies all hand cards", () => {
    const base = initGame(DEFAULT_CONFIG)
    const state: GameState = {
      ...base,
      pendingTriggers: [TRIGGER],
    }
    const handSize = state.players["p1"]!.hand.length
    const events: GameEvent[] = []

    const newState = handleResolveTriggerPeek(state, "p1", {
      type: "RESOLVE_TRIGGER_PEEK",
      targetPlayerId: "p1",
      source: "hand",
    }, events)

    const peek = newState.pendingTriggers[0]!.peekContext!
    expect(peek.cards).toHaveLength(handSize)
    expect(peek.source).toBe("hand")
    // Hand cards are NOT removed (only copied)
    expect(newState.players["p1"]!.hand.length).toBe(handSize)
  })
})
