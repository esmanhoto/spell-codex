import { describe, it, expect } from "bun:test"
import { getTypeInfo, isChampion } from "./type-labels.ts"

describe("getTypeInfo", () => {
  it("returns correct label for all known type IDs", () => {
    expect(getTypeInfo(0).label).toBe("GENERIC")
    expect(getTypeInfo(1).label).toBe("ALLY")
    expect(getTypeInfo(2).label).toBe("ARTIFACT")
    expect(getTypeInfo(3).label).toBe("BLOOD ABILITY")
    expect(getTypeInfo(4).label).toBe("CLERIC SPELL")
    expect(getTypeInfo(6).label).toBe("EVENT")
    expect(getTypeInfo(8).label).toBe("HOLDING")
    expect(getTypeInfo(9).label).toBe("MAGIC ITEM")
    expect(getTypeInfo(11).label).toBe("PSIONIC POWER")
    expect(getTypeInfo(13).label).toBe("REALM")
    expect(getTypeInfo(15).label).toBe("RULE")
    expect(getTypeInfo(17).label).toBe("THIEF SKILL")
    expect(getTypeInfo(18).label).toBe("UNARMED COMBAT")
    expect(getTypeInfo(19).label).toBe("WIZARD SPELL")
    expect(getTypeInfo(21).label).toBe("DUNGEON")
  })

  it("all champion type IDs map to CHAMPION", () => {
    for (const id of [5, 7, 10, 12, 14, 16, 20]) {
      expect(getTypeInfo(id).label).toBe("CHAMPION")
    }
  })

  it("every type has a non-empty color", () => {
    for (let id = 0; id <= 21; id++) {
      const info = getTypeInfo(id)
      expect(info.color.length).toBeGreaterThan(0)
      expect(info.color.startsWith("#")).toBe(true)
    }
  })

  it("returns fallback for unknown type ID", () => {
    const info = getTypeInfo(999)
    expect(info.label).toBe("TYPE 999")
    expect(info.color).toBe("#888")
  })
})

describe("isChampion", () => {
  it("returns true for champion types: 5, 7, 10, 12, 14, 16, 20", () => {
    for (const id of [5, 7, 10, 12, 14, 16, 20]) {
      expect(isChampion(id)).toBe(true)
    }
  })

  it("returns false for non-champion types", () => {
    for (const id of [0, 1, 2, 3, 4, 6, 8, 9, 11, 13, 15, 17, 18, 19, 21]) {
      expect(isChampion(id)).toBe(false)
    }
  })
})
