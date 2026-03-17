import { describe, test, expect } from "bun:test"
import { readFileSync, readdirSync } from "fs"
import path from "path"
import type { CardSet, World, WorldId } from "./types.ts"

const OUT_DIR = path.join(import.meta.dir, "..")
const CARDS_DIR = path.join(OUT_DIR, "cards")

const sets: CardSet[] = JSON.parse(readFileSync(path.join(OUT_DIR, "sets.json"), "utf-8"))
const worlds: World[] = JSON.parse(readFileSync(path.join(OUT_DIR, "worlds.json"), "utf-8"))

// ─── sets.json ───────────────────────────────────────────────────────────────

describe("sets.json", () => {
  test("is a non-empty array", () => {
    expect(Array.isArray(sets)).toBe(true)
    expect(sets.length).toBeGreaterThan(0)
  })

  test("no duplicate set ids", () => {
    const ids = sets.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test("all sets have required fields", () => {
    for (const s of sets) {
      expect(typeof s.id).toBe("string")
      expect(s.id.length).toBeGreaterThan(0)
      expect(typeof s.name).toBe("string")
      expect(["edition", "booster", "community", "international"]).toContain(s.class)
      expect(typeof s.cardCount).toBe("number")
      expect(typeof s.chaseCount).toBe("number")
    }
  })

  test("'NO' meta entry excluded", () => {
    expect(sets.find((s) => s.id === "NO")).toBeUndefined()
  })

  test("cardCount matches actual extracted JSON card count", () => {
    const cardFiles = readdirSync(CARDS_DIR).filter((f) => f.endsWith(".json"))
    for (const f of cardFiles) {
      const setId = path.basename(f, ".json")
      const cards = JSON.parse(readFileSync(path.join(CARDS_DIR, f), "utf-8"))
      const setEntry = sets.find((s) => s.id === setId)
      if (setEntry) {
        expect(setEntry.cardCount).toBe(cards.length)
      }
    }
  })

  test("chaseCount is non-negative integer", () => {
    for (const s of sets) {
      expect(Number.isInteger(s.chaseCount)).toBe(true)
      expect(s.chaseCount).toBeGreaterThanOrEqual(0)
    }
  })
})

// ─── worlds.json ─────────────────────────────────────────────────────────────

describe("worlds.json", () => {
  const VALID_WORLD_IDS: WorldId[] = [0, 1, 2, 3, 4, 5, 6, 7, 9]

  test("is a non-empty array", () => {
    expect(Array.isArray(worlds)).toBe(true)
    expect(worlds.length).toBeGreaterThan(0)
  })

  test("covers all valid world IDs", () => {
    const ids = worlds.map((w) => w.id)
    for (const wid of VALID_WORLD_IDS) {
      expect(ids).toContain(wid)
    }
  })

  test("no duplicate world ids", () => {
    const ids = worlds.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test("no world ID 8 (gap in spec)", () => {
    expect(worlds.find((w) => w.id === (8 as WorldId))).toBeUndefined()
  })

  test("all worlds have required fields", () => {
    for (const w of worlds) {
      expect(typeof w.id).toBe("number")
      expect(typeof w.name).toBe("string")
      expect(w.name.length).toBeGreaterThan(0)
      expect(typeof w.shortName).toBe("string")
      expect(typeof w.iconFile).toBe("string")
      expect(w.iconFile).toMatch(/\.gif$/)
    }
  })

  test("exactly 9 worlds (0-7 + 9)", () => {
    expect(worlds).toHaveLength(9)
  })
})
