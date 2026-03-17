import { describe, it, expect } from "bun:test"
import { generateGameSlug } from "../src/slug.ts"

describe("generateGameSlug", () => {
  it("returns a lowercase hyphen-separated 3-word string", () => {
    const slug = generateGameSlug()
    const parts = slug.split("-")
    expect(parts.length).toBe(3)
    expect(slug).toBe(slug.toLowerCase())
  })

  it("produces non-empty segments", () => {
    const slug = generateGameSlug()
    for (const part of slug.split("-")) {
      expect(part.length).toBeGreaterThan(0)
    }
  })

  it("generates different slugs on repeated calls", () => {
    const slugs = new Set(Array.from({ length: 20 }, () => generateGameSlug()))
    // With 41*27*25 = 27,675 combos, 20 draws should almost certainly differ
    expect(slugs.size).toBeGreaterThan(1)
  })

  it("contains only lowercase letters and hyphens", () => {
    for (let i = 0; i < 10; i++) {
      expect(/^[a-z]+(-[a-z]+){2}$/.test(generateGameSlug())).toBe(true)
    }
  })
})
