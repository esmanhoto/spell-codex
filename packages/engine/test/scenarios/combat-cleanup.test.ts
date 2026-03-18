import { describe, test, expect, beforeEach } from "bun:test"
import { applyMove } from "../../src/engine.ts"
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

// ─── Combat round cleanup — items/artifacts kept, allies/spells discarded ─────

describe("combat cleanup: winner retains items/artifacts from combatCards", () => {
  test("attacker wins: magical item in attackerCards re-attaches to pool; ally discarded", () => {
    const attacker = inst("att", makeChampion({ level: 10 }))
    const defender = inst("def", makeChampion({ level: 3 }))
    const realm = inst("realm", makeRealm())
    const item = inst("item", makeMagicalItem({ level: "+2" }))
    const ally = inst("ally", ALLY_PLUS4)

    const base = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    // Defender (p2) is losing at 3 vs 10; set activePlayer accordingly
    const state = {
      ...base,
      activePlayer: "p2" as const,
      combatState: { ...base.combatState!, attackerCards: [item, ally] },
    }

    const afterFirst = applyMove(state, "p2", { type: "STOP_PLAYING" })
    const { newState } = applyMove(afterFirst.newState, "p1", { type: "STOP_PLAYING" })

    const p1Pool = newState.players["p1"]!.pool
    expect(p1Pool).toHaveLength(1)
    expect(p1Pool[0]!.attachments.some((a) => a.instanceId === "item")).toBe(true)
    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "ally")).toBe(true)
    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "item")).toBe(false)
  })

  test("attacker wins: artifact in attackerCards re-attaches to pool", () => {
    const attacker = inst("att", makeChampion({ level: 10 }))
    const defender = inst("def", makeChampion({ level: 3 }))
    const realm = inst("realm", makeRealm())
    const artifact = inst("art", ARTIFACT_FR)

    const base = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const state = {
      ...base,
      activePlayer: "p2" as const,
      combatState: { ...base.combatState!, attackerCards: [artifact] },
    }

    const afterFirst = applyMove(state, "p2", { type: "STOP_PLAYING" })
    const { newState } = applyMove(afterFirst.newState, "p1", { type: "STOP_PLAYING" })

    const p1Pool = newState.players["p1"]!.pool
    expect(p1Pool[0]!.attachments.some((a) => a.instanceId === "art")).toBe(true)
    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "art")).toBe(false)
  })

  test("defender wins: magical item in defenderCards re-attaches to pool; ally discarded", () => {
    const attacker = inst("att", makeChampion({ level: 3 }))
    const defender = inst("def", makeChampion({ level: 10 }))
    const realm = inst("realm", makeRealm())
    const item = inst("item", makeMagicalItem({ level: "+2" }))
    const ally = inst("ally", ALLY_PLUS4)

    const base = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    // Attacker (p1) is losing at 3 vs 10; activePlayer = "p1" (already default)
    const state = {
      ...base,
      combatState: { ...base.combatState!, defenderCards: [item, ally] },
    }

    const afterFirst = applyMove(state, "p1", { type: "STOP_PLAYING" })
    const { newState } = applyMove(afterFirst.newState, "p2", { type: "STOP_PLAYING" })

    const p2Pool = newState.players["p2"]!.pool
    expect(p2Pool).toHaveLength(1)
    expect(p2Pool[0]!.attachments.some((a) => a.instanceId === "item")).toBe(true)
    expect(newState.players["p2"]!.discardPile.some((c) => c.instanceId === "ally")).toBe(true)
    expect(newState.players["p2"]!.discardPile.some((c) => c.instanceId === "item")).toBe(false)
  })

  test("defender wins: artifact in defenderCards re-attaches to pool", () => {
    const attacker = inst("att", makeChampion({ level: 3 }))
    const defender = inst("def", makeChampion({ level: 10 }))
    const realm = inst("realm", makeRealm())
    const artifact = inst("art", ARTIFACT_FR)

    const base = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const state = {
      ...base,
      combatState: { ...base.combatState!, defenderCards: [artifact] },
    }

    const afterFirst = applyMove(state, "p1", { type: "STOP_PLAYING" })
    const { newState } = applyMove(afterFirst.newState, "p2", { type: "STOP_PLAYING" })

    const p2Pool = newState.players["p2"]!.pool
    expect(p2Pool[0]!.attachments.some((a) => a.instanceId === "art")).toBe(true)
    expect(newState.players["p2"]!.discardPile.some((c) => c.instanceId === "art")).toBe(false)
  })
})

// ─── Loser loses everything ───────────────────────────────────────────────────

describe("combat cleanup: loser discards everything", () => {
  test("losing champion removed from pool and discarded", () => {
    const attacker = inst("att", makeChampion({ level: 3 }))
    const defender = inst("def", makeChampion({ level: 10 }))
    const realm = inst("realm", makeRealm())

    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const afterFirst = applyMove(state, "p1", { type: "STOP_PLAYING" })
    const { newState } = applyMove(afterFirst.newState, "p2", { type: "STOP_PLAYING" })

    expect(newState.players["p1"]!.pool).toHaveLength(0)
    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "att")).toBe(true)
  })

  test("losing champion's pool attachments (items) are also discarded", () => {
    const attacker = inst("att", makeChampion({ level: 3 }))
    const defender = inst("def", makeChampion({ level: 10 }))
    const realm = inst("realm", makeRealm())
    const poolItem = inst("pool-item", makeMagicalItem({ level: "+2" }))

    const state = buildCombatCardPlayState({
      attacker,
      defender,
      targetRealm: realm,
      attackerAttachments: [poolItem],
    })

    const afterFirst = applyMove(state, "p1", { type: "STOP_PLAYING" })
    const { newState } = applyMove(afterFirst.newState, "p2", { type: "STOP_PLAYING" })

    expect(newState.players["p1"]!.pool).toHaveLength(0)
    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "pool-item")).toBe(true)
  })

  test("losing champion's combat cards (items) are also discarded", () => {
    const attacker = inst("att", makeChampion({ level: 3 }))
    const defender = inst("def", makeChampion({ level: 10 }))
    const realm = inst("realm", makeRealm())
    const combatItem = inst("combat-item", makeMagicalItem({ level: "+2" }))

    const base = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const state = {
      ...base,
      combatState: { ...base.combatState!, attackerCards: [combatItem] },
    }

    const afterFirst = applyMove(state, "p1", { type: "STOP_PLAYING" })
    const { newState } = applyMove(afterFirst.newState, "p2", { type: "STOP_PLAYING" })

    expect(newState.players["p1"]!.pool).toHaveLength(0)
    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "combat-item")).toBe(
      true,
    )
  })
})

// ─── Interrupt: both champions survive, each retains their items ──────────────

describe("combat cleanup: interrupt returns items/artifacts to pool", () => {
  test("items and artifacts in both sides' combatCards re-attach; allies discarded", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 5 }))
    const realm = inst("realm", makeRealm())
    const aItem = inst("a-item", makeMagicalItem({ level: "+2" }))
    const aAlly = inst("a-ally", ALLY_PLUS4)
    const dItem = inst("d-item", makeMagicalItem({ level: "+1" }))
    const dAlly = inst("d-ally", { ...ALLY_PLUS4, cardNumber: 999 })

    const base = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const state = {
      ...base,
      combatState: {
        ...base.combatState!,
        attackerCards: [aItem, aAlly],
        defenderCards: [dItem, dAlly],
      },
    }

    const { newState } = applyMove(state, "p1", { type: "INTERRUPT_COMBAT" })

    // Both champions still in pool
    expect(newState.players["p1"]!.pool).toHaveLength(1)
    expect(newState.players["p2"]!.pool).toHaveLength(1)

    // Items re-attached to respective pool champions
    expect(
      newState.players["p1"]!.pool[0]!.attachments.some((a) => a.instanceId === "a-item"),
    ).toBe(true)
    expect(
      newState.players["p2"]!.pool[0]!.attachments.some((a) => a.instanceId === "d-item"),
    ).toBe(true)

    // Allies discarded
    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "a-ally")).toBe(true)
    expect(newState.players["p2"]!.discardPile.some((c) => c.instanceId === "d-ally")).toBe(true)

    // Items NOT in discard
    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "a-item")).toBe(false)
    expect(newState.players["p2"]!.discardPile.some((c) => c.instanceId === "d-item")).toBe(false)
  })

  test("interrupt with no combat cards: champions return to pool intact", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 5 }))
    const realm = inst("realm", makeRealm())
    const poolItem = inst("pool-item", makeMagicalItem({ level: "+3" }))

    const state = buildCombatCardPlayState({
      attacker,
      defender,
      targetRealm: realm,
      attackerAttachments: [poolItem],
    })

    const { newState } = applyMove(state, "p1", { type: "INTERRUPT_COMBAT" })

    const p1Pool = newState.players["p1"]!.pool
    expect(p1Pool).toHaveLength(1)
    // Pre-existing pool attachment still there
    expect(p1Pool[0]!.attachments.some((a) => a.instanceId === "pool-item")).toBe(true)
  })
})

// ─── Pool attachment switch/discard during combat ─────────────────────────────

describe("pool attachment SWITCH_COMBAT_SIDE / DISCARD_COMBAT_CARD", () => {
  test("SWITCH_COMBAT_SIDE on attacker pool attachment: removed from pool, added to defenderCards", () => {
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

    const { newState } = applyMove(state, "p1", {
      type: "SWITCH_COMBAT_SIDE",
      cardInstanceId: "item",
    })

    expect(newState.players["p1"]!.pool[0]!.attachments).toHaveLength(0)
    expect(newState.combatState!.defenderCards.some((c) => c.instanceId === "item")).toBe(true)
    expect(newState.combatState!.attackerCards.some((c) => c.instanceId === "item")).toBe(false)
  })

  test("SWITCH_COMBAT_SIDE on defender pool attachment: removed from pool, added to attackerCards", () => {
    const attacker = inst("att", makeChampion({ level: 5 }))
    const defender = inst("def", makeChampion({ level: 5 }))
    const realm = inst("realm", makeRealm())
    const item = inst("item", makeMagicalItem({ level: "+2" }))

    const state = buildCombatCardPlayState({
      attacker,
      defender,
      targetRealm: realm,
      defenderAttachments: [item],
    })

    const { newState } = applyMove(state, "p1", {
      type: "SWITCH_COMBAT_SIDE",
      cardInstanceId: "item",
    })

    expect(newState.players["p2"]!.pool[0]!.attachments).toHaveLength(0)
    expect(newState.combatState!.attackerCards.some((c) => c.instanceId === "item")).toBe(true)
    expect(newState.combatState!.defenderCards.some((c) => c.instanceId === "item")).toBe(false)
  })

  test("DISCARD_COMBAT_CARD on pool attachment: removed from pool, into owner's discard", () => {
    const attacker = inst("att", makeChampion({ level: 3 }))
    const defender = inst("def", makeChampion({ level: 10 }))
    const realm = inst("realm", makeRealm())
    const item = inst("item", makeMagicalItem({ level: "+2" }))

    // p1 (attacker) is the active/losing player — they can DISCARD
    const state = buildCombatCardPlayState({
      attacker,
      defender,
      targetRealm: realm,
      attackerAttachments: [item],
    })

    const { newState } = applyMove(state, "p1", {
      type: "DISCARD_COMBAT_CARD",
      cardInstanceId: "item",
    })

    expect(newState.players["p1"]!.pool[0]!.attachments).toHaveLength(0)
    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "item")).toBe(true)
    // Champion still alive
    expect(newState.players["p1"]!.pool[0]!.champion.instanceId).toBe("att")
  })
})
