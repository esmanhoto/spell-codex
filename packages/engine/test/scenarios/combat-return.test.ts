import { describe, test, expect, beforeEach } from "bun:test"
import { applyMove } from "../../src/engine.ts"
import { getLegalMoves } from "../../src/legal-moves.ts"
import { _resetInstanceCounter } from "../../src/utils.ts"
import { ALLY_PLUS4, ARTIFACT_FR } from "../fixtures.ts"
import {
  inst,
  makeChampion,
  makeRealm,
  makeMagicalItem,
  buildCombatCardPlayState,
} from "../scenario-builders.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

// ─── RETURN_COMBAT_CARD_TO_POOL ─────────────────────────────────────────────

describe("RETURN_COMBAT_CARD_TO_POOL", () => {
  test("returns attacker champion to pool (clears combat.attacker)", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 5 }))
    const realm = inst("realm", makeRealm())

    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const { newState } = applyMove(state, "p1", {
      type: "RETURN_COMBAT_CARD_TO_POOL",
      cardInstanceId: "att",
    })

    expect(newState.combatState!.attacker).toBeNull()
    // Champion still in pool
    expect(newState.players["p1"]!.pool.some((e) => e.champion.instanceId === "att")).toBe(true)
    // Combat still active
    expect(newState.combatState).not.toBeNull()
    expect(newState.combatState!.roundPhase).toBe("CARD_PLAY")
  })

  test("returns defender champion to pool (clears combat.defender)", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 5 }))
    const realm = inst("realm", makeRealm())

    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const { newState } = applyMove(state, "p2", {
      type: "RETURN_COMBAT_CARD_TO_POOL",
      cardInstanceId: "def",
    })

    expect(newState.combatState!.defender).toBeNull()
    expect(newState.players["p2"]!.pool.some((e) => e.champion.instanceId === "def")).toBe(true)
  })

  test("clears manual level when champion returned to pool", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 5 }))
    const realm = inst("realm", makeRealm())

    const base = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const state = {
      ...base,
      combatState: { ...base.combatState!, attackerManualLevel: 10 },
    }
    const { newState } = applyMove(state, "p1", {
      type: "RETURN_COMBAT_CARD_TO_POOL",
      cardInstanceId: "att",
    })

    expect(newState.combatState!.attackerManualLevel).toBeNull()
  })

  test("emits COMBAT_CHAMPION_RETURNED_TO_POOL event", () => {
    const attacker = inst("att", makeChampion({ level: 5, name: "Test Hero" }))
    const defender = inst("def", makeChampion({ level: 5 }))
    const realm = inst("realm", makeRealm())

    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const { events } = applyMove(state, "p1", {
      type: "RETURN_COMBAT_CARD_TO_POOL",
      cardInstanceId: "att",
    })

    const ev = events.find((e) => e.type === "COMBAT_CHAMPION_RETURNED_TO_POOL")
    expect(ev).toBeDefined()
    expect((ev as { cardName: string }).cardName).toBe("Test Hero")
  })

  test("legal moves include RETURN_COMBAT_CARD_TO_POOL for both champions", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 5 }))
    const realm = inst("realm", makeRealm())

    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const moves = getLegalMoves(state, "p1")

    const returnMoves = moves.filter((m) => m.type === "RETURN_COMBAT_CARD_TO_POOL")
    expect(returnMoves).toHaveLength(2)
    const ids = returnMoves.map((m) => (m as { cardInstanceId: string }).cardInstanceId)
    expect(ids).toContain("att")
    expect(ids).toContain("def")
  })

  test("no RETURN_COMBAT_CARD_TO_POOL when champion already null", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 5 }))
    const realm = inst("realm", makeRealm())

    const base = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const state = { ...base, combatState: { ...base.combatState!, attacker: null } }
    const moves = getLegalMoves(state, "p1")

    const returnMoves = moves.filter((m) => m.type === "RETURN_COMBAT_CARD_TO_POOL")
    // Only defender champion available
    expect(returnMoves).toHaveLength(1)
    expect((returnMoves[0] as { cardInstanceId: string }).cardInstanceId).toBe("def")
  })

  test("rejects non-champion card", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 5 }))
    const realm = inst("realm", makeRealm())
    const ally = inst("ally", ALLY_PLUS4)

    const base = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const state = {
      ...base,
      combatState: { ...base.combatState!, attackerCards: [ally] },
    }

    expect(() =>
      applyMove(state, "p1", { type: "RETURN_COMBAT_CARD_TO_POOL", cardInstanceId: "ally" }),
    ).toThrow()
  })
})

// ─── RETURN_COMBAT_CARD_TO_HAND ─────────────────────────────────────────────

describe("RETURN_COMBAT_CARD_TO_HAND", () => {
  test("returns attacker combat card to owner's hand", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 5 }))
    const realm = inst("realm", makeRealm())
    const ally = inst("ally", ALLY_PLUS4)

    const base = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const state = {
      ...base,
      combatState: { ...base.combatState!, attackerCards: [ally] },
    }

    const { newState } = applyMove(state, "p1", {
      type: "RETURN_COMBAT_CARD_TO_HAND",
      cardInstanceId: "ally",
    })

    expect(newState.combatState!.attackerCards).toHaveLength(0)
    expect(newState.players["p1"]!.hand.some((c) => c.instanceId === "ally")).toBe(true)
  })

  test("returns defender combat card to owner's hand", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 5 }))
    const realm = inst("realm", makeRealm())
    const ally = inst("ally", ALLY_PLUS4)

    const base = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const state = {
      ...base,
      combatState: { ...base.combatState!, defenderCards: [ally] },
    }

    const { newState } = applyMove(state, "p2", {
      type: "RETURN_COMBAT_CARD_TO_HAND",
      cardInstanceId: "ally",
    })

    expect(newState.combatState!.defenderCards).toHaveLength(0)
    expect(newState.players["p2"]!.hand.some((c) => c.instanceId === "ally")).toBe(true)
  })

  test("emits COMBAT_CARD_RETURNED_TO_HAND event", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 5 }))
    const realm = inst("realm", makeRealm())
    const ally = inst("ally", { ...ALLY_PLUS4, name: "Test Ally" })

    const base = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const state = {
      ...base,
      combatState: { ...base.combatState!, attackerCards: [ally] },
    }

    const { events } = applyMove(state, "p1", {
      type: "RETURN_COMBAT_CARD_TO_HAND",
      cardInstanceId: "ally",
    })

    const ev = events.find((e) => e.type === "COMBAT_CARD_RETURNED_TO_HAND")
    expect(ev).toBeDefined()
    expect((ev as { cardName: string }).cardName).toBe("Test Ally")
  })

  test("legal moves include RETURN_COMBAT_CARD_TO_HAND for allies only", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 5 }))
    const realm = inst("realm", makeRealm())
    const ally = inst("ally", ALLY_PLUS4)
    const item = inst("item", makeMagicalItem({ level: "+2" }))

    const base = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const state = {
      ...base,
      combatState: { ...base.combatState!, attackerCards: [ally, item] },
    }

    const moves = getLegalMoves(state, "p1")
    const returnMoves = moves.filter((m) => m.type === "RETURN_COMBAT_CARD_TO_HAND")
    // Only ally gets the option, not magical item
    expect(returnMoves).toHaveLength(1)
    expect((returnMoves[0] as { cardInstanceId: string }).cardInstanceId).toBe("ally")
  })

  test("rejects card not in combat", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 5 }))
    const realm = inst("realm", makeRealm())

    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })

    expect(() =>
      applyMove(state, "p1", { type: "RETURN_COMBAT_CARD_TO_HAND", cardInstanceId: "nope" }),
    ).toThrow()
  })
})

// ─── Combat outcome with champion already returned to pool ──────────────────

describe("combat outcome when champion already returned to pool", () => {
  test("Blink scenario: defender champion returned to pool, then accepts defeat", () => {
    const attacker = inst("att", makeChampion({ level: 10 }))
    const defender = inst("def", makeChampion({ level: 3 }))
    const realm = inst("realm", makeRealm())

    const base = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    // Defender is losing
    const state = { ...base, activePlayer: "p2" as const }

    // Defender returns champion to pool (Blink)
    const { newState: s1 } = applyMove(state, "p2", {
      type: "RETURN_COMBAT_CARD_TO_POOL",
      cardInstanceId: "def",
    })
    expect(s1.combatState!.defender).toBeNull()

    // Defender accepts defeat (STOP_PLAYING)
    const { newState: s2 } = applyMove(s1, "p2", { type: "STOP_PLAYING" })

    // Attacker wins round 1 → AWAITING_ATTACKER (they choose to end or continue)
    expect(s2.combatState).not.toBeNull()
    expect(s2.combatState!.roundPhase).toBe("AWAITING_ATTACKER")
    expect(s2.combatState!.attackerWins).toBe(1)
    // Defender champion is safe in pool (not discarded)
    expect(s2.players["p2"]!.pool.some((e) => e.champion.instanceId === "def")).toBe(true)
    expect(s2.players["p2"]!.discardPile.some((c) => c.instanceId === "def")).toBe(false)

    // Attacker ends attack — battle over
    const { newState: s3 } = applyMove(s2, "p1", { type: "END_ATTACK" })
    expect(s3.combatState).toBeNull()
  })

  test("Darkness scenario: both champions returned to pool, then interrupt", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 5 }))
    const realm = inst("realm", makeRealm())

    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })

    // Both champions return to pool
    const { newState: s1 } = applyMove(state, "p1", {
      type: "RETURN_COMBAT_CARD_TO_POOL",
      cardInstanceId: "att",
    })
    const { newState: s2 } = applyMove(s1, "p2", {
      type: "RETURN_COMBAT_CARD_TO_POOL",
      cardInstanceId: "def",
    })

    // Interrupt combat — no winner
    const { newState: s3 } = applyMove(s2, "p1", { type: "INTERRUPT_COMBAT" })

    expect(s3.combatState).toBeNull()
    expect(s3.players["p1"]!.pool.some((e) => e.champion.instanceId === "att")).toBe(true)
    expect(s3.players["p2"]!.pool.some((e) => e.champion.instanceId === "def")).toBe(true)
  })

  test("attacker champion returned to pool, then attacker accepts defeat", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 5 }))
    const realm = inst("realm", makeRealm())

    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })

    // Attacker returns champion to pool
    const { newState: s1 } = applyMove(state, "p1", {
      type: "RETURN_COMBAT_CARD_TO_POOL",
      cardInstanceId: "att",
    })

    // Attacker accepts defeat
    const { newState: s2 } = applyMove(s1, "p1", { type: "STOP_PLAYING" })

    // Defender wins — attacker champion safe in pool (not discarded)
    expect(s2.combatState).toBeNull()
    expect(s2.players["p1"]!.pool.some((e) => e.champion.instanceId === "att")).toBe(true)
    expect(s2.players["p1"]!.discardPile.some((c) => c.instanceId === "att")).toBe(false)
  })

  test("combat cards still discarded normally when champion is returned to pool", () => {
    const attacker = inst("att", makeChampion({ level: 10 }))
    const defender = inst("def", makeChampion({ level: 3 }))
    const realm = inst("realm", makeRealm())
    const ally = inst("ally", ALLY_PLUS4)

    const base = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const state = {
      ...base,
      activePlayer: "p2" as const,
      combatState: { ...base.combatState!, defenderCards: [ally] },
    }

    // Defender returns champion to pool
    const { newState: s1 } = applyMove(state, "p2", {
      type: "RETURN_COMBAT_CARD_TO_POOL",
      cardInstanceId: "def",
    })

    // Defender accepts defeat
    const { newState: s2 } = applyMove(s1, "p2", { type: "STOP_PLAYING" })

    // Champion safe, but ally in combat cards gets discarded
    expect(s2.players["p2"]!.pool.some((e) => e.champion.instanceId === "def")).toBe(true)
    expect(s2.players["p2"]!.discardPile.some((c) => c.instanceId === "ally")).toBe(true)
  })

  test("pool attachments stay with champion when returned to pool", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 5 }))
    const realm = inst("realm", makeRealm())
    const item = inst("item", makeMagicalItem({ level: "+2" }))

    const state = buildCombatCardPlayState({
      attacker,
      defender,
      targetRealm: realm,
      attackerAttachments: [item],
    })

    const { newState: s1 } = applyMove(state, "p1", {
      type: "RETURN_COMBAT_CARD_TO_POOL",
      cardInstanceId: "att",
    })

    // Champion still has its pool attachment
    const entry = s1.players["p1"]!.pool.find((e) => e.champion.instanceId === "att")
    expect(entry).toBeDefined()
    expect(entry!.attachments.some((a) => a.instanceId === "item")).toBe(true)
  })

  test("combat items/artifacts re-attach to champion when returned to pool", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 5 }))
    const realm = inst("realm", makeRealm())
    const combatItem = inst("c-item", makeMagicalItem({ level: "+2" }))
    const ally = inst("ally", ALLY_PLUS4)

    const base = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const state = {
      ...base,
      combatState: { ...base.combatState!, attackerCards: [combatItem, ally] },
    }

    const { newState } = applyMove(state, "p1", {
      type: "RETURN_COMBAT_CARD_TO_POOL",
      cardInstanceId: "att",
    })

    // Item re-attached to champion in pool
    const entry = newState.players["p1"]!.pool.find((e) => e.champion.instanceId === "att")
    expect(entry!.attachments.some((a) => a.instanceId === "c-item")).toBe(true)
    // Ally stays in combat cards
    expect(newState.combatState!.attackerCards.some((c) => c.instanceId === "ally")).toBe(true)
    expect(newState.combatState!.attackerCards.some((c) => c.instanceId === "c-item")).toBe(false)
  })

  test("combat artifact re-attaches to champion when returned to pool", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 5 }))
    const realm = inst("realm", makeRealm())
    const artifact = inst("art", ARTIFACT_FR)

    const base = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const state = {
      ...base,
      combatState: { ...base.combatState!, defenderCards: [artifact] },
    }

    const { newState } = applyMove(state, "p2", {
      type: "RETURN_COMBAT_CARD_TO_POOL",
      cardInstanceId: "def",
    })

    const entry = newState.players["p2"]!.pool.find((e) => e.champion.instanceId === "def")
    expect(entry!.attachments.some((a) => a.instanceId === "art")).toBe(true)
    expect(newState.combatState!.defenderCards).toHaveLength(0)
  })
})
