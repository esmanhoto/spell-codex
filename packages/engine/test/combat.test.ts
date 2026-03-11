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
import type { CardData, CombatState } from "../src/types.ts"
import {
  CHAMPION_CLERIC_FR,
  CHAMPION_WIZARD_FR,
  CHAMPION_HERO_GENERIC,
  ALLY_PLUS4,
  ALLY_SLASH,
  MAGICAL_ITEM_PLUS2_PLUS1,
  MAGICAL_ITEM_OFF_ONLY,
  MAGICAL_ITEM_SPELL_GRANT,
  CLERIC_SPELL,
  SPELL_NEGATIVE,
  SPELL_NO_LEVEL,
  WIZARD_SPELL,
  ARTIFACT_FR,
  ARTIFACT_SLASH,
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

  test("magical item with level bonus and desc-only Off tag adds correctly", () => {
    const champ = createInstance(CHAMPION_WIZARD_FR, "test-champ") // level 8
    const item = createInstance(MAGICAL_ITEM_OFF_ONLY, "test-item") // level "+3"
    expect(calculateCombatLevel(champ, [item], false, "offensive")).toBe(11) // 8+3
    expect(calculateCombatLevel(champ, [item], false, "defensive")).toBe(11) // 8+3 (single value)
  })

  test("wizard spell with level +3 adds 3", () => {
    const champ = createInstance(CHAMPION_WIZARD_FR, "test-champ") // level 8
    const spell = createInstance(WIZARD_SPELL, "test-spell") // level "+3"
    expect(calculateCombatLevel(champ, [spell], false, "offensive")).toBe(11) // 8+3
  })

  test("cleric spell with level +5 adds 5", () => {
    const champ = createInstance(CHAMPION_CLERIC_FR, "test-champ") // level 6
    const spell = createInstance(CLERIC_SPELL, "test-spell") // level "+5"
    expect(calculateCombatLevel(champ, [spell], false, "offensive")).toBe(11) // 6+5
  })

  test("spell with negative level subtracts", () => {
    const champ = createInstance(CHAMPION_WIZARD_FR, "test-champ") // level 8
    const spell = createInstance(SPELL_NEGATIVE, "test-spell") // level "-3"
    expect(calculateCombatLevel(champ, [spell], false, "offensive")).toBe(5) // 8-3
  })

  test("spell with null level adds 0", () => {
    const champ = createInstance(CHAMPION_WIZARD_FR, "test-champ") // level 8
    const spell = createInstance(SPELL_NO_LEVEL, "test-spell") // level null
    expect(calculateCombatLevel(champ, [spell], false, "offensive")).toBe(8) // 8+0
  })

  test("artifact with +4 level adds 4", () => {
    const champ = createInstance(CHAMPION_WIZARD_FR, "test-champ") // level 8
    const artifact = createInstance(ARTIFACT_FR, "test-artifact") // level "+4"
    expect(calculateCombatLevel(champ, [artifact], false, "offensive")).toBe(12) // 8+4
  })

  test("artifact with slash level +5/+2 applies by side", () => {
    const champ = createInstance(CHAMPION_CLERIC_FR, "test-champ") // level 6
    const artifact = createInstance(ARTIFACT_SLASH, "test-artifact") // level "+5/+2"
    expect(calculateCombatLevel(champ, [artifact], false, "offensive")).toBe(11) // 6+5
    expect(calculateCombatLevel(champ, [artifact], false, "defensive")).toBe(8) // 6+2
  })

  test("magical item with no level adds 0", () => {
    const champ = createInstance(CHAMPION_WIZARD_FR, "test-champ") // level 8
    const item = createInstance(MAGICAL_ITEM_SPELL_GRANT, "test-item") // level null
    expect(calculateCombatLevel(champ, [item], false, "offensive")).toBe(8) // 8+0
  })

  test("events do not add to level", () => {
    const champ = createInstance(CHAMPION_WIZARD_FR, "test-champ") // level 8
    const event: CardData = { ...WIZARD_SPELL, typeId: 6, level: "+5" } // fake event with level
    const eventInstance = createInstance(event, "test-event")
    expect(calculateCombatLevel(champ, [eventInstance], false, "offensive")).toBe(8) // events ignored
  })

  test("realms and holdings do not add to level", () => {
    const champ = createInstance(CHAMPION_CLERIC_FR, "test-champ") // level 6
    const realm: CardData = { ...ALLY_PLUS4, typeId: 13 } // fake realm with level
    const holding: CardData = { ...ALLY_PLUS4, typeId: 8 } // fake holding with level
    const r = createInstance(realm, "test-realm")
    const h = createInstance(holding, "test-holding")
    expect(calculateCombatLevel(champ, [r, h], false, "offensive")).toBe(6) // nothing added
  })

  test("multiple card types stack: ally + spell + item + artifact", () => {
    const champ = createInstance(CHAMPION_CLERIC_FR, "test-champ") // level 6
    const ally = createInstance(ALLY_PLUS4, "test-ally") // +4
    const spell = createInstance(CLERIC_SPELL, "test-spell") // +5
    const item = createInstance(MAGICAL_ITEM_OFF_ONLY, "test-item") // +3
    const artifact = createInstance(ARTIFACT_FR, "test-artifact") // +4
    // 6 + 4 + 5 + 3 + 4 = 22
    expect(calculateCombatLevel(champ, [ally, spell, item, artifact], false, "offensive")).toBe(22)
  })

  test("pool attachments and combat cards both contribute", () => {
    const champ = createInstance(CHAMPION_WIZARD_FR, "test-champ") // level 8
    const poolItem = createInstance(MAGICAL_ITEM_OFF_ONLY, "test-pool-item") // +3 (attached)
    const combatAlly = createInstance(ALLY_PLUS4, "test-combat-ally") // +4 (played in combat)
    // 8 + 3 + 4 = 15
    expect(calculateCombatLevel(champ, [combatAlly], false, "offensive", [poolItem])).toBe(15)
  })

  test("world bonus + multiple cards stack correctly", () => {
    const champ = createInstance(CHAMPION_CLERIC_FR, "test-champ") // level 6, worldId=1
    const ally = createInstance(ALLY_PLUS4, "test-ally") // +4
    const spell = createInstance(WIZARD_SPELL, "test-spell") // +3
    // 6 + 3 (world) + 4 (ally) + 3 (spell) = 16
    expect(calculateCombatLevel(champ, [ally, spell], true, "offensive")).toBe(16)
  })

  test("level never goes below 0", () => {
    const champ = createInstance(CHAMPION_HERO_GENERIC, "test-champ") // level 5
    // No negative case in standard rules but ensure the floor holds
    expect(calculateCombatLevel(champ, [], false, "offensive")).toBeGreaterThanOrEqual(0)
  })

  test("heavy negative cards floor at 0", () => {
    const champ = createInstance(CHAMPION_HERO_GENERIC, "test-champ") // level 5
    const neg1 = createInstance(SPELL_NEGATIVE, "test-neg1") // -3
    const neg2 = createInstance(SPELL_NEGATIVE, "test-neg2") // -3
    // 5 - 3 - 3 = -1 → clamped to 0
    expect(calculateCombatLevel(champ, [neg1, neg2], false, "offensive")).toBe(0)
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
