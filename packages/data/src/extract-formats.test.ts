import { describe, test, expect } from "bun:test"
import { parseLimitBlock, parseTotalBlock } from "./extract-formats.ts"

// ─── parseLimitBlock ─────────────────────────────────────────────────────────

describe("parseLimitBlock", () => {
  test("null returns empty object", () => {
    expect(parseLimitBlock(null)).toEqual({})
  })

  test("empty string returns empty object", () => {
    expect(parseLimitBlock("")).toEqual({})
  })

  test("single limit group", () => {
    const result = parseLimitBlock("Hero 0 10 3")
    expect(result).toEqual({ Hero: { min: 0, max: 10, maxCopies: 3 } })
  })

  test("multiple limit groups", () => {
    const result = parseLimitBlock("Hero 0 10 3 Ally 0 20 4 Realm 3 10 1")
    expect(result).toEqual({
      Hero: { min: 0, max: 10, maxCopies: 3 },
      Ally: { min: 0, max: 20, maxCopies: 4 },
      Realm: { min: 3, max: 10, maxCopies: 1 },
    })
  })

  test("braced type name with spaces", () => {
    const result = parseLimitBlock("{Wizard Spell} 0 5 2")
    expect(result).toEqual({ "Wizard Spell": { min: 0, max: 5, maxCopies: 2 } })
  })

  test("skips groups with non-numeric values", () => {
    const result = parseLimitBlock("Hero 0 10 3 Bad x y z Ally 0 5 1")
    expect(result).toEqual({
      Hero: { min: 0, max: 10, maxCopies: 3 },
      Ally: { min: 0, max: 5, maxCopies: 1 },
    })
  })

  test("incomplete trailing group ignored", () => {
    // Only 2 values after name — not enough for a group
    const result = parseLimitBlock("Hero 0 10 3 Orphan 1 2")
    expect(result).toEqual({ Hero: { min: 0, max: 10, maxCopies: 3 } })
  })

  test("min > max is not validated (passes through)", () => {
    const result = parseLimitBlock("Broken 10 5 1")
    expect(result).toEqual({ Broken: { min: 10, max: 5, maxCopies: 1 } })
  })
})

// ─── parseTotalBlock ─────────────────────────────────────────────────────────

describe("parseTotalBlock", () => {
  test("null returns defaults", () => {
    const result = parseTotalBlock(null)
    expect(result.total).toEqual({ min: 55, max: 55 })
    expect(result.championCount).toEqual({ min: 1, max: 20 })
    expect(result.maxChampionLevels).toBe(90)
    expect(result.maxAvatars).toBe(1)
  })

  test("parses All row", () => {
    const result = parseTotalBlock("All 75 75")
    expect(result.total).toEqual({ min: 75, max: 75 })
  })

  test("parses Champions row", () => {
    const result = parseTotalBlock("Champions 3 15")
    expect(result.championCount).toEqual({ min: 3, max: 15 })
  })

  test("parses Levels row — takes max", () => {
    const result = parseTotalBlock("Levels 0 120")
    expect(result.maxChampionLevels).toBe(120)
  })

  test("parses Avatars row — takes max", () => {
    const result = parseTotalBlock("Avatars 0 2")
    expect(result.maxAvatars).toBe(2)
  })

  test("parses full block with all rows", () => {
    const block = "All 110 110 Avatars 0 3 Chase 0 110 Champions 5 25 Levels 0 150"
    const result = parseTotalBlock(block)
    expect(result.total).toEqual({ min: 110, max: 110 })
    expect(result.maxAvatars).toBe(3)
    expect(result.championCount).toEqual({ min: 5, max: 25 })
    expect(result.maxChampionLevels).toBe(150)
  })

  test("case insensitive labels", () => {
    const result = parseTotalBlock("all 60 60 CHAMPIONS 2 10")
    expect(result.total).toEqual({ min: 60, max: 60 })
    expect(result.championCount).toEqual({ min: 2, max: 10 })
  })

  test("skips rows with non-numeric values", () => {
    const result = parseTotalBlock("All 55 55 Bad x y Champions 1 20")
    expect(result.total).toEqual({ min: 55, max: 55 })
    expect(result.championCount).toEqual({ min: 1, max: 20 })
  })
})
