import { describe, test, expect, beforeEach } from "bun:test"
import { initGame } from "../src/init.ts"
import { applyMove, EngineError } from "../src/engine.ts"
import { getLegalMoves } from "../src/legal-moves.ts"
import { populateTriggers } from "../src/triggers.ts"
import { Phase } from "../src/types.ts"
import type { GameState, CardInstance, CardData } from "../src/types.ts"
import { _resetInstanceCounter } from "../src/utils.ts"
import {
  DEFAULT_CONFIG,
  REALM_FR,
  REALM_GENERIC,
  CHAMPION_WIZARD_FR,
  CHAMPION_HERO_GENERIC,
  HOLDING_FR,
  ALLY_PLUS4,
  makeDeck,
} from "./fixtures.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

// ─── Trigger card fixtures ────────────────────────────────────────────────────

const CHAMPION_START_TRIGGER: CardData = {
  setId: "1st",
  cardNumber: 999,
  name: "Marco Volo",
  typeId: 7,
  worldId: 1,
  isAvatar: false,
  level: 4,
  description: "At start of turn, peek top card of opponent's draw pile.",
  attributes: [],
  supportIds: [],
  effects: [{ type: "turn_trigger", timing: "start" }],
}

const CHAMPION_END_TRIGGER: CardData = {
  setId: "1st",
  cardNumber: 998,
  name: "Hettman Tsurin",
  typeId: 7,
  worldId: 1,
  isAvatar: false,
  level: 6,
  description: "At end of turn, discard a card from opponent's hand.",
  attributes: [],
  supportIds: [],
  effects: [{ type: "turn_trigger", timing: "end" }],
}

const ATTACHMENT_START_TRIGGER: CardData = {
  setId: "1st",
  cardNumber: 997,
  name: "Ring of All Seeing",
  typeId: 9,
  worldId: 0,
  isAvatar: false,
  level: null,
  description: "At start of turn, peek opponent's hand.",
  attributes: [],
  supportIds: [],
  effects: [{ type: "turn_trigger", timing: "start" }],
}

const REALM_START_TRIGGER: CardData = {
  setId: "1st",
  cardNumber: 996,
  name: "The Scarlet Brotherhood",
  typeId: 13,
  worldId: 2,
  isAvatar: false,
  level: null,
  description: "At start of turn, raze one of your realms.",
  attributes: [],
  supportIds: [],
  effects: [{ type: "turn_trigger", timing: "start" }],
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Advance from START_OF_TURN to the given phase via PASS. */
function advanceTo(state: GameState, phase: Phase): GameState {
  const phases = [Phase.StartOfTurn, Phase.PlayRealm, Phase.Pool, Phase.Combat, Phase.PhaseFive]
  const target = phases.indexOf(phase)
  const current = phases.indexOf(state.phase as Phase)
  let s = state
  for (let i = current; i < target; i++) {
    s = applyMove(s, s.activePlayer, { type: "PASS" }).newState
  }
  return s
}

/** Build a state with the given champion in p1's pool. */
function withChampionInPool(state: GameState, champion: CardData, attachments: CardData[] = []): GameState {
  const champInstance: CardInstance = { instanceId: "trigger-champ-1", card: champion }
  const attInstances: CardInstance[] = attachments.map((a, i) => ({ instanceId: `trigger-att-${i}`, card: a }))
  const p1 = state.players["p1"]!
  return {
    ...state,
    players: {
      ...state.players,
      p1: {
        ...p1,
        pool: [...p1.pool, { champion: champInstance, attachments: attInstances }],
      },
    },
  }
}

/** Build a state with p2 having specific cards in hand. */
function withP2Hand(state: GameState, cards: CardInstance[]): GameState {
  const p2 = state.players["p2"]!
  return {
    ...state,
    players: {
      ...state.players,
      p2: { ...p2, hand: cards },
    },
  }
}

/** Build a state with p2 having specific draw pile. */
function withP2DrawPile(state: GameState, cards: CardInstance[]): GameState {
  const p2 = state.players["p2"]!
  return {
    ...state,
    players: {
      ...state.players,
      p2: { ...p2, drawPile: cards },
    },
  }
}

const makeCard = (instanceId: string, card: CardData = ALLY_PLUS4): CardInstance => ({ instanceId, card })

// ─── populateTriggers ─────────────────────────────────────────────────────────

describe("populateTriggers", () => {
  test("queues start trigger from champion in pool", () => {
    let s = initGame(DEFAULT_CONFIG)
    s = withChampionInPool(s, CHAMPION_START_TRIGGER)
    const events: GameState["events"] = []
    const next = populateTriggers(s, "start", events)
    expect(next.pendingTriggers).toHaveLength(1)
    expect(next.pendingTriggers[0]!.sourceCardInstanceId).toBe("trigger-champ-1")
    expect(next.pendingTriggers[0]!.effect.timing).toBe("start")
    expect(next.pendingTriggers[0]!.owningPlayerId).toBe("p1")
  })

  test("queues start trigger from attachment on champion", () => {
    let s = initGame(DEFAULT_CONFIG)
    s = withChampionInPool(s, CHAMPION_WIZARD_FR, [ATTACHMENT_START_TRIGGER])
    const events: GameState["events"] = []
    const next = populateTriggers(s, "start", events)
    expect(next.pendingTriggers).toHaveLength(1)
    expect(next.pendingTriggers[0]!.sourceCardInstanceId).toBe("trigger-att-0")
  })

  test("queues trigger from formation realm", () => {
    let s = initGame(DEFAULT_CONFIG)
    // Place realm with trigger in formation
    const realmInst: CardInstance = { instanceId: "trigger-realm-1", card: REALM_START_TRIGGER }
    const p1 = s.players["p1"]!
    s = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...p1,
          formation: {
            ...p1.formation,
            slots: { ...p1.formation.slots, A: { realm: realmInst, holdings: [], isRazed: false } },
          },
        },
      },
    }
    const events: GameState["events"] = []
    const next = populateTriggers(s, "start", events)
    expect(next.pendingTriggers).toHaveLength(1)
    expect(next.pendingTriggers[0]!.sourceCardInstanceId).toBe("trigger-realm-1")
  })

  test("does not queue trigger from razed realm", () => {
    let s = initGame(DEFAULT_CONFIG)
    const realmInst: CardInstance = { instanceId: "trigger-realm-1", card: REALM_START_TRIGGER }
    const p1 = s.players["p1"]!
    s = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...p1,
          formation: {
            ...p1.formation,
            slots: { ...p1.formation.slots, A: { realm: realmInst, holdings: [], isRazed: true } },
          },
        },
      },
    }
    const events: GameState["events"] = []
    const next = populateTriggers(s, "start", events)
    expect(next.pendingTriggers).toHaveLength(0)
  })

  test("does not queue end trigger when scanning for start", () => {
    let s = initGame(DEFAULT_CONFIG)
    s = withChampionInPool(s, CHAMPION_END_TRIGGER)
    const events: GameState["events"] = []
    const next = populateTriggers(s, "start", events)
    expect(next.pendingTriggers).toHaveLength(0)
  })

  test("queues multiple triggers from multiple cards", () => {
    let s = initGame(DEFAULT_CONFIG)
    const champ1: CardInstance = { instanceId: "t-champ-1", card: CHAMPION_START_TRIGGER }
    const champ2: CardInstance = { instanceId: "t-champ-2", card: CHAMPION_START_TRIGGER }
    const p1 = s.players["p1"]!
    s = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...p1,
          pool: [
            ...p1.pool,
            { champion: champ1, attachments: [] },
            { champion: champ2, attachments: [] },
          ],
        },
      },
    }
    const events: GameState["events"] = []
    const next = populateTriggers(s, "start", events)
    expect(next.pendingTriggers).toHaveLength(2)
  })

  test("returns same state when no triggers found", () => {
    const s = initGame(DEFAULT_CONFIG)
    const events: GameState["events"] = []
    const next = populateTriggers(s, "start", events)
    expect(next).toBe(s) // reference equality — no copy made
  })
})

// ─── RESOLVE_TRIGGER_PEEK (draw pile) ─────────────────────────────────────────

describe("RESOLVE_TRIGGER_PEEK draw_pile", () => {
  function makeStateWithStartTrigger(): GameState {
    let s = initGame(DEFAULT_CONFIG)
    s = withChampionInPool(s, CHAMPION_START_TRIGGER)
    const events: GameState["events"] = []
    s = populateTriggers(s, "start", events)
    // Give p2 a known draw pile
    s = withP2DrawPile(s, [makeCard("dp-1"), makeCard("dp-2"), makeCard("dp-3")])
    return s
  }

  test("peek removes cards from top of draw pile", () => {
    const s = makeStateWithStartTrigger()
    const { newState } = applyMove(s, "p1", {
      type: "RESOLVE_TRIGGER_PEEK",
      source: "draw_pile",
      targetPlayerId: "p2",
      count: 2,
    })
    expect(newState.players["p2"]!.drawPile).toHaveLength(1)
    expect(newState.players["p2"]!.drawPile[0]!.instanceId).toBe("dp-3")
  })

  test("peek stores cards in trigger peekContext", () => {
    const s = makeStateWithStartTrigger()
    const { newState } = applyMove(s, "p1", {
      type: "RESOLVE_TRIGGER_PEEK",
      source: "draw_pile",
      targetPlayerId: "p2",
      count: 2,
    })
    const peek = newState.pendingTriggers[0]!.peekContext!
    expect(peek.source).toBe("draw_pile")
    expect(peek.targetPlayerId).toBe("p2")
    expect(peek.cards).toHaveLength(2)
    expect(peek.cards[0]!.instanceId).toBe("dp-1")
    expect(peek.cards[1]!.instanceId).toBe("dp-2")
  })

  test("defaults to 1 card when count omitted", () => {
    const s = makeStateWithStartTrigger()
    const { newState } = applyMove(s, "p1", {
      type: "RESOLVE_TRIGGER_PEEK",
      source: "draw_pile",
      targetPlayerId: "p2",
    })
    expect(newState.players["p2"]!.drawPile).toHaveLength(2)
    expect(newState.pendingTriggers[0]!.peekContext!.cards).toHaveLength(1)
  })

  test("throws when draw pile is empty", () => {
    let s = makeStateWithStartTrigger()
    s = withP2DrawPile(s, [])
    expect(() =>
      applyMove(s, "p1", {
        type: "RESOLVE_TRIGGER_PEEK",
        source: "draw_pile",
        targetPlayerId: "p2",
        count: 1,
      }),
    ).toThrow(EngineError)
  })

  test("non-owner cannot peek", () => {
    const s = makeStateWithStartTrigger()
    expect(() =>
      applyMove(s, "p2", {
        type: "RESOLVE_TRIGGER_PEEK",
        source: "draw_pile",
        targetPlayerId: "p2",
        count: 1,
      }),
    ).toThrow(EngineError)
  })
})

// ─── RESOLVE_TRIGGER_PEEK (hand) ──────────────────────────────────────────────

describe("RESOLVE_TRIGGER_PEEK hand", () => {
  function makeStateWithStartTrigger(): GameState {
    let s = initGame(DEFAULT_CONFIG)
    s = withChampionInPool(s, CHAMPION_START_TRIGGER)
    const events: GameState["events"] = []
    s = populateTriggers(s, "start", events)
    s = withP2Hand(s, [makeCard("h-1"), makeCard("h-2")])
    return s
  }

  test("hand peek copies cards without removing them", () => {
    const s = makeStateWithStartTrigger()
    const { newState } = applyMove(s, "p1", {
      type: "RESOLVE_TRIGGER_PEEK",
      source: "hand",
      targetPlayerId: "p2",
    })
    // Original hand untouched
    expect(newState.players["p2"]!.hand).toHaveLength(2)
    // Peek context has copies
    const peek = newState.pendingTriggers[0]!.peekContext!
    expect(peek.source).toBe("hand")
    expect(peek.cards).toHaveLength(2)
  })
})

// ─── RESOLVE_TRIGGER_DISCARD_PEEKED ──────────────────────────────────────────

describe("RESOLVE_TRIGGER_DISCARD_PEEKED", () => {
  function makeStateWithOpenPeek(): GameState {
    let s = initGame(DEFAULT_CONFIG)
    s = withChampionInPool(s, CHAMPION_START_TRIGGER)
    const events: GameState["events"] = []
    s = populateTriggers(s, "start", events)
    s = withP2DrawPile(s, [makeCard("dp-1"), makeCard("dp-2"), makeCard("dp-3")])
    const { newState } = applyMove(s, "p1", {
      type: "RESOLVE_TRIGGER_PEEK",
      source: "draw_pile",
      targetPlayerId: "p2",
      count: 2,
    })
    return newState
  }

  test("discards the selected card from peek context to target's discard pile", () => {
    const s = makeStateWithOpenPeek()
    const { newState } = applyMove(s, "p1", {
      type: "RESOLVE_TRIGGER_DISCARD_PEEKED",
      cardInstanceId: "dp-1",
    })
    const p2 = newState.players["p2"]!
    expect(p2.discardPile.some((c) => c.instanceId === "dp-1")).toBe(true)
    // Remaining peeked card still in context
    const peek = newState.pendingTriggers[0]!.peekContext!
    expect(peek.cards).toHaveLength(1)
    expect(peek.cards[0]!.instanceId).toBe("dp-2")
  })

  test("throws when card not in peek", () => {
    const s = makeStateWithOpenPeek()
    expect(() =>
      applyMove(s, "p1", { type: "RESOLVE_TRIGGER_DISCARD_PEEKED", cardInstanceId: "nonexistent" }),
    ).toThrow(EngineError)
  })

  test("throws when source is hand (not draw_pile)", () => {
    let s = initGame(DEFAULT_CONFIG)
    s = withChampionInPool(s, CHAMPION_START_TRIGGER)
    const events: GameState["events"] = []
    s = populateTriggers(s, "start", events)
    s = withP2Hand(s, [makeCard("h-1")])
    const { newState } = applyMove(s, "p1", {
      type: "RESOLVE_TRIGGER_PEEK",
      source: "hand",
      targetPlayerId: "p2",
    })
    expect(() =>
      applyMove(newState, "p1", { type: "RESOLVE_TRIGGER_DISCARD_PEEKED", cardInstanceId: "h-1" }),
    ).toThrow(EngineError)
  })
})

// ─── RESOLVE_TRIGGER_DONE ─────────────────────────────────────────────────────

describe("RESOLVE_TRIGGER_DONE", () => {
  test("dismisses trigger and removes from queue", () => {
    let s = initGame(DEFAULT_CONFIG)
    s = withChampionInPool(s, CHAMPION_START_TRIGGER)
    const events: GameState["events"] = []
    s = populateTriggers(s, "start", events)
    expect(s.pendingTriggers).toHaveLength(1)
    const { newState } = applyMove(s, "p1", { type: "RESOLVE_TRIGGER_DONE" })
    expect(newState.pendingTriggers).toHaveLength(0)
  })

  test("returns peeked draw pile cards to top of target's draw pile", () => {
    let s = initGame(DEFAULT_CONFIG)
    s = withChampionInPool(s, CHAMPION_START_TRIGGER)
    const events: GameState["events"] = []
    s = populateTriggers(s, "start", events)
    s = withP2DrawPile(s, [makeCard("dp-1"), makeCard("dp-2")])
    // Peek 1 card
    const { newState: afterPeek } = applyMove(s, "p1", {
      type: "RESOLVE_TRIGGER_PEEK",
      source: "draw_pile",
      targetPlayerId: "p2",
      count: 1,
    })
    // dp-1 removed from pile during peek; dp-2 remains
    expect(afterPeek.players["p2"]!.drawPile).toHaveLength(1)
    // Done without discarding → dp-1 goes back to top
    const { newState: afterDone } = applyMove(afterPeek, "p1", { type: "RESOLVE_TRIGGER_DONE" })
    const pile = afterDone.players["p2"]!.drawPile
    expect(pile).toHaveLength(2)
    expect(pile[0]!.instanceId).toBe("dp-1") // returned to top
    expect(pile[1]!.instanceId).toBe("dp-2")
  })

  test("non-owner cannot resolve trigger", () => {
    let s = initGame(DEFAULT_CONFIG)
    s = withChampionInPool(s, CHAMPION_START_TRIGGER)
    const events: GameState["events"] = []
    s = populateTriggers(s, "start", events)
    expect(() => applyMove(s, "p2", { type: "RESOLVE_TRIGGER_DONE" })).toThrow(EngineError)
  })
})

// ─── RESOLVE_TRIGGER_DISCARD_FROM_HAND ────────────────────────────────────────

describe("RESOLVE_TRIGGER_DISCARD_FROM_HAND", () => {
  test("removes one card from target hand and adds to discard", () => {
    let s = initGame(DEFAULT_CONFIG)
    s = withChampionInPool(s, CHAMPION_END_TRIGGER)
    const events: GameState["events"] = []
    s = populateTriggers(s, "end", events)
    s = withP2Hand(s, [makeCard("h-1"), makeCard("h-2"), makeCard("h-3")])
    const { newState } = applyMove(s, "p1", {
      type: "RESOLVE_TRIGGER_DISCARD_FROM_HAND",
      targetPlayerId: "p2",
    })
    const p2 = newState.players["p2"]!
    expect(p2.hand).toHaveLength(2)
    expect(p2.discardPile).toHaveLength(1)
    // Trigger dismissed after action
    expect(newState.pendingTriggers).toHaveLength(0)
  })

  test("throws when target has empty hand", () => {
    let s = initGame(DEFAULT_CONFIG)
    s = withChampionInPool(s, CHAMPION_END_TRIGGER)
    const events: GameState["events"] = []
    s = populateTriggers(s, "end", events)
    s = withP2Hand(s, [])
    expect(() =>
      applyMove(s, "p1", {
        type: "RESOLVE_TRIGGER_DISCARD_FROM_HAND",
        targetPlayerId: "p2",
      }),
    ).toThrow(EngineError)
  })
})

// ─── RAZE_OWN_REALM ───────────────────────────────────────────────────────────

describe("RAZE_OWN_REALM", () => {
  /** Build a state with p1 having a realm at slot A (optionally with holdings). */
  function withRealmAtA(state: GameState, holdings: CardData[] = []): GameState {
    const realmInst: CardInstance = { instanceId: "own-realm-1", card: REALM_FR }
    const holdingInsts: CardInstance[] = holdings.map((h, i) => ({ instanceId: `own-holding-${i}`, card: h }))
    const p1 = state.players["p1"]!
    return {
      ...state,
      players: {
        ...state.players,
        p1: {
          ...p1,
          formation: {
            ...p1.formation,
            slots: {
              ...p1.formation.slots,
              A: { realm: realmInst, holdings: holdingInsts, isRazed: false },
            },
          },
        },
      },
    }
  }

  test("RAZE_OWN_REALM is legal in START_OF_TURN when realm exists", () => {
    let s = initGame(DEFAULT_CONFIG)
    s = withRealmAtA(s)
    const moves = getLegalMoves(s, "p1")
    expect(moves.some((m) => m.type === "RAZE_OWN_REALM" && (m as { slot: string }).slot === "A")).toBe(true)
  })

  test("RAZE_OWN_REALM is legal in POOL phase", () => {
    let s = initGame(DEFAULT_CONFIG)
    s = withRealmAtA(s)
    s = advanceTo(s, Phase.Pool)
    const moves = getLegalMoves(s, "p1")
    expect(moves.some((m) => m.type === "RAZE_OWN_REALM" && (m as { slot: string }).slot === "A")).toBe(true)
  })

  test("RAZE_OWN_REALM is legal in PHASE_FIVE", () => {
    let s = initGame(DEFAULT_CONFIG)
    s = withRealmAtA(s)
    s = advanceTo(s, Phase.PhaseFive)
    const moves = getLegalMoves(s, "p1")
    expect(moves.some((m) => m.type === "RAZE_OWN_REALM" && (m as { slot: string }).slot === "A")).toBe(true)
  })

  test("handler marks realm as razed", () => {
    let s = initGame(DEFAULT_CONFIG)
    s = withRealmAtA(s)
    const { newState } = applyMove(s, "p1", { type: "RAZE_OWN_REALM", slot: "A" })
    expect(newState.players["p1"]!.formation.slots["A"]!.isRazed).toBe(true)
  })

  test("handler discards holdings to discard pile", () => {
    let s = initGame(DEFAULT_CONFIG)
    s = withRealmAtA(s, [HOLDING_FR])
    const discardBefore = s.players["p1"]!.discardPile.length
    const { newState } = applyMove(s, "p1", { type: "RAZE_OWN_REALM", slot: "A" })
    const p1 = newState.players["p1"]!
    expect(p1.formation.slots["A"]!.holdings).toHaveLength(0)
    expect(p1.discardPile.length).toBe(discardBefore + 1)
  })

  test("throws when realm is already razed", () => {
    let s = initGame(DEFAULT_CONFIG)
    const realmInst: CardInstance = { instanceId: "own-realm-razed", card: REALM_FR }
    const p1 = s.players["p1"]!
    s = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...p1,
          formation: {
            ...p1.formation,
            slots: { ...p1.formation.slots, A: { realm: realmInst, holdings: [], isRazed: true } },
          },
        },
      },
    }
    expect(() => applyMove(s, "p1", { type: "RAZE_OWN_REALM", slot: "A" })).toThrow(EngineError)
  })

  test("throws when slot is empty", () => {
    const s = initGame(DEFAULT_CONFIG)
    expect(() => applyMove(s, "p1", { type: "RAZE_OWN_REALM", slot: "A" })).toThrow(EngineError)
  })
})

// ─── Voluntary DISCARD_CARD in Phase 5 ───────────────────────────────────────

describe("voluntary DISCARD_CARD in Phase 5", () => {
  test("DISCARD_CARD is legal when hand size is at or under limit", () => {
    const config: typeof DEFAULT_CONFIG = {
      ...DEFAULT_CONFIG,
      players: [
        { id: "p1", deckCards: makeDeck([REALM_FR, CHAMPION_WIZARD_FR, CHAMPION_HERO_GENERIC, ALLY_PLUS4]) },
        { id: "p2", deckCards: makeDeck([REALM_GENERIC, CHAMPION_HERO_GENERIC]) },
      ] as [{ id: string; deckCards: CardData[] }, { id: string; deckCards: CardData[] }],
    }
    let s = initGame(config)
    s = advanceTo(s, Phase.PhaseFive)
    const p1 = s.players["p1"]!
    // Confirm hand is within limit (≤8 for 55-card format)
    expect(p1.hand.length).toBeLessThanOrEqual(8)
    const moves = getLegalMoves(s, "p1")
    const discardMoves = moves.filter((m) => m.type === "DISCARD_CARD")
    expect(discardMoves.length).toBe(p1.hand.length)
  })

  test("END_TURN is also available alongside voluntary discard", () => {
    let s = initGame(DEFAULT_CONFIG)
    s = advanceTo(s, Phase.PhaseFive)
    const p1 = s.players["p1"]!
    expect(p1.hand.length).toBeLessThanOrEqual(8)
    const moves = getLegalMoves(s, "p1")
    expect(moves.some((m) => m.type === "END_TURN")).toBe(true)
    expect(moves.some((m) => m.type === "DISCARD_CARD")).toBe(true)
  })

  test("voluntary DISCARD_CARD executes without error", () => {
    let s = initGame(DEFAULT_CONFIG)
    s = advanceTo(s, Phase.PhaseFive)
    const p1 = s.players["p1"]!
    expect(p1.hand.length).toBeGreaterThan(0)
    const cardId = p1.hand[0]!.instanceId
    const handBefore = p1.hand.length
    const { newState } = applyMove(s, "p1", { type: "DISCARD_CARD", cardInstanceId: cardId })
    expect(newState.players["p1"]!.hand.length).toBe(handBefore - 1)
  })
})
