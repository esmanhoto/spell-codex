import { describe, test, expect } from "bun:test"
import { seededShuffle, parseLevel } from "../../src/utils.ts"

// ─── seededShuffle edge cases ────────────────────────────────────────────────

describe("seededShuffle: edge cases", () => {
  test("empty array returns empty array", () => {
    expect(seededShuffle([], 42)).toEqual([])
  })

  test("single-element array returns same element", () => {
    expect(seededShuffle([1], 42)).toEqual([1])
  })

  test("two-element array returns a permutation", () => {
    const result = seededShuffle([1, 2], 42)
    expect(result).toHaveLength(2)
    expect(result).toContain(1)
    expect(result).toContain(2)
  })

  test("same seed produces same result", () => {
    const arr = [1, 2, 3, 4, 5]
    const a = seededShuffle(arr, 99)
    const b = seededShuffle(arr, 99)
    expect(a).toEqual(b)
  })

  test("different seeds produce different results (with high probability)", () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const a = seededShuffle(arr, 1)
    const b = seededShuffle(arr, 2)
    // Extremely unlikely to be identical with different seeds
    expect(a).not.toEqual(b)
  })

  test("does not mutate the original array", () => {
    const arr = [1, 2, 3]
    const copy = [...arr]
    seededShuffle(arr, 42)
    expect(arr).toEqual(copy)
  })

  test("seed 0 is treated as non-zero (coerced)", () => {
    // seed >>> 0 || 1 → 0 || 1 → 1
    const result = seededShuffle([1, 2, 3, 4, 5], 0)
    expect(result).toHaveLength(5)
  })
})

// ─── parseLevel edge cases ───────────────────────────────────────────────────

describe("parseLevel: invalid/edge formats", () => {
  test("null returns 0", () => {
    expect(parseLevel(null)).toBe(0)
  })

  test("numeric level returns as-is", () => {
    expect(parseLevel(5)).toBe(5)
    expect(parseLevel(0)).toBe(0)
    expect(parseLevel(-2)).toBe(-2)
  })

  test("valid string \"+4\" returns 4", () => {
    expect(parseLevel("+4")).toBe(4)
  })

  test("valid slash \"+2/+1\" returns offensive by default", () => {
    expect(parseLevel("+2/+1")).toBe(2)
    expect(parseLevel("+2/+1", "defensive")).toBe(1)
  })

  test("\"++4\" — parseInt stops at first non-digit, returns NaN → 0", () => {
    // parseInt("++4") is NaN
    expect(parseLevel("++4")).toBe(0)
  })

  test("\"+4/+3/+2\" — split gives 3 parts, only first two used", () => {
    // split("/") → ["+4", "+3", "+2"], offStr="+4", defStr="+3"
    expect(parseLevel("+4/+3/+2", "offensive")).toBe(4)
    expect(parseLevel("+4/+3/+2", "defensive")).toBe(3)
  })

  test("empty string returns 0 (parseInt NaN)", () => {
    expect(parseLevel("")).toBe(0)
  })

  test("non-numeric string returns 0", () => {
    expect(parseLevel("abc")).toBe(0)
  })

  test("negative string \"-3\" returns -3", () => {
    expect(parseLevel("-3")).toBe(-3)
  })

  test("slash with empty parts \"/\" returns 0", () => {
    // split("/") → ["", ""], parseInt("") → NaN → 0
    expect(parseLevel("/")).toBe(0)
    expect(parseLevel("/", "defensive")).toBe(0)
  })
})
