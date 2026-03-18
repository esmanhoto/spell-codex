import { describe, test, expect, beforeEach } from "bun:test"
import { applyMove } from "../src/engine.ts"
import { Phase } from "../src/types.ts"
import type { CardInstance, GameState } from "../src/types.ts"
import { _resetInstanceCounter } from "../src/utils.ts"
import { initGame } from "../src/init.ts"
import {
  DEFAULT_CONFIG,
  CHAMPION_HERO_GENERIC,
  REALM_GENERIC,
  MAGICAL_ITEM_PLUS2_PLUS1,
} from "./fixtures.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

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
    currentTurn: opts.currentTurn ?? 3,
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

// ─── StartOfTurn → PLACE_CHAMPION → DECLARE_ATTACK in same turn ──────────────

describe("StartOfTurn chain: place champion then attack", () => {
  test("PLACE_CHAMPION followed by DECLARE_ATTACK works within one turn", () => {
    const champ: CardInstance = { instanceId: "champ", card: CHAMPION_HERO_GENERIC }
    const state = buildStartOfTurn({
      hand: [champ],
      formation: {
        size: 6,
        slots: { A: { realm: { instanceId: "r1", card: REALM_GENERIC }, isRazed: false, holdings: [] } },
      },
      currentTurn: 3,
    })

    // Place champion — auto-advances to Pool
    const { newState: s1 } = applyMove(state, "p1", { type: "PLACE_CHAMPION", cardInstanceId: "champ" })
    expect(s1.phase).toBe(Phase.Pool)
    expect(s1.players["p1"]!.pool.some((e) => e.champion.instanceId === "champ")).toBe(true)

    // Now declare attack from Pool phase
    const { newState: s2 } = applyMove(s1, "p1", {
      type: "DECLARE_ATTACK",
      championId: "champ",
      targetRealmSlot: "A",
      targetPlayerId: "p2",
    })
    expect(s2.phase).toBe(Phase.Combat)
    expect(s2.combatState).not.toBeNull()
    expect(s2.combatState!.attacker!.instanceId).toBe("champ")
  })
})

// ─── Rapid phase chain: StartOfTurn → PlayRealm → Pool → Combat ──────────────

describe("rapid phase auto-advance chain", () => {
  test("DECLARE_ATTACK from StartOfTurn chains through all intermediate phases", () => {
    const champ: CardInstance = { instanceId: "att", card: CHAMPION_HERO_GENERIC }
    const state = buildStartOfTurn({
      pool: [{ champion: champ, attachments: [] }],
      currentTurn: 3,
    })

    // Single move jumps from StartOfTurn → Combat
    const { newState } = applyMove(state, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetRealmSlot: "A",
      targetPlayerId: "p2",
    })
    expect(newState.phase).toBe(Phase.Combat)
    expect(newState.combatState!.attackingPlayer).toBe("p1")
  })

  test("ATTACH_ITEM from StartOfTurn auto-advances to Pool", () => {
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

  test("DISCARD_CARD from StartOfTurn chains through to PhaseFive", () => {
    const card: CardInstance = { instanceId: "c1", card: CHAMPION_HERO_GENERIC }
    const state = buildStartOfTurn({ hand: [card] })

    const { newState } = applyMove(state, "p1", { type: "DISCARD_CARD", cardInstanceId: "c1" })
    expect(newState.phase).toBe(Phase.PhaseFive)
    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "c1")).toBe(true)
  })
})

// ─── Voluntary vs forced discard at PhaseFive ─────────────────────────────────

describe("PhaseFive discard behavior", () => {
  function buildPhaseFive(handSize: number): GameState {
    const base = initGame(DEFAULT_CONFIG)
    const hand: CardInstance[] = Array.from({ length: handSize }, (_, i) => ({
      instanceId: `card-${i}`,
      card: { ...CHAMPION_HERO_GENERIC, name: `Card ${i}`, cardNumber: 900 + i },
    }))
    return {
      ...base,
      phase: Phase.PhaseFive,
      activePlayer: "p1",
      currentTurn: 3,
      players: {
        ...base.players,
        p1: { ...base.players["p1"]!, hand },
      },
    }
  }

  test("hand at maxEnd (8) — END_TURN available, no forced discard", () => {
    const state = buildPhaseFive(8) // maxEnd = 8 for 55-card deck
    const { newState } = applyMove(state, "p1", { type: "PASS" })
    // Should succeed — PASS at PhaseFive with hand ≤ maxEnd ends the turn
    expect(newState.activePlayer).toBe("p2")
  })

  test("hand below maxEnd (5) — END_TURN available", () => {
    const state = buildPhaseFive(5)
    const { newState } = applyMove(state, "p1", { type: "PASS" })
    expect(newState.activePlayer).toBe("p2")
  })

  test("hand above maxEnd (10) — PASS throws, must discard first", () => {
    const state = buildPhaseFive(10)
    expect(() => applyMove(state, "p1", { type: "PASS" })).toThrow("Discard down to 8 cards before passing")
  })

  test("forced discard brings hand to maxEnd, then END_TURN works", () => {
    const state = buildPhaseFive(10) // need to discard 2
    const s1 = applyMove(state, "p1", { type: "DISCARD_CARD", cardInstanceId: "card-0" }).newState
    const s2 = applyMove(s1, "p1", { type: "DISCARD_CARD", cardInstanceId: "card-1" }).newState
    expect(s2.players["p1"]!.hand).toHaveLength(8)
    // Now PASS should work
    const { newState } = applyMove(s2, "p1", { type: "PASS" })
    expect(newState.activePlayer).toBe("p2")
  })
})
