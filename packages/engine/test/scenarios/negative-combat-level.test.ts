import { describe, test, expect, beforeEach } from "bun:test"
import { calculateCombatLevel } from "../../src/combat.ts"
import { _resetInstanceCounter } from "../../src/utils.ts"
import { SPELL_NEGATIVE } from "../fixtures.ts"
import { inst, makeChampion } from "../scenario-builders.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

describe("negative combat levels floor at zero", () => {
  test("champion level 2 + spell -3 = 0 (not -1)", () => {
    const champion = inst("c", makeChampion({ level: 2 }))
    const spell = inst("s", SPELL_NEGATIVE) // level: "-3"

    const level = calculateCombatLevel(champion, [spell], false, "offensive")
    expect(level).toBe(0)
  })

  test("champion level 1 + two negative spells floors at 0", () => {
    const champion = inst("c", makeChampion({ level: 1 }))
    const spell1 = inst("s1", { ...SPELL_NEGATIVE, cardNumber: 601 })
    const spell2 = inst("s2", { ...SPELL_NEGATIVE, cardNumber: 602 })

    const level = calculateCombatLevel(champion, [spell1, spell2], false, "offensive")
    expect(level).toBe(0)
  })

  test("champion level 5 + spell -3 = 2 (positive result not clamped)", () => {
    const champion = inst("c", makeChampion({ level: 5 }))
    const spell = inst("s", SPELL_NEGATIVE)

    const level = calculateCombatLevel(champion, [spell], false, "offensive")
    expect(level).toBe(2)
  })

  test("champion level 0 with no bonuses returns 0", () => {
    const champion = inst("c", makeChampion({ level: 0 }))

    const level = calculateCombatLevel(champion, [], false, "offensive")
    expect(level).toBe(0)
  })

  test("world bonus can offset negative spell", () => {
    const champion = inst("c", makeChampion({ level: 1, worldId: 1 }))
    const spell = inst("s", SPELL_NEGATIVE) // -3

    // 1 + 3 (world bonus) - 3 = 1
    const level = calculateCombatLevel(champion, [spell], true, "offensive")
    expect(level).toBe(1)
  })
})
