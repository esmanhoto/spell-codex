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
  it("shows own hand, hides opponent hand; spectator sees all", () => {
    const state = makeState()

    const p1View = serializeBoard(state, P1)
    expect(p1View.players[P1]!.hand.length).toBeGreaterThan(0)
    expect(p1View.players[P1]!.handHidden).toBe(false)
    expect(p1View.players[P2]!.hand).toEqual([])
    expect(p1View.players[P2]!.handHidden).toBe(true)
    expect(p1View.players[P2]!.handCount).toBeGreaterThan(0)

    const spectator = serializeBoard(state)
    expect(spectator.players[P1]!.hand.length).toBeGreaterThan(0)
    expect(spectator.players[P2]!.hand.length).toBeGreaterThan(0)
    expect(spectator.players[P1]!.handHidden).toBe(false)
    expect(spectator.players[P2]!.handHidden).toBe(false)
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

  it("handles turnDeadline: Date → ISO string, string passthrough, null default", () => {
    const state = makeState()
    expect(
      serializeGameState(state, { turnDeadline: new Date("2026-03-17T12:00:00Z") }).turnDeadline,
    ).toBe("2026-03-17T12:00:00.000Z")
    expect(
      serializeGameState(state, { turnDeadline: "2026-03-17T12:00:00.000Z" }).turnDeadline,
    ).toBe("2026-03-17T12:00:00.000Z")
    expect(serializeGameState(state).turnDeadline).toBeNull()
  })

  it("scopes legalMoves to viewer when set, shows all when spectator", () => {
    const state = makeState()
    const withViewer = serializeGameState(state, undefined, P1)
    expect(withViewer.legalMovesPerPlayer[P1]).toBeDefined()
    expect(withViewer.legalMovesPerPlayer[P2]).toBeUndefined()

    const spectator = serializeGameState(state)
    expect(spectator.legalMovesPerPlayer[P1]).toBeDefined()
    expect(spectator.legalMovesPerPlayer[P2]).toBeDefined()
  })

  it("sets viewerPlayerId in output", () => {
    const state = makeState()
    expect(serializeGameState(state, undefined, P1).viewerPlayerId).toBe(P1)
    expect(serializeGameState(state).viewerPlayerId).toBeNull()
  })

  it("includes winner: null when absent, player ID when set", () => {
    const state = makeState()
    expect(serializeGameState(state).winner).toBeNull()
    expect(serializeGameState({ ...state, winner: P1 }).winner).toBe(P1)
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
  it("shows peek cards to owner and spectator, hides from non-owner", () => {
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

    // Owner sees cards
    const asOwner = serializeGameState(state, undefined, P1)
    expect(asOwner.pendingTriggers[0]!.peekContext!.cards.length).toBeGreaterThan(0)

    // Non-owner sees empty cards
    const asNonOwner = serializeGameState(state, undefined, P2)
    expect(asNonOwner.pendingTriggers[0]!.peekContext!.cards).toEqual([])

    // Spectator sees cards
    const asSpectator = serializeGameState(state)
    expect(asSpectator.pendingTriggers[0]!.peekContext!.cards.length).toBeGreaterThan(0)
  })

  it("returns null peekContext when trigger has none", () => {
    const state = makeState()
    state.pendingTriggers = [
      {
        id: "t1",
        sourceCardInstanceId: "card-1",
        owningPlayerId: P1,
        effect: { type: "turn_trigger" as const, timing: "end" as const },
      },
    ]
    expect(serializeGameState(state, undefined, P1).pendingTriggers[0]!.peekContext).toBeNull()
  })
})
