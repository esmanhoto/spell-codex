import { describe, test, expect, beforeEach } from "bun:test"
import { getLegalMoves } from "../../src/legal-moves.ts"
import { initGame } from "../../src/init.ts"
import { _resetInstanceCounter } from "../../src/utils.ts"
import { Phase } from "../../src/types.ts"
import type { GameState, ResolutionContext } from "../../src/types.ts"
import { DEFAULT_CONFIG, EVENT_CARD, WIZARD_SPELL } from "../fixtures.ts"
import { inst } from "../scenario-builders.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

function stateWithActiveResolution(): GameState {
  const base = initGame(DEFAULT_CONFIG)
  const eventCard = inst("event1", EVENT_CARD)
  const ctx: ResolutionContext = {
    cardInstanceId: "event1",
    pendingCard: eventCard,
    initiatingPlayer: "p1",
    resolvingPlayer: "p1",
    cardDestination: "abyss",
    counterWindowOpen: false,
    declarations: [],
  }
  return {
    ...base,
    phase: Phase.Pool,
    activePlayer: "p1",
    resolutionContext: ctx,
    players: {
      ...base.players,
      p1: {
        ...base.players["p1"]!,
        hand: [inst("spell1", WIZARD_SPELL), inst("event2", EVENT_CARD)],
      },
    },
  }
}

describe("nested resolution is blocked", () => {
  test("resolving player only gets RESOLVE_* moves during resolution", () => {
    const state = stateWithActiveResolution()
    const moves = getLegalMoves(state, "p1")

    expect(moves.length).toBeGreaterThan(0)
    for (const m of moves) {
      expect(m.type).toMatch(/^RESOLVE_/)
    }
  })

  test("no PLAY_SPELL or PLAY_EVENT moves available during resolution", () => {
    const state = stateWithActiveResolution()
    const moves = getLegalMoves(state, "p1")

    expect(moves.some((m) => m.type === ("PLAY_SPELL" as any))).toBe(false)
    expect(moves.some((m) => m.type === ("PLAY_EVENT" as any))).toBe(false)
    expect(moves.some((m) => m.type === ("PLAY_PHASE3_CARD" as any))).toBe(false)
  })

  test("non-resolving player gets zero moves (no counter window)", () => {
    const state = stateWithActiveResolution()
    const moves = getLegalMoves(state, "p2")

    expect(moves).toEqual([])
  })

  test("RESOLVE_DONE is always available to resolving player", () => {
    const state = stateWithActiveResolution()
    const moves = getLegalMoves(state, "p1")

    expect(moves.some((m) => m.type === "RESOLVE_DONE")).toBe(true)
  })
})
