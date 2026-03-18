import { describe, it, expect } from "bun:test"
import { generateGameSlug } from "../src/slug.ts"

describe("generateGameSlug", () => {
  it("returns a valid 3-word lowercase slug", () => {
    for (let i = 0; i < 10; i++) {
      const slug = generateGameSlug()
      expect(slug).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/)
    }
  })

  it("generates distinct slugs across 20 calls", () => {
    const slugs = new Set(Array.from({ length: 20 }, () => generateGameSlug()))
    expect(slugs.size).toBeGreaterThan(1)
  })
})
