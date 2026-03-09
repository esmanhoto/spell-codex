import { describe, test, expect, beforeEach } from "bun:test"
import { initGame } from "../src/init.ts"
import { applyMove, EngineError } from "../src/engine.ts"
import { getLegalMoves } from "../src/legal-moves.ts"
import { Phase } from "../src/types.ts"
import type { GameState, CardInstance } from "../src/types.ts"
import { _resetInstanceCounter } from "../src/utils.ts"
import type { CardData } from "../src/types.ts"
import {
  DEFAULT_CONFIG,
  CHAMPION_WIZARD_FR,
  CHAMPION_CLERIC_FR,
  REALM_GENERIC,
  EVENT_CARD,
} from "./fixtures.ts"

// A Phase-3 offensive wizard spell (castable in Pool phase)
const PHASE3_SPELL: CardData = {
  setId: "1st",
  cardNumber: 501,
  name: "Lightning Bolt",
  typeId: 19, // wizard spell
  worldId: 0,
  isAvatar: false,
  level: "+3",
  description: "Adds +3 to champion's level. (Off/3)",
  attributes: [],
  supportIds: [],
  castPhases: [3],
  effects: [],
}

beforeEach(() => {
  _resetInstanceCounter()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ci(instanceId: string, card: typeof CHAMPION_WIZARD_FR): CardInstance {
  return { instanceId, card }
}

/**
 * Build a state with p1 in Phase.Pool, a wizard in pool, and a spell/event in hand.
 * Optionally add realms to p2's formation.
 */
function buildPoolState(opts: {
  handCard: CardInstance
  poolChampion?: CardInstance
  p2Realms?: boolean
}): GameState {
  const s = initGame(DEFAULT_CONFIG)
  const wizard = opts.poolChampion ?? ci("wiz-1", CHAMPION_WIZARD_FR)
  return {
    ...s,
    phase: Phase.Pool,
    activePlayer: "p1",
    players: {
      ...s.players,
      p1: {
        ...s.players["p1"]!,
        hand: [opts.handCard],
        pool: [{ champion: wizard, attachments: [] }],
      },
      p2: opts.p2Realms
        ? {
            ...s.players["p2"]!,
            formation: {
              size: 6,
              slots: {
                A: { realm: ci("realm-p2-a", REALM_GENERIC), isRazed: false, holdings: [] },
                B: { realm: ci("realm-p2-b", REALM_GENERIC), isRazed: false, holdings: [] },
              },
            },
            pool: [{ champion: ci("champ-p2-1", CHAMPION_CLERIC_FR), attachments: [] }],
          }
        : s.players["p2"]!,
    },
  }
}

// ─── Opening resolution context ───────────────────────────────────────────────

describe("playing a spell/event opens resolution context", () => {
  test("PLAY_EVENT opens resolution context with void default destination", () => {
    const event = ci("ev-1", EVENT_CARD)
    const s = buildPoolState({ handCard: event })
    // Events can be played in any non-END_TURN phase
    const s2 = { ...s, phase: Phase.Pool }
    const { newState } = applyMove(s2, "p1", { type: "PLAY_EVENT", cardInstanceId: "ev-1" })

    expect(newState.resolutionContext).not.toBeNull()
    expect(newState.resolutionContext!.cardDestination).toBe("void")
    expect(newState.resolutionContext!.pendingCard.instanceId).toBe("ev-1")
    expect(newState.resolutionContext!.initiatingPlayer).toBe("p1")
    expect(newState.resolutionContext!.resolvingPlayer).toBe("p1")
    // Card removed from hand
    expect(newState.players["p1"]!.hand).toHaveLength(0)
  })

  test("PLAY_PHASE3_CARD opens resolution context with discard default destination", () => {
    const spell = ci("spell-1", PHASE3_SPELL)
    const s = buildPoolState({ handCard: spell })
    const { newState } = applyMove(s, "p1", { type: "PLAY_PHASE3_CARD", cardInstanceId: "spell-1" })

    expect(newState.resolutionContext).not.toBeNull()
    expect(newState.resolutionContext!.cardDestination).toBe("discard")
    expect(newState.resolutionContext!.pendingCard.instanceId).toBe("spell-1")
    // Card removed from hand
    expect(newState.players["p1"]!.hand).toHaveLength(0)
  })
})

// ─── Legal moves during resolution ───────────────────────────────────────────

describe("legal moves during resolution", () => {
  function openResolution(): GameState {
    const event = ci("ev-1", EVENT_CARD)
    const s = buildPoolState({ handCard: event, p2Realms: true })
    const { newState } = applyMove(s, "p1", { type: "PLAY_EVENT", cardInstanceId: "ev-1" })
    return newState
  }

  test("resolving player gets RESOLVE_* moves, not normal moves", () => {
    const s = openResolution()
    const moves = getLegalMoves(s, "p1")
    const types = new Set(moves.map((m) => m.type))

    expect(types.has("RESOLVE_DONE")).toBe(true)
    expect(types.has("RESOLVE_SET_CARD_DESTINATION")).toBe(true)
    // Normal moves blocked
    expect(types.has("PASS")).toBe(false)
    expect(types.has("PLAY_EVENT")).toBe(false)
    expect(types.has("PLACE_CHAMPION")).toBe(false)
  })

  test("non-resolving player gets no moves during resolution", () => {
    const s = openResolution()
    const moves = getLegalMoves(s, "p2")
    expect(moves).toHaveLength(0)
  })

  test("RESOLVE_SET_CARD_DESTINATION variants are included", () => {
    const s = openResolution()
    const moves = getLegalMoves(s, "p1")
    const destMoves = moves.filter((m) => m.type === "RESOLVE_SET_CARD_DESTINATION")
    const dests = destMoves.map((m) => (m as { destination: string }).destination)

    expect(dests).toContain("discard")
    expect(dests).toContain("abyss")
    expect(dests).toContain("void")
    expect(dests).toContain("in_play")
  })

  test("RESOLVE_RAZE_REALM included for each unrazed realm", () => {
    const s = openResolution()
    const moves = getLegalMoves(s, "p1")
    const razeMoves = moves.filter((m) => m.type === "RESOLVE_RAZE_REALM")
    // p2 has 2 unrazed realms (A, B)
    expect(razeMoves).toHaveLength(2)
  })
})

// ─── RESOLVE_SET_CARD_DESTINATION ─────────────────────────────────────────────

describe("RESOLVE_SET_CARD_DESTINATION", () => {
  function openResolution(): GameState {
    const event = ci("ev-1", EVENT_CARD)
    const s = buildPoolState({ handCard: event })
    return applyMove(s, "p1", { type: "PLAY_EVENT", cardInstanceId: "ev-1" }).newState
  }

  test("changes cardDestination in context", () => {
    const s = openResolution()
    expect(s.resolutionContext!.cardDestination).toBe("void")

    const { newState } = applyMove(s, "p1", {
      type: "RESOLVE_SET_CARD_DESTINATION",
      destination: "abyss",
    })
    expect(newState.resolutionContext!.cardDestination).toBe("abyss")
  })

  test("can set to in_play", () => {
    const s = openResolution()
    const { newState } = applyMove(s, "p1", {
      type: "RESOLVE_SET_CARD_DESTINATION",
      destination: "in_play",
    })
    expect(newState.resolutionContext!.cardDestination).toBe("in_play")
  })

  test("throws when no resolution context", () => {
    const s = initGame(DEFAULT_CONFIG)
    expect(() =>
      applyMove(s, "p1", { type: "RESOLVE_SET_CARD_DESTINATION", destination: "discard" }),
    ).toThrow(EngineError)
  })
})

// ─── RESOLVE_DONE ─────────────────────────────────────────────────────────────

describe("RESOLVE_DONE", () => {
  function openEventResolution(): GameState {
    const event = ci("ev-1", EVENT_CARD)
    const s = buildPoolState({ handCard: event })
    return applyMove(s, "p1", { type: "PLAY_EVENT", cardInstanceId: "ev-1" }).newState
  }

  function openSpellResolution(): GameState {
    const spell = ci("spell-1", PHASE3_SPELL)
    const s = buildPoolState({ handCard: spell })
    return applyMove(s, "p1", { type: "PLAY_PHASE3_CARD", cardInstanceId: "spell-1" }).newState
  }

  test("clears resolutionContext on done", () => {
    const s = openEventResolution()
    const { newState } = applyMove(s, "p1", { type: "RESOLVE_DONE" })
    expect(newState.resolutionContext).toBeNull()
  })

  test("places event in abyss (void destination)", () => {
    const s = openEventResolution()
    // default destination is "void" for events → goes to abyss
    const before = s.players["p1"]!.abyss.length
    const { newState } = applyMove(s, "p1", { type: "RESOLVE_DONE" })
    expect(newState.players["p1"]!.abyss.length).toBe(before + 1)
    expect(newState.players["p1"]!.abyss.some((c) => c.instanceId === "ev-1")).toBe(true)
  })

  test("places spell in discard (discard destination)", () => {
    const s = openSpellResolution()
    const before = s.players["p1"]!.discardPile.length
    const { newState } = applyMove(s, "p1", { type: "RESOLVE_DONE" })
    expect(newState.players["p1"]!.discardPile.length).toBe(before + 1)
    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "spell-1")).toBe(true)
  })

  test("places spell in lastingEffects when destination is in_play", () => {
    let s = openSpellResolution()
    s = applyMove(s, "p1", {
      type: "RESOLVE_SET_CARD_DESTINATION",
      destination: "in_play",
    }).newState
    const { newState } = applyMove(s, "p1", { type: "RESOLVE_DONE" })

    expect(newState.players["p1"]!.lastingEffects.some((c) => c.instanceId === "spell-1")).toBe(
      true,
    )
    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "spell-1")).toBe(false)
  })

  test("places card in abyss when destination is abyss", () => {
    let s = openEventResolution()
    s = applyMove(s, "p1", { type: "RESOLVE_SET_CARD_DESTINATION", destination: "abyss" }).newState
    const before = s.players["p1"]!.abyss.length
    const { newState } = applyMove(s, "p1", { type: "RESOLVE_DONE" })
    expect(newState.players["p1"]!.abyss.length).toBe(before + 1)
  })

  test("emits RESOLUTION_COMPLETED event", () => {
    const s = openEventResolution()
    const { events } = applyMove(s, "p1", { type: "RESOLVE_DONE" })
    const completedEvt = events.find((e) => e.type === "RESOLUTION_COMPLETED")
    expect(completedEvt).toBeDefined()
    expect((completedEvt as { destination: string }).destination).toBe("void")
  })

  test("throws when no resolution context", () => {
    const s = initGame(DEFAULT_CONFIG)
    expect(() => applyMove(s, "p1", { type: "RESOLVE_DONE" })).toThrow(EngineError)
  })
})

// ─── RESOLVE_RAZE_REALM ───────────────────────────────────────────────────────

describe("RESOLVE_RAZE_REALM", () => {
  function openWithP2Realms(): GameState {
    const event = ci("ev-1", EVENT_CARD)
    const s = buildPoolState({ handCard: event, p2Realms: true })
    return applyMove(s, "p1", { type: "PLAY_EVENT", cardInstanceId: "ev-1" }).newState
  }

  test("razes an unrazed realm", () => {
    const s = openWithP2Realms()
    const { newState } = applyMove(s, "p1", {
      type: "RESOLVE_RAZE_REALM",
      playerId: "p2",
      slot: "A",
    })
    expect(newState.players["p2"]!.formation.slots["A"]!.isRazed).toBe(true)
  })

  test("emits REALM_RAZED event", () => {
    const s = openWithP2Realms()
    const { events } = applyMove(s, "p1", {
      type: "RESOLVE_RAZE_REALM",
      playerId: "p2",
      slot: "A",
    })
    expect(events.some((e) => e.type === "REALM_RAZED")).toBe(true)
  })

  test("throws when slot already razed", () => {
    let s = openWithP2Realms()
    s = applyMove(s, "p1", { type: "RESOLVE_RAZE_REALM", playerId: "p2", slot: "A" }).newState
    expect(() =>
      applyMove(s, "p1", { type: "RESOLVE_RAZE_REALM", playerId: "p2", slot: "A" }),
    ).toThrow(EngineError)
  })

  test("zero-realm condition clears pool when all realms razed", () => {
    // p2 has 2 realms and 1 champion in pool; raze both → pool clears
    let s = openWithP2Realms()
    // Raze A
    s = applyMove(s, "p1", { type: "RESOLVE_RAZE_REALM", playerId: "p2", slot: "A" }).newState
    // Raze B — should trigger zero-realm
    const { newState } = applyMove(s, "p1", {
      type: "RESOLVE_RAZE_REALM",
      playerId: "p2",
      slot: "B",
    })
    expect(newState.players["p2"]!.pool).toHaveLength(0)
  })
})

// ─── RESOLVE_DRAW_CARDS ───────────────────────────────────────────────────────

describe("RESOLVE_DRAW_CARDS", () => {
  function openResolution(): GameState {
    const event = ci("ev-1", EVENT_CARD)
    const s = buildPoolState({ handCard: event })
    return applyMove(s, "p1", { type: "PLAY_EVENT", cardInstanceId: "ev-1" }).newState
  }

  test("draws cards into the target player's hand", () => {
    const s = openResolution()
    const before = s.players["p1"]!.hand.length
    const { newState } = applyMove(s, "p1", {
      type: "RESOLVE_DRAW_CARDS",
      playerId: "p1",
      count: 2,
    })
    expect(newState.players["p1"]!.hand.length).toBe(before + 2)
  })

  test("can draw for opponent", () => {
    const s = openResolution()
    const before = s.players["p2"]!.hand.length
    const { newState } = applyMove(s, "p1", {
      type: "RESOLVE_DRAW_CARDS",
      playerId: "p2",
      count: 1,
    })
    expect(newState.players["p2"]!.hand.length).toBe(before + 1)
  })

  test("throws for count < 1", () => {
    const s = openResolution()
    expect(() =>
      applyMove(s, "p1", { type: "RESOLVE_DRAW_CARDS", playerId: "p1", count: 0 }),
    ).toThrow(EngineError)
  })
})

// ─── RESOLVE_MOVE_CARD ────────────────────────────────────────────────────────

describe("RESOLVE_MOVE_CARD", () => {
  function openResolutionWithPoolChampion(): GameState {
    const event = ci("ev-1", EVENT_CARD)
    const s = buildPoolState({ handCard: event, p2Realms: true })
    return applyMove(s, "p1", { type: "PLAY_EVENT", cardInstanceId: "ev-1" }).newState
  }

  test("moves a pool champion to discard", () => {
    const s = openResolutionWithPoolChampion()
    // p1 has a wizard in pool (wiz-1)
    const { newState } = applyMove(s, "p1", {
      type: "RESOLVE_MOVE_CARD",
      cardInstanceId: "wiz-1",
      destination: { zone: "discard", playerId: "p1" },
    })
    expect(newState.players["p1"]!.pool.some((e) => e.champion.instanceId === "wiz-1")).toBe(false)
    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "wiz-1")).toBe(true)
  })

  test("moves a champion from discard to hand", () => {
    let s = openResolutionWithPoolChampion()
    // First move champion to discard
    s = applyMove(s, "p1", {
      type: "RESOLVE_MOVE_CARD",
      cardInstanceId: "wiz-1",
      destination: { zone: "discard", playerId: "p1" },
    }).newState
    const before = s.players["p1"]!.hand.length
    // Now move from discard to hand
    const { newState } = applyMove(s, "p1", {
      type: "RESOLVE_MOVE_CARD",
      cardInstanceId: "wiz-1",
      destination: { zone: "hand", playerId: "p1" },
    })
    expect(newState.players["p1"]!.hand.length).toBe(before + 1)
    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "wiz-1")).toBe(false)
  })

  test("moves a champion to limbo", () => {
    const s = openResolutionWithPoolChampion()
    const { newState } = applyMove(s, "p1", {
      type: "RESOLVE_MOVE_CARD",
      cardInstanceId: "wiz-1",
      destination: { zone: "limbo", playerId: "p1", returnsOnTurn: 3 },
    })
    expect(newState.players["p1"]!.pool.some((e) => e.champion.instanceId === "wiz-1")).toBe(false)
    const limboEntry = newState.players["p1"]!.limbo.find((e) => e.champion.instanceId === "wiz-1")
    expect(limboEntry).toBeDefined()
    expect(limboEntry!.returnsOnTurn).toBe(3)
  })

  test("emits CARD_ZONE_MOVED event", () => {
    const s = openResolutionWithPoolChampion()
    const { events } = applyMove(s, "p1", {
      type: "RESOLVE_MOVE_CARD",
      cardInstanceId: "wiz-1",
      destination: { zone: "discard", playerId: "p1" },
    })
    expect(events.some((e) => e.type === "CARD_ZONE_MOVED")).toBe(true)
  })

  test("throws when card not found", () => {
    const s = openResolutionWithPoolChampion()
    expect(() =>
      applyMove(s, "p1", {
        type: "RESOLVE_MOVE_CARD",
        cardInstanceId: "nonexistent",
        destination: { zone: "discard", playerId: "p1" },
      }),
    ).toThrow(EngineError)
  })
})

// ─── RESOLVE_RETURN_TO_POOL ───────────────────────────────────────────────────

describe("RESOLVE_RETURN_TO_POOL", () => {
  function openWithDiscardedChampion(): GameState {
    const event = ci("ev-1", EVENT_CARD)
    const wizard = ci("wiz-1", CHAMPION_WIZARD_FR)
    const s = buildPoolState({ handCard: event, poolChampion: wizard })
    let s2 = applyMove(s, "p1", { type: "PLAY_EVENT", cardInstanceId: "ev-1" }).newState
    // Move wizard to discard
    s2 = applyMove(s2, "p1", {
      type: "RESOLVE_MOVE_CARD",
      cardInstanceId: "wiz-1",
      destination: { zone: "discard", playerId: "p1" },
    }).newState
    return s2
  }

  test("returns a champion from discard to pool", () => {
    const s = openWithDiscardedChampion()
    expect(s.players["p1"]!.discardPile.some((c) => c.instanceId === "wiz-1")).toBe(true)

    const { newState } = applyMove(s, "p1", {
      type: "RESOLVE_RETURN_TO_POOL",
      cardInstanceId: "wiz-1",
    })
    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "wiz-1")).toBe(false)
    expect(newState.players["p1"]!.pool.some((e) => e.champion.instanceId === "wiz-1")).toBe(true)
  })

  test("emits CHAMPION_RETURNED_TO_POOL event", () => {
    const s = openWithDiscardedChampion()
    const { events } = applyMove(s, "p1", {
      type: "RESOLVE_RETURN_TO_POOL",
      cardInstanceId: "wiz-1",
    })
    expect(events.some((e) => e.type === "CHAMPION_RETURNED_TO_POOL")).toBe(true)
  })

  test("throws when card is not a champion", () => {
    const event = ci("ev-1", EVENT_CARD)
    const event2 = ci("ev-2", EVENT_CARD)
    const wizard = ci("wiz-1", CHAMPION_WIZARD_FR)
    const s = buildPoolState({ handCard: event, poolChampion: wizard })
    let s2 = applyMove(s, "p1", { type: "PLAY_EVENT", cardInstanceId: "ev-1" }).newState
    // Manually push a non-champion (event) to discard
    s2 = {
      ...s2,
      players: {
        ...s2.players,
        p1: {
          ...s2.players["p1"]!,
          discardPile: [...s2.players["p1"]!.discardPile, event2],
        },
      },
    }
    expect(() =>
      applyMove(s2, "p1", { type: "RESOLVE_RETURN_TO_POOL", cardInstanceId: "ev-2" }),
    ).toThrow(EngineError)
  })
})

// ─── Resolution blocks normal moves ──────────────────────────────────────────

describe("resolution blocks normal move dispatch", () => {
  test("normal moves are not in legal moves during resolution", () => {
    const event = ci("ev-1", EVENT_CARD)
    const s = buildPoolState({ handCard: event })
    const s2 = applyMove(s, "p1", { type: "PLAY_EVENT", cardInstanceId: "ev-1" }).newState
    expect(s2.resolutionContext).not.toBeNull()

    const moves = getLegalMoves(s2, "p1")
    const types = new Set(moves.map((m) => m.type))
    expect(types.has("PASS")).toBe(false)
    expect(types.has("END_TURN")).toBe(false)
    expect(types.has("PLAY_EVENT")).toBe(false)
    expect(types.has("PLACE_CHAMPION")).toBe(false)
  })
})

// ─── Events emitted correctly ─────────────────────────────────────────────────

describe("resolution events", () => {
  test("RESOLUTION_STARTED emitted when card is played", () => {
    const event = ci("ev-1", EVENT_CARD)
    const s = buildPoolState({ handCard: event })
    const { events } = applyMove(s, "p1", { type: "PLAY_EVENT", cardInstanceId: "ev-1" })
    expect(events.some((e) => e.type === "RESOLUTION_STARTED")).toBe(true)
  })

  test("RESOLUTION_COMPLETED emitted with correct destination after RESOLVE_DONE", () => {
    const spell = ci("spell-1", PHASE3_SPELL)
    let s = buildPoolState({ handCard: spell })
    s = applyMove(s, "p1", { type: "PLAY_PHASE3_CARD", cardInstanceId: "spell-1" }).newState
    s = applyMove(s, "p1", { type: "RESOLVE_SET_CARD_DESTINATION", destination: "abyss" }).newState
    const { events } = applyMove(s, "p1", { type: "RESOLVE_DONE" })

    const evt = events.find((e) => e.type === "RESOLUTION_COMPLETED")
    expect(evt).toBeDefined()
    expect((evt as { destination: string }).destination).toBe("abyss")
  })
})

// ─── Non-active player events out-of-combat ───────────────────────────────────

describe("non-active player events out-of-combat", () => {
  /** p1 is active; p2 has an event in hand. */
  function buildStateWithP2Event(phase: Phase): GameState {
    const s = initGame(DEFAULT_CONFIG)
    const event = ci("ev-p2", EVENT_CARD)
    return {
      ...s,
      phase,
      activePlayer: "p1",
      players: {
        ...s.players,
        p2: { ...s.players["p2"]!, hand: [event] },
      },
    }
  }

  test("non-active player gets PLAY_EVENT during PlayRealm", () => {
    const moves = getLegalMoves(buildStateWithP2Event(Phase.PlayRealm), "p2")
    expect(moves.some((m) => m.type === "PLAY_EVENT")).toBe(true)
  })

  test("non-active player gets PLAY_EVENT during Pool", () => {
    const moves = getLegalMoves(buildStateWithP2Event(Phase.Pool), "p2")
    expect(moves.some((m) => m.type === "PLAY_EVENT")).toBe(true)
  })

  test("non-active player gets PLAY_EVENT during Combat", () => {
    const moves = getLegalMoves(buildStateWithP2Event(Phase.Combat), "p2")
    expect(moves.some((m) => m.type === "PLAY_EVENT")).toBe(true)
  })

  test("non-active player gets PLAY_EVENT during PhaseFive", () => {
    const moves = getLegalMoves(buildStateWithP2Event(Phase.PhaseFive), "p2")
    expect(moves.some((m) => m.type === "PLAY_EVENT")).toBe(true)
  })

  test("non-active player gets PLAY_EVENT at StartOfTurn", () => {
    const moves = getLegalMoves(buildStateWithP2Event(Phase.StartOfTurn), "p2")
    expect(moves.some((m) => m.type === "PLAY_EVENT")).toBe(true)
  })

  test("non-active player only gets events (no normal moves) out-of-combat", () => {
    const event = ci("ev-p2", EVENT_CARD)
    const realm = ci("realm-p2", REALM_GENERIC)
    const s = initGame(DEFAULT_CONFIG)
    const withCards = {
      ...s,
      phase: Phase.Pool,
      activePlayer: "p1",
      players: { ...s.players, p2: { ...s.players["p2"]!, hand: [event, realm] } },
    }
    const moves = getLegalMoves(withCards, "p2")
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.every((m) => m.type === "PLAY_EVENT")).toBe(true)
  })

  test("non-active player can successfully applyMove PLAY_EVENT during opponent's turn", () => {
    const s = buildStateWithP2Event(Phase.Pool)
    const { newState } = applyMove(s, "p2", { type: "PLAY_EVENT", cardInstanceId: "ev-p2" })
    expect(newState.resolutionContext).not.toBeNull()
    expect(newState.resolutionContext!.initiatingPlayer).toBe("p2")
    expect(newState.resolutionContext!.resolvingPlayer).toBe("p2")
    expect(newState.players["p2"]!.hand).toHaveLength(0)
  })
})
