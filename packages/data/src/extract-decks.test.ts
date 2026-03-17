import { describe, test, expect } from "bun:test"
import { extractBareValue, parseDeckCardList } from "./extract-decks.ts"

// ─── extractBareValue ────────────────────────────────────────────────────────

describe("extractBareValue", () => {
  test("extracts simple value", () => {
    expect(extractBareValue("set myVar hello", "myVar")).toBe("hello")
  })

  test("extracts numeric value", () => {
    expect(extractBareValue("set tempDeckSize 55", "tempDeckSize")).toBe("55")
  })

  test("returns empty string when variable not found", () => {
    expect(extractBareValue("set otherVar x", "missing")).toBe("")
  })

  test("handles multiple variables — returns correct one", () => {
    const source = "set foo bar\nset baz qux"
    expect(extractBareValue(source, "baz")).toBe("qux")
  })

  test("handles tabs in whitespace", () => {
    expect(extractBareValue("set\tmyVar\tvalue", "myVar")).toBe("value")
  })

  test("handles email-like values", () => {
    expect(extractBareValue("set tempAuthorEmail user@example.com", "tempAuthorEmail")).toBe(
      "user@example.com",
    )
  })

  test("returns empty string for empty source", () => {
    expect(extractBareValue("", "myVar")).toBe("")
  })
})

// ─── parseDeckCardList ───────────────────────────────────────────────────────

describe("parseDeckCardList", () => {
  test("null returns empty array", () => {
    expect(parseDeckCardList(null)).toEqual([])
  })

  test("empty string returns empty array", () => {
    expect(parseDeckCardList("")).toEqual([])
  })

  test("whitespace-only returns empty array", () => {
    expect(parseDeckCardList("   ")).toEqual([])
  })

  test("single card", () => {
    const result = parseDeckCardList("{1st 42}")
    expect(result).toEqual([{ setId: "1st", cardNumber: 42 }])
  })

  test("multiple cards", () => {
    const result = parseDeckCardList("{1st 42} {1st 100} {2nd 7}")
    expect(result).toEqual([
      { setId: "1st", cardNumber: 42 },
      { setId: "1st", cardNumber: 100 },
      { setId: "2nd", cardNumber: 7 },
    ])
  })

  test("trims setId whitespace", () => {
    const result = parseDeckCardList("{ 1st  42}")
    expect(result).toEqual([{ setId: "1st", cardNumber: 42 }])
  })

  test("skips entries with non-numeric cardNumber", () => {
    const result = parseDeckCardList("{1st abc} {2nd 5}")
    expect(result).toEqual([{ setId: "2nd", cardNumber: 5 }])
  })

  test("skips entries with wrong field count", () => {
    const result = parseDeckCardList("{1st} {2nd 5 extra} {3rd 7}")
    expect(result).toEqual([{ setId: "3rd", cardNumber: 7 }])
  })

  test("duplicate card references preserved", () => {
    const result = parseDeckCardList("{1st 42} {1st 42} {1st 42}")
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual(result[1])
  })
})
