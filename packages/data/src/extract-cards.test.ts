import { describe, test, expect } from "bun:test"
import {
  parseLevel,
  parseRarity,
  parseAttributes,
  parseRefList,
  parseSpellMeta,
  parseCardRecord,
} from "./extract-cards.ts"

// ─── parseLevel ──────────────────────────────────────────────────────────────

describe("parseLevel", () => {
  test("empty string returns null", () => {
    expect(parseLevel("")).toBeNull()
  })

  test("bare integer", () => {
    expect(parseLevel("6")).toBe(6)
  })

  test("zero", () => {
    expect(parseLevel("0")).toBe(0)
  })

  test("positive sign kept as string", () => {
    expect(parseLevel("+4")).toBe("+4")
  })

  test("negative sign kept as string", () => {
    expect(parseLevel("-2")).toBe("-2")
  })

  test("slash notation kept as string", () => {
    expect(parseLevel("+2/+1")).toBe("+2/+1")
  })

  test("non-numeric string returned as-is", () => {
    expect(parseLevel("special")).toBe("special")
  })

  test("large number parsed correctly", () => {
    expect(parseLevel("99")).toBe(99)
  })
})

// ─── parseRarity ─────────────────────────────────────────────────────────────

describe("parseRarity", () => {
  test("valid rarities returned as-is", () => {
    for (const r of ["M", "C", "UC", "R", "VR", "S", "V"] as const) {
      expect(parseRarity(r)).toBe(r)
    }
  })

  test("invalid rarity defaults to C", () => {
    expect(parseRarity("X")).toBe("C")
    expect(parseRarity("")).toBe("C")
    expect(parseRarity("rare")).toBe("C")
  })

  test("lowercase rarity is invalid — defaults to C", () => {
    expect(parseRarity("r")).toBe("C")
    expect(parseRarity("uc")).toBe("C")
  })
})

// ─── parseAttributes ────────────────────────────────────────────────────────

describe("parseAttributes", () => {
  test("empty string returns empty array", () => {
    expect(parseAttributes("")).toEqual([])
  })

  test("whitespace-only returns empty array", () => {
    expect(parseAttributes("   ")).toEqual([])
  })

  test("single attribute with trailing period", () => {
    expect(parseAttributes("Dwarf.")).toEqual(["Dwarf"])
  })

  test("multiple attributes separated by period-space", () => {
    expect(parseAttributes("Dwarf. Flyer.")).toEqual(["Dwarf", "Flyer"])
  })

  test("attribute with parenthetical", () => {
    expect(parseAttributes("Elf (drow).")).toEqual(["Elf (drow)"])
  })

  test("three attributes", () => {
    expect(parseAttributes("Undead. Flyer. Swimmer.")).toEqual(["Undead", "Flyer", "Swimmer"])
  })

  test("no trailing period still works", () => {
    expect(parseAttributes("Dwarf")).toEqual(["Dwarf"])
  })
})

// ─── parseRefList ────────────────────────────────────────────────────────────

describe("parseRefList", () => {
  test("empty string returns empty array", () => {
    expect(parseRefList("")).toEqual([])
  })

  test("numeric refs parsed as numbers", () => {
    expect(parseRefList("1 2 9")).toEqual([1, 2, 9])
  })

  test("d/o prefixed refs kept as strings", () => {
    expect(parseRefList("d19 o19 d4 o4")).toEqual(["d19", "o19", "d4", "o4"])
  })

  test("mixed numeric and string refs", () => {
    expect(parseRefList("1 2 d19 o19")).toEqual([1, 2, "d19", "o19"])
  })

  test("braced empty string returns empty array", () => {
    expect(parseRefList("{}")).toEqual([])
  })
})

// ─── parseSpellMeta ──────────────────────────────────────────────────────────

describe("parseSpellMeta", () => {
  test("non-spell typeId returns null nature, empty phases", () => {
    const result = parseSpellMeta(7, "Some hero description", [])
    expect(result.spellNature).toBeNull()
    expect(result.castPhases).toEqual([])
  })

  test("wizard spell (19) with Off tag", () => {
    const result = parseSpellMeta(19, "Does something (Off/3/5)", [])
    expect(result.spellNature).toBe("offensive")
    expect(result.castPhases).toEqual([3, 5])
  })

  test("cleric spell (4) with Def tag", () => {
    const result = parseSpellMeta(4, "Heals a champion (Def/4)", [])
    expect(result.spellNature).toBe("defensive")
    expect(result.castPhases).toEqual([4])
  })

  test("spell tag in attributes instead of description", () => {
    const result = parseSpellMeta(19, "No tag here", ["(Off/3)"])
    expect(result.spellNature).toBe("offensive")
    expect(result.castPhases).toEqual([3])
  })

  test("no spell tag found → null nature, default phase [4]", () => {
    const result = parseSpellMeta(19, "A wizard spell with no tag", [])
    expect(result.spellNature).toBeNull()
    expect(result.castPhases).toEqual([4])
  })

  test("Off with no phases defaults to [4]", () => {
    const result = parseSpellMeta(19, "Something (Off)", [])
    expect(result.spellNature).toBe("offensive")
    expect(result.castPhases).toEqual([4])
  })

  test("duplicate phases deduplicated", () => {
    const result = parseSpellMeta(4, "Spell (Def/4/4)", [])
    expect(result.spellNature).toBe("defensive")
    expect(result.castPhases).toEqual([4])
  })

  test("invalid phase numbers filtered", () => {
    const result = parseSpellMeta(19, "Spell (Off/1/2)", [])
    expect(result.spellNature).toBe("offensive")
    // 1 and 2 are not valid CastPhase (only 3,4,5), so defaults
    expect(result.castPhases).toEqual([4])
  })
})

// ─── parseCardRecord ─────────────────────────────────────────────────────────

describe("parseCardRecord", () => {
  const validRecord =
    "1st 42 6 7 1 0 {Gib Lhadsemlo} {A hero of the Forgotten Realms.} R {Dwarf. Flyer.} {} {1 2 d19 o19} 5"

  test("parses valid 13-field record", () => {
    const card = parseCardRecord(validRecord)
    expect(card).not.toBeNull()
    expect(card!.setId).toBe("1st")
    expect(card!.cardNumber).toBe(42)
    expect(card!.level).toBe(6)
    expect(card!.typeId).toBe(7)
    expect(card!.worldId).toBe(1)
    expect(card!.isAvatar).toBe(false)
    expect(card!.name).toBe("Gib Lhadsemlo")
    expect(card!.description).toBe("A hero of the Forgotten Realms.")
    expect(card!.rarity).toBe("R")
    expect(card!.attributes).toEqual(["Dwarf", "Flyer"])
    expect(card!.supportIds).toEqual([1, 2, "d19", "o19"])
    expect(card!.weight).toBe(5)
    expect(card!.effects).toEqual([])
  })

  test("returns null for fewer than 13 fields", () => {
    expect(parseCardRecord("1st 42 6 7 1 0 {Name} {Desc} R")).toBeNull()
  })

  test("returns null for more than 13 fields", () => {
    const tooMany = validRecord + " extra"
    expect(parseCardRecord(tooMany)).toBeNull()
  })

  test("returns null for non-numeric cardNumber", () => {
    const record = "1st abc 6 7 1 0 {Name} {Desc} R {} {} {} 5"
    expect(parseCardRecord(record)).toBeNull()
  })

  test("returns null for non-numeric typeId", () => {
    const record = "1st 42 6 bad 1 0 {Name} {Desc} R {} {} {} 5"
    expect(parseCardRecord(record)).toBeNull()
  })

  test("invalid worldId defaults to 0", () => {
    const record = "1st 42 6 7 {} 0 {Name} {Desc} R {} {} {} 5"
    const card = parseCardRecord(record)
    expect(card).not.toBeNull()
    expect(card!.worldId).toBe(0)
  })

  test("isAvatar true when field is '1'", () => {
    const record = "1st 42 6 7 1 1 {Name} {Desc} R {} {} {} 5"
    const card = parseCardRecord(record)
    expect(card!.isAvatar).toBe(true)
  })

  test("isAvatar false for any other value", () => {
    const record = "1st 42 6 7 1 0 {Name} {Desc} R {} {} {} 5"
    const card = parseCardRecord(record)
    expect(card!.isAvatar).toBe(false)
  })

  test("non-numeric weight returns null weight", () => {
    const record = "1st 42 6 7 1 0 {Name} {Desc} R {} {} {} {}"
    const card = parseCardRecord(record)
    expect(card!.weight).toBeNull()
  })

  test("spell card gets spellNature and castPhases", () => {
    const record = "1st 42 {} 19 0 0 {Fireball} {Deals damage (Off/3/5)} R {} {} {} 5"
    const card = parseCardRecord(record)
    expect(card).not.toBeNull()
    expect(card!.spellNature).toBe("offensive")
    expect(card!.castPhases).toEqual([3, 5])
  })

  test("non-spell card has null spellNature", () => {
    const card = parseCardRecord(validRecord)
    expect(card!.spellNature).toBeNull()
  })

  test("trims name and setId whitespace", () => {
    const record = " 1st  42 6 7 1 0 { Padded Name } {Desc} R {} {} {} 5"
    const card = parseCardRecord(record)
    expect(card!.setId).toBe("1st")
    expect(card!.name).toBe("Padded Name")
  })
})
