import { describe, test, expect, beforeEach } from "bun:test"
import { initGame } from "../../src/init.ts"
import { applyMove } from "../../src/engine.ts"
import { getLegalMoves } from "../../src/legal-moves.ts"
import { Phase } from "../../src/types.ts"
import type { GameState, CardInstance, ResolutionDeclaration } from "../../src/types.ts"
import { _resetInstanceCounter } from "../../src/utils.ts"
import {
  DEFAULT_CONFIG,
  CHAMPION_WIZARD_FR,
  CHAMPION_CLERIC_FR,
  REALM_GENERIC,
  EVENT_CARD,
} from "../fixtures.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

function ci(instanceId: string, card: typeof CHAMPION_WIZARD_FR): CardInstance {
  return { instanceId, card }
}

/** p1 plays event, no counter cards. */
function buildNoCounter(): GameState {
  const s = initGame(DEFAULT_CONFIG)
  const state: GameState = {
    ...s,
    phase: Phase.Pool,
    activePlayer: "p1",
    players: {
      ...s.players,
      p1: {
        ...s.players["p1"]!,
        hand: [ci("ev-1", EVENT_CARD)],
        pool: [{ champion: ci("wiz-1", CHAMPION_WIZARD_FR), attachments: [] }],
      },
      p2: {
        ...s.players["p2"]!,
        formation: {
          size: 6,
          slots: {
            A: { realm: ci("realm-p2-a", REALM_GENERIC), isRazed: false, holdings: [] },
          },
        },
        pool: [{ champion: ci("champ-p2", CHAMPION_CLERIC_FR), attachments: [] }],
      },
    },
  }
  return applyMove(state, "p1", { type: "PLAY_EVENT", cardInstanceId: "ev-1" }).newState
}

// ─── RESOLVE_DONE with declarations clears context immediately ───────────────

describe("RESOLVE_DONE with declarations", () => {
  test("clears resolution context immediately", () => {
    const s = buildNoCounter()
    const decls: ResolutionDeclaration[] = [
      { action: "raze_realm", playerId: "p2", slot: "A" as const, realmName: "Village" },
    ]
    const { newState } = applyMove(s, "p1", { type: "RESOLVE_DONE", declarations: decls })
    expect(newState.resolutionContext).toBeNull()
  })

  test("emits RESOLUTION_COMPLETED with declarations", () => {
    const s = buildNoCounter()
    const decls: ResolutionDeclaration[] = [
      { action: "raze_realm", playerId: "p2", slot: "A" as const, realmName: "Village" },
      { action: "draw_cards", playerId: "p2", count: 2 },
    ]
    const { events } = applyMove(s, "p1", { type: "RESOLVE_DONE", declarations: decls })
    const completed = events.find((e) => e.type === "RESOLUTION_COMPLETED")
    expect(completed).toBeDefined()
    expect((completed as Extract<typeof completed, { type: "RESOLUTION_COMPLETED" }>)?.declarations).toHaveLength(2)
    expect(
      (completed as Extract<typeof completed, { type: "RESOLUTION_COMPLETED" }>)?.declarations?.[0]?.action,
    ).toBe("raze_realm")
  })

  test("RESOLUTION_COMPLETED includes empty declarations array when none passed", () => {
    const s = buildNoCounter()
    const { events } = applyMove(s, "p1", { type: "RESOLVE_DONE" })
    const completed = events.find((e) => e.type === "RESOLUTION_COMPLETED")
    expect(completed).toBeDefined()
    // declarations field is present but undefined or empty — no opponent action required
    const decls = (completed as Extract<typeof completed, { type: "RESOLUTION_COMPLETED" }>)
      ?.declarations
    expect(!decls || decls.length === 0).toBe(true)
  })
})

// ─── No-declaration flow clears immediately ──────────────────────────────────

describe("no-declaration RESOLVE_DONE clears context immediately", () => {
  test("RESOLVE_DONE without declarations clears context", () => {
    const s = buildNoCounter()
    const { newState } = applyMove(s, "p1", { type: "RESOLVE_DONE" })
    expect(newState.resolutionContext).toBeNull()
  })

  test("spell card placed in destination after RESOLVE_DONE", () => {
    const s = buildNoCounter()
    // default for events is "void" → abyss
    const before = s.players["p1"]!.abyss.length
    const { newState } = applyMove(s, "p1", { type: "RESOLVE_DONE" })
    expect(newState.players["p1"]!.abyss.length).toBe(before + 1)
  })
})

// ─── Self-affecting RESOLVE_* moves during resolution ────────────────────────

describe("self-affecting RESOLVE_* moves during resolution", () => {
  test("RESOLVE_DRAW_CARDS for self works", () => {
    const s = buildNoCounter()
    const before = s.players["p1"]!.hand.length
    const { newState } = applyMove(s, "p1", {
      type: "RESOLVE_DRAW_CARDS",
      playerId: "p1",
      count: 2,
    })
    expect(newState.players["p1"]!.hand.length).toBe(before + 2)
  })

  test("RESOLVE_RAZE_REALM for own realm works", () => {
    const base = initGame(DEFAULT_CONFIG)
    const state: GameState = {
      ...base,
      phase: Phase.Pool,
      activePlayer: "p1",
      players: {
        ...base.players,
        p1: {
          ...base.players["p1"]!,
          hand: [ci("ev-1", EVENT_CARD)],
          pool: [{ champion: ci("wiz-1", CHAMPION_WIZARD_FR), attachments: [] }],
          formation: {
            size: 6,
            slots: {
              A: { realm: ci("realm-p1", REALM_GENERIC), isRazed: false, holdings: [] },
            },
          },
        },
      },
    }
    let s = applyMove(state, "p1", { type: "PLAY_EVENT", cardInstanceId: "ev-1" }).newState
    const { newState } = applyMove(s, "p1", {
      type: "RESOLVE_RAZE_REALM",
      playerId: "p1",
      slot: "A",
    })
    expect(newState.players["p1"]!.formation.slots["A"]!.isRazed).toBe(true)
  })
})

// ─── Legal moves for resolver ────────────────────────────────────────────────

describe("resolution legal moves", () => {
  test("RESOLVE_DONE is in legal moves during resolution", () => {
    const s = buildNoCounter()
    const moves = getLegalMoves(s, "p1")
    expect(moves.some((m) => m.type === "RESOLVE_DONE")).toBe(true)
  })

  test("RESOLVE_RAZE_REALM not offered for opponent realms", () => {
    const s = buildNoCounter()
    const moves = getLegalMoves(s, "p1")
    const razeMoves = moves.filter((m) => m.type === "RESOLVE_RAZE_REALM")
    // p2 has realm A but it should NOT appear in legal moves
    expect(razeMoves.every((m) => (m as { playerId: string }).playerId === "p1")).toBe(true)
  })

  test("RESOLVE_DRAW_CARDS not offered for opponent", () => {
    const s = buildNoCounter()
    const moves = getLegalMoves(s, "p1")
    const drawMoves = moves.filter((m) => m.type === "RESOLVE_DRAW_CARDS")
    expect(drawMoves.every((m) => (m as { playerId: string }).playerId === "p1")).toBe(true)
  })

  test("RESOLVE_RETURN_TO_POOL not offered for opponent discard", () => {
    const s = buildNoCounter()
    const moves = getLegalMoves(s, "p1")
    const returnMoves = moves.filter((m) => m.type === "RESOLVE_RETURN_TO_POOL")
    for (const m of returnMoves) {
      const cardId = (m as { cardInstanceId: string }).cardInstanceId
      expect(s.players["p1"]!.discardPile.some((c) => c.instanceId === cardId)).toBe(true)
    }
  })

  test("non-resolving player gets no moves during resolution", () => {
    const s = buildNoCounter()
    const moves = getLegalMoves(s, "p2")
    expect(moves).toHaveLength(0)
  })
})

// ─── Opponent-affecting RESOLVE_* handlers still execute (replay compat) ─────

describe("opponent RESOLVE_* handlers still work for replay", () => {
  test("RESOLVE_RAZE_REALM on opponent still executes via handler", () => {
    const s = buildNoCounter()
    const { newState } = applyMove(s, "p1", {
      type: "RESOLVE_RAZE_REALM",
      playerId: "p2",
      slot: "A",
    })
    expect(newState.players["p2"]!.formation.slots["A"]!.isRazed).toBe(true)
  })

  test("RESOLVE_DRAW_CARDS for opponent still executes via handler", () => {
    const s = buildNoCounter()
    const before = s.players["p2"]!.hand.length
    const { newState } = applyMove(s, "p1", {
      type: "RESOLVE_DRAW_CARDS",
      playerId: "p2",
      count: 1,
    })
    expect(newState.players["p2"]!.hand.length).toBe(before + 1)
  })
})
