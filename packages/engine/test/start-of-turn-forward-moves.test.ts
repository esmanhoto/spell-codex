import { describe, test, expect, beforeEach } from "bun:test"
import { getLegalMoves } from "../src/legal-moves.ts"
import { applyMove } from "../src/engine.ts"
import { initGame } from "../src/init.ts"
import { Phase } from "../src/types.ts"
import type { GameState, CardInstance } from "../src/types.ts"
import { _resetInstanceCounter } from "../src/utils.ts"
import {
  DEFAULT_CONFIG,
  CHAMPION_HERO_GENERIC,
  CHAMPION_WIZARD_FR,
  REALM_FR,
  REALM_GENERIC,
  MAGICAL_ITEM_PLUS2_PLUS1,
  ARTIFACT_FR,
} from "./fixtures.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

/**
 * Build a state at StartOfTurn with specific hand cards and board setup.
 * Uses p1 as active player.
 */
function buildStartOfTurn(opts: {
  hand?: CardInstance[]
  pool?: GameState["players"]["p1"]["pool"]
  formation?: GameState["players"]["p1"]["formation"]
  opponentFormation?: GameState["players"]["p2"]["formation"]
  currentTurn?: number
}): GameState {
  const base = initGame(DEFAULT_CONFIG)
  return {
    ...base,
    phase: Phase.StartOfTurn,
    activePlayer: "p1",
    currentTurn: opts.currentTurn ?? 3, // past round 1 by default
    players: {
      ...base.players,
      p1: {
        ...base.players["p1"]!,
        hand: opts.hand ?? [],
        pool: opts.pool ?? [],
        formation: opts.formation ?? { size: 6, slots: {} },
      },
      p2: {
        ...base.players["p2"]!,
        formation: opts.opponentFormation ?? {
          size: 6,
          slots: { A: { realm: { instanceId: "opp-realm", card: REALM_GENERIC }, isRazed: false, holdings: [] } },
        },
      },
    },
  }
}

// ─── getLegalMoves at StartOfTurn includes forward-phase moves ────────────────

describe("StartOfTurn includes forward-phase moves", () => {
  test("includes PLACE_CHAMPION for champion cards in hand", () => {
    const champ: CardInstance = { instanceId: "champ", card: CHAMPION_HERO_GENERIC }
    const state = buildStartOfTurn({
      hand: [champ],
      formation: {
        size: 6,
        slots: { A: { realm: { instanceId: "r1", card: REALM_GENERIC }, isRazed: false, holdings: [] } },
      },
    })

    const moves = getLegalMoves(state, "p1")
    expect(moves).toContainEqual({ type: "PLACE_CHAMPION", cardInstanceId: "champ" })
  })

  test("includes ATTACH_ITEM for magical item + pool champion", () => {
    const item: CardInstance = { instanceId: "item", card: MAGICAL_ITEM_PLUS2_PLUS1 }
    const champ: CardInstance = { instanceId: "pool-champ", card: CHAMPION_HERO_GENERIC }
    const state = buildStartOfTurn({
      hand: [item],
      pool: [{ champion: champ, attachments: [] }],
    })

    const moves = getLegalMoves(state, "p1")
    expect(moves).toContainEqual({
      type: "ATTACH_ITEM",
      cardInstanceId: "item",
      championId: "pool-champ",
    })
  })

  test("includes ATTACH_ITEM for artifact + pool champion", () => {
    const artifact: CardInstance = { instanceId: "art", card: ARTIFACT_FR }
    const champ: CardInstance = { instanceId: "pool-champ", card: CHAMPION_WIZARD_FR }
    const state = buildStartOfTurn({
      hand: [artifact],
      pool: [{ champion: champ, attachments: [] }],
    })

    const moves = getLegalMoves(state, "p1")
    expect(moves).toContainEqual({
      type: "ATTACH_ITEM",
      cardInstanceId: "art",
      championId: "pool-champ",
    })
  })

  test("includes DISCARD_CARD for each hand card", () => {
    const c1: CardInstance = { instanceId: "c1", card: CHAMPION_HERO_GENERIC }
    const c2: CardInstance = { instanceId: "c2", card: REALM_FR }
    const state = buildStartOfTurn({ hand: [c1, c2] })

    const moves = getLegalMoves(state, "p1")
    expect(moves).toContainEqual({ type: "DISCARD_CARD", cardInstanceId: "c1" })
    expect(moves).toContainEqual({ type: "DISCARD_CARD", cardInstanceId: "c2" })
  })

  test("includes DECLARE_ATTACK when not round 1, has champion, opponent has unrazed realm", () => {
    const champ: CardInstance = { instanceId: "att", card: CHAMPION_HERO_GENERIC }
    const state = buildStartOfTurn({
      pool: [{ champion: champ, attachments: [] }],
      currentTurn: 3,
    })

    const moves = getLegalMoves(state, "p1")
    const attackMoves = moves.filter((m) => m.type === "DECLARE_ATTACK")
    expect(attackMoves.length).toBeGreaterThan(0)
    expect(attackMoves[0]).toMatchObject({
      type: "DECLARE_ATTACK",
      championId: "att",
      targetRealmSlot: "A",
    })
  })

  test("does NOT include DECLARE_ATTACK during round 1", () => {
    const champ: CardInstance = { instanceId: "att", card: CHAMPION_HERO_GENERIC }
    const state = buildStartOfTurn({
      pool: [{ champion: champ, attachments: [] }],
      currentTurn: 1,
    })

    const moves = getLegalMoves(state, "p1")
    expect(moves.filter((m) => m.type === "DECLARE_ATTACK")).toHaveLength(0)
  })

  test("still includes PASS (drawing)", () => {
    const state = buildStartOfTurn({})
    const moves = getLegalMoves(state, "p1")
    expect(moves).toContainEqual({ type: "PASS" })
  })
})

// ─── applyMove from StartOfTurn auto-advances phase ──────────────────────────

describe("applyMove from StartOfTurn auto-advances phase", () => {
  test("PLACE_CHAMPION from StartOfTurn succeeds and advances phase to Pool", () => {
    const champ: CardInstance = { instanceId: "champ", card: CHAMPION_HERO_GENERIC }
    const state = buildStartOfTurn({
      hand: [champ],
      formation: {
        size: 6,
        slots: { A: { realm: { instanceId: "r1", card: REALM_GENERIC }, isRazed: false, holdings: [] } },
      },
    })

    const { newState } = applyMove(state, "p1", {
      type: "PLACE_CHAMPION",
      cardInstanceId: "champ",
    })
    expect(newState.phase).toBe(Phase.Pool)
    expect(newState.players["p1"]!.pool.some((e) => e.champion.instanceId === "champ")).toBe(true)
    expect(newState.players["p1"]!.hand.find((c) => c.instanceId === "champ")).toBeUndefined()
  })

  test("ATTACH_ITEM from StartOfTurn succeeds and advances phase to Pool", () => {
    const item: CardInstance = { instanceId: "item", card: MAGICAL_ITEM_PLUS2_PLUS1 }
    const champ: CardInstance = { instanceId: "pool-champ", card: CHAMPION_HERO_GENERIC }
    const state = buildStartOfTurn({
      hand: [item],
      pool: [{ champion: champ, attachments: [] }],
    })

    const { newState } = applyMove(state, "p1", {
      type: "ATTACH_ITEM",
      cardInstanceId: "item",
      championId: "pool-champ",
    })
    expect(newState.phase).toBe(Phase.Pool)
    const entry = newState.players["p1"]!.pool.find((e) => e.champion.instanceId === "pool-champ")
    expect(entry!.attachments.some((a) => a.instanceId === "item")).toBe(true)
  })

  test("DECLARE_ATTACK from StartOfTurn succeeds and advances to Combat", () => {
    const champ: CardInstance = { instanceId: "att", card: CHAMPION_HERO_GENERIC }
    const state = buildStartOfTurn({
      pool: [{ champion: champ, attachments: [] }],
      currentTurn: 3,
    })

    const { newState } = applyMove(state, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetRealmSlot: "A",
      targetPlayerId: "p2",
    })
    expect(newState.phase).toBe(Phase.Combat)
    expect(newState.combatState).not.toBeNull()
    expect(newState.combatState!.attackingPlayer).toBe("p1")
  })

  test("DISCARD_CARD from StartOfTurn succeeds", () => {
    const card: CardInstance = { instanceId: "c1", card: CHAMPION_HERO_GENERIC }
    const state = buildStartOfTurn({ hand: [card] })

    const { newState } = applyMove(state, "p1", {
      type: "DISCARD_CARD",
      cardInstanceId: "c1",
    })
    // Auto-advance draws cards, then discard removes c1
    expect(newState.players["p1"]!.hand.find((c) => c.instanceId === "c1")).toBeUndefined()
    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "c1")).toBe(true)
    expect(newState.phase).toBe(Phase.PhaseFive)
  })

  test("PASS still works as before from StartOfTurn (draws cards)", () => {
    const state = buildStartOfTurn({})
    const handBefore = state.players["p1"]!.hand.length

    const { newState } = applyMove(state, "p1", { type: "PASS" })
    expect(newState.phase).toBe(Phase.PlayRealm)
    expect(newState.players["p1"]!.hand.length).toBeGreaterThan(handBefore)
  })
})
