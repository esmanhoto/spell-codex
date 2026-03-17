import { describe, test, expect, beforeEach } from "bun:test"
import { _resetInstanceCounter } from "../src/utils.ts"
import { serializeCard, serializeFormation, serializePool, serializeCombat } from "../src/serialize-shared.ts"
import type { Formation, PoolEntry } from "../src/types.ts"
import { inst, makeChampion, makeRealm, makeHolding, makeMagicalItem, buildCombatCardPlayState } from "./scenario-builders.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

// ─── serializeCard ───────────────────────────────────────────────────────────

describe("serializeCard", () => {
  test("returns expected wire-format fields", () => {
    const champion = inst("c1", makeChampion({
      name: "Elminster",
      level: 8,
      worldId: 1,
      setId: "1st",
      cardNumber: 20,
      description: "Wizard.",
      supportIds: [1, 9, "d19"],
    }))

    const result = serializeCard(champion)

    expect(result.instanceId).toBe("c1")
    expect(result.name).toBe("Elminster")
    expect(result.typeId).toBe(7) // Hero from makeChampion default
    expect(result.worldId).toBe(1)
    expect(result.level).toBe(8)
    expect(result.setId).toBe("1st")
    expect(result.cardNumber).toBe(20)
    expect(result.description).toBe("Wizard.")
    expect(result.supportIds).toEqual([1, 9, "d19"])
    expect(result.spellNature).toBeNull()
    expect(result.castPhases).toEqual([])
  })

  test("includes spellNature and castPhases when present", () => {
    const spell = inst("s1", {
      setId: "test",
      cardNumber: 500,
      name: "Fireball",
      typeId: 19,
      worldId: 0,
      isAvatar: false,
      level: "+3",
      description: "",
      attributes: [],
      supportIds: [],
      effects: [],
      spellNature: "offensive" as const,
      castPhases: [4],
    })

    const result = serializeCard(spell)
    expect(result.spellNature).toBe("offensive")
    expect(result.castPhases).toEqual([4])
  })

  test("handles null level", () => {
    const realm = inst("r1", makeRealm())
    expect(serializeCard(realm).level).toBeNull()
  })
})

// ─── serializeFormation ──────────────────────────────────────────────────────

describe("serializeFormation", () => {
  test("serializes formation with empty slots as null", () => {
    const formation: Formation = { size: 6, slots: {} }
    const result = serializeFormation(formation, "p1")

    expect(Object.keys(result)).toEqual(["A", "B", "C", "D", "E", "F"])
    expect(result["A"]).toBeNull()
    expect(result["F"]).toBeNull()
  })

  test("serializes occupied slot with realm and holdings visible to owner", () => {
    const realm = inst("r1", makeRealm())
    const holding = inst("h1", makeHolding())
    const formation: Formation = {
      size: 6,
      slots: {
        A: { realm, isRazed: false, holdings: [holding] },
      },
    }

    const result = serializeFormation(formation, "p1", "p1") // owner viewing
    const slotA = result["A"]!
    expect(slotA).not.toBeNull()
    expect(slotA.realm.instanceId).toBe("r1")
    expect(slotA.holdings).toHaveLength(1)
    expect(slotA.holdings[0].instanceId).toBe("h1")
    expect(slotA.isRazed).toBe(false)
  })

  test("hides holdings from opponent when not revealed", () => {
    const realm = inst("r1", makeRealm())
    const holding = inst("h1", makeHolding())
    const formation: Formation = {
      size: 6,
      slots: {
        A: { realm, isRazed: false, holdings: [holding] },
      },
    }

    const result = serializeFormation(formation, "p1", "p2") // opponent viewing
    expect(result["A"]!.holdings).toHaveLength(0)
  })

  test("shows holdings to opponent when holdingRevealedToAll is true", () => {
    const realm = inst("r1", makeRealm())
    const holding = inst("h1", makeHolding())
    const formation: Formation = {
      size: 6,
      slots: {
        A: { realm, isRazed: false, holdings: [holding], holdingRevealedToAll: true },
      },
    }

    const result = serializeFormation(formation, "p1", "p2")
    expect(result["A"]!.holdings).toHaveLength(1)
  })

  test("size 8 formation includes G and H slots", () => {
    const formation: Formation = { size: 8, slots: {} }
    const result = serializeFormation(formation, "p1")
    expect(Object.keys(result)).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"])
  })

  test("size 10 formation includes all slots A–J", () => {
    const formation: Formation = { size: 10, slots: {} }
    const result = serializeFormation(formation, "p1")
    expect(Object.keys(result)).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"])
  })

  test("no viewerPlayerId: holdings are hidden (not owner view)", () => {
    const realm = inst("r1", makeRealm())
    const holding = inst("h1", makeHolding())
    const formation: Formation = {
      size: 6,
      slots: {
        A: { realm, isRazed: false, holdings: [holding] },
      },
    }

    const result = serializeFormation(formation, "p1") // no viewer
    expect(result["A"]!.holdings).toHaveLength(0)
  })
})

// ─── serializePool ───────────────────────────────────────────────────────────

describe("serializePool", () => {
  test("serializes empty pool", () => {
    expect(serializePool([])).toEqual([])
  })

  test("serializes pool entries with champions and attachments", () => {
    const champion = inst("c1", makeChampion())
    const item = inst("i1", makeMagicalItem({ level: "+2" }))
    const pool: PoolEntry[] = [{ champion, attachments: [item] }]

    const result = serializePool(pool)
    expect(result).toHaveLength(1)
    expect(result[0]!.champion.instanceId).toBe("c1")
    expect(result[0]!.attachments).toHaveLength(1)
    expect(result[0]!.attachments[0]!.instanceId).toBe("i1")
  })

  test("serializes multiple pool entries", () => {
    const c1 = inst("c1", makeChampion())
    const c2 = inst("c2", makeChampion({ cardNumber: 9002, name: "Second" }))
    const pool: PoolEntry[] = [
      { champion: c1, attachments: [] },
      { champion: c2, attachments: [] },
    ]

    const result = serializePool(pool)
    expect(result).toHaveLength(2)
    expect(result[0]!.champion.instanceId).toBe("c1")
    expect(result[1]!.champion.instanceId).toBe("c2")
  })
})

// ─── serializeCombat ─────────────────────────────────────────────────────────

describe("serializeCombat", () => {
  test("serializes active combat state with computed levels", () => {
    const attacker = inst("att", makeChampion({ level: 8 }))
    const defender = inst("def", makeChampion({ level: 5, cardNumber: 9001 }))
    const realm = inst("realm", makeRealm())

    const state = buildCombatCardPlayState({
      attacker,
      defender,
      targetRealm: realm,
    })

    const result = serializeCombat(state)

    expect(result.attackingPlayer).toBe("p1")
    expect(result.defendingPlayer).toBe("p2")
    expect(result.targetSlot).toBe("A")
    expect(result.roundPhase).toBe("CARD_PLAY")
    expect(result.attacker!.instanceId).toBe("att")
    expect(result.defender!.instanceId).toBe("def")
    expect(result.attackerLevel).toBe(8)
    expect(result.defenderLevel).toBe(5)
    expect(result.attackerCards).toEqual([])
    expect(result.defenderCards).toEqual([])
    expect(result.attackerManualLevel).toBeNull()
    expect(result.defenderManualLevel).toBeNull()
  })

  test("respects manual level overrides", () => {
    const attacker = inst("att", makeChampion({ level: 8 }))
    const defender = inst("def", makeChampion({ level: 5, cardNumber: 9001 }))
    const realm = inst("realm", makeRealm())

    const base = buildCombatCardPlayState({
      attacker,
      defender,
      targetRealm: realm,
    })
    const state: typeof base = {
      ...base,
      combatState: {
        ...base.combatState!,
        attackerManualLevel: 99,
        defenderManualLevel: 42,
      },
    }

    const result = serializeCombat(state)
    expect(result.attackerLevel).toBe(99)
    expect(result.defenderLevel).toBe(42)
    expect(result.attackerManualLevel).toBe(99)
    expect(result.defenderManualLevel).toBe(42)
  })

  test("serializes null attacker/defender when AWAITING", () => {
    const attacker = inst("att", makeChampion({ level: 8 }))
    const defender = inst("def", makeChampion({ level: 5, cardNumber: 9001 }))
    const realm = inst("realm", makeRealm())

    const base = buildCombatCardPlayState({
      attacker,
      defender,
      targetRealm: realm,
    })
    const state: typeof base = {
      ...base,
      combatState: {
        ...base.combatState!,
        roundPhase: "AWAITING_ATTACKER",
        attacker: null,
        defender: null,
      },
    }

    const result = serializeCombat(state)
    expect(result.attacker).toBeNull()
    expect(result.defender).toBeNull()
    expect(result.attackerLevel).toBe(0)
    expect(result.defenderLevel).toBe(0)
  })
})
