import { describe, test, expect, beforeEach } from "bun:test"
import {
  calculateCombatLevel,
  hasWorldMatch,
  resolveCombatRound,
  getLosingPlayer,
} from "../src/combat.ts"
import {
  parseLevel,
  parseMagicalItemBonus,
  createInstance,
  _resetInstanceCounter,
} from "../src/utils.ts"
import type { CombatState } from "../src/types.ts"
import {
  CHAMPION_CLERIC_FR,
  CHAMPION_WIZARD_FR,
  CHAMPION_HERO_GENERIC,
  ALLY_PLUS4,
  ALLY_SLASH,
  MAGICAL_ITEM_PLUS2_PLUS1,
} from "./fixtures.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

// ─── parseLevel ───────────────────────────────────────────────────────────────

describe("parseLevel", () => {
  test("number level returns the number", () => {
    expect(parseLevel(6)).toBe(6)
    expect(parseLevel(0)).toBe(0)
  })

  test("null returns 0", () => {
    expect(parseLevel(null)).toBe(0)
  })

  test("+N string returns N", () => {
    expect(parseLevel("+4")).toBe(4)
    expect(parseLevel("+1")).toBe(1)
  })

  test("-N string returns negative", () => {
    expect(parseLevel("-2")).toBe(-2)
  })

  test("+N/+M returns offensive part by default", () => {
    expect(parseLevel("+3/+2")).toBe(3)
  })

  test("+N/+M returns defensive part when specified", () => {
    expect(parseLevel("+3/+2", "defensive")).toBe(2)
  })

  test("plain number string without sign", () => {
    expect(parseLevel("5")).toBe(5)
  })
})

// ─── parseMagicalItemBonus ────────────────────────────────────────────────────

describe("parseMagicalItemBonus", () => {
  test("+2/+1 pattern gives 2 offensive and 1 defensive", () => {
    expect(parseMagicalItemBonus("Adds +2/+1 to bearer's level in combat.")).toEqual({
      offensive: 2,
      defensive: 1,
    })
  })

  test("+3 single value gives 3 for both", () => {
    expect(parseMagicalItemBonus("Adds +3 to champion.")).toEqual({
      offensive: 3,
      defensive: 3,
    })
  })

  test("no match returns 0/0", () => {
    expect(parseMagicalItemBonus("Special ability: see card text.")).toEqual({
      offensive: 0,
      defensive: 0,
    })
  })
})

// ─── hasWorldMatch ────────────────────────────────────────────────────────────

describe("hasWorldMatch", () => {
  test("same world matches", () => {
    const champ = createInstance(CHAMPION_CLERIC_FR, "test-champ") // worldId=1 (FR)
    expect(hasWorldMatch(champ, 1)).toBe(true)
  })

  test("different worlds don't match", () => {
    const champ = createInstance(CHAMPION_CLERIC_FR, "test-champ") // worldId=1
    expect(hasWorldMatch(champ, 2)).toBe(false)
  })

  test("world-agnostic champion (worldId=0) never matches", () => {
    const champ = createInstance(CHAMPION_HERO_GENERIC, "test-champ") // worldId=0
    expect(hasWorldMatch(champ, 1)).toBe(false)
    expect(hasWorldMatch(champ, 0)).toBe(false)
  })

  test("realm with worldId=0 never matches", () => {
    const champ = createInstance(CHAMPION_CLERIC_FR, "test-champ") // worldId=1
    expect(hasWorldMatch(champ, 0)).toBe(false)
  })
})

// ─── calculateCombatLevel ─────────────────────────────────────────────────────

describe("calculateCombatLevel", () => {
  test("base level with no cards or world match", () => {
    const champ = createInstance(CHAMPION_CLERIC_FR, "test-champ") // level 6
    expect(calculateCombatLevel(champ, [], false, "offensive")).toBe(6)
  })

  test("world bonus adds 3 when matched", () => {
    const champ = createInstance(CHAMPION_CLERIC_FR, "test-champ") // worldId=1, level=6
    expect(calculateCombatLevel(champ, [], true, "offensive")).toBe(9) // 6+3
  })

  test("ally +4 adds to offensive level", () => {
    const champ = createInstance(CHAMPION_CLERIC_FR, "test-champ") // level 6
    const ally = createInstance(ALLY_PLUS4, "test-ally-plus4")
    expect(calculateCombatLevel(champ, [ally], false, "offensive")).toBe(10) // 6+4
  })

  test("slash ally: offensive bonus for attacker", () => {
    const champ = createInstance(CHAMPION_CLERIC_FR, "test-champ") // level 6
    const ally = createInstance(ALLY_SLASH, "test-ally-slash") // +3/+2
    expect(calculateCombatLevel(champ, [ally], false, "offensive")).toBe(9) // 6+3
    expect(calculateCombatLevel(champ, [ally], false, "defensive")).toBe(8) // 6+2
  })

  test("magical item +2/+1 applies correct bonus by side", () => {
    const champ = createInstance(CHAMPION_WIZARD_FR, "test-champ") // level 8
    const item = createInstance(MAGICAL_ITEM_PLUS2_PLUS1, "test-item")
    expect(calculateCombatLevel(champ, [item], false, "offensive")).toBe(10) // 8+2
    expect(calculateCombatLevel(champ, [item], false, "defensive")).toBe(9) // 8+1
  })

  test("level never goes below 0", () => {
    const champ = createInstance(CHAMPION_HERO_GENERIC, "test-champ") // level 5
    // No negative case in standard rules but ensure the floor holds
    expect(calculateCombatLevel(champ, [], false, "offensive")).toBeGreaterThanOrEqual(0)
  })

  test("world bonus + ally stack correctly", () => {
    const champ = createInstance(CHAMPION_CLERIC_FR, "test-champ") // level 6, worldId=1
    const ally = createInstance(ALLY_PLUS4, "test-ally-plus4")
    // FR champion attacking FR realm: 6 + 3 (world) + 4 (ally) = 13
    expect(calculateCombatLevel(champ, [ally], true, "offensive")).toBe(13)
  })
})

// ─── resolveCombatRound ───────────────────────────────────────────────────────

describe("resolveCombatRound", () => {
  test("attacker wins when strictly greater", () => {
    expect(resolveCombatRound(10, 8)).toBe("ATTACKER_WINS")
  })

  test("defender wins on equal levels (tie goes to defender)", () => {
    expect(resolveCombatRound(8, 8)).toBe("DEFENDER_WINS")
  })

  test("defender wins when higher", () => {
    expect(resolveCombatRound(6, 10)).toBe("DEFENDER_WINS")
  })

  test("tie by one goes to defender", () => {
    expect(resolveCombatRound(9, 9)).toBe("DEFENDER_WINS")
  })
})

// ─── getLosingPlayer ─────────────────────────────────────────────────────────

describe("getLosingPlayer", () => {
  const combat = {
    attackingPlayer: "p1",
    defendingPlayer: "p2",
  } as unknown as CombatState

  test("when attacker level > defender, defender is losing", () => {
    expect(getLosingPlayer(10, 6, combat)).toBe("p2")
  })

  test("when attacker level < defender, attacker is losing", () => {
    expect(getLosingPlayer(4, 8, combat)).toBe("p1")
  })

  test("on tie, attacker is losing (defender wins ties)", () => {
    expect(getLosingPlayer(7, 7, combat)).toBe("p1")
  })
})
