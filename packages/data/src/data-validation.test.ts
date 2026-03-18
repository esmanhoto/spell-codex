import { describe, test, expect } from "bun:test"
import { readFileSync, readdirSync } from "fs"
import path from "path"
import type { Card } from "./types.ts"
import { parseSpellMeta } from "./extract-cards.ts"

const CARDS_DIR = path.join(import.meta.dir, "..", "cards")
const FORMATS_DIR = path.join(import.meta.dir, "..", "formats")
const DECKS_DIR = path.join(import.meta.dir, "..", "decks")

// Load all card files once
function loadAllCards(): Card[] {
  const files = readdirSync(CARDS_DIR).filter((f) => f.endsWith(".json"))
  const all: Card[] = []
  for (const f of files) {
    const cards: Card[] = JSON.parse(readFileSync(path.join(CARDS_DIR, f), "utf-8"))
    all.push(...cards)
  }
  return all
}

const allCards = loadAllCards()

// ─── Duplicate card detection ────────────────────────────────────────────────

describe("duplicate card detection", () => {
  test("no duplicate (setId, cardNumber) pairs", () => {
    const seen = new Set<string>()
    const duplicates: string[] = []
    for (const card of allCards) {
      const key = `${card.setId}:${card.cardNumber}`
      if (seen.has(key)) duplicates.push(key)
      seen.add(key)
    }
    expect(duplicates).toEqual([])
  })

  test("all cards have non-empty name", () => {
    const unnamed = allCards.filter((c) => !c.name.trim())
    expect(unnamed).toEqual([])
  })

  test("all cards have valid typeId (integer >= 0)", () => {
    const invalid = allCards.filter((c) => typeof c.typeId !== "number" || c.typeId < 0)
    expect(invalid).toEqual([])
  })

  test("all cards have valid worldId in allowed set", () => {
    const validWorldIds = new Set([0, 1, 2, 3, 4, 5, 6, 7, 9])
    const invalid = allCards.filter((c) => !validWorldIds.has(c.worldId))
    expect(invalid.map((c) => `${c.setId}:${c.cardNumber} worldId=${c.worldId}`)).toEqual([])
  })
})

// ─── Deck card reference validation ──────────────────────────────────────────

describe("deck card reference validation", () => {
  const cardKeys = new Set(allCards.map((c) => `${c.setId}:${c.cardNumber}`))

  test("deck files parse as valid JSON", () => {
    const deckFiles = readdirSync(DECKS_DIR).filter((f) => f.endsWith(".json"))
    expect(deckFiles.length).toBeGreaterThan(0)
    for (const f of deckFiles) {
      expect(() => JSON.parse(readFileSync(path.join(DECKS_DIR, f), "utf-8"))).not.toThrow()
    }
  })

  // Note: deck refs may point to sets not yet extracted (only 1st.json exists)
  // So we only check refs within available sets
  test("deck card refs to available sets all resolve", () => {
    const availableSets = new Set(allCards.map((c) => c.setId))
    const deckFiles = readdirSync(DECKS_DIR).filter((f) => f.endsWith(".json"))
    const broken: string[] = []

    for (const f of deckFiles) {
      const deck = JSON.parse(readFileSync(path.join(DECKS_DIR, f), "utf-8"))
      for (const ref of deck.cards ?? []) {
        if (availableSets.has(ref.setId) && !cardKeys.has(`${ref.setId}:${ref.cardNumber}`)) {
          broken.push(`${f}: ${ref.setId}:${ref.cardNumber}`)
        }
      }
    }
    expect(broken).toEqual([])
  })
})

// ─── Format limit consistency ────────────────────────────────────────────────

describe("format limit consistency", () => {
  test("format files parse as valid JSON", () => {
    const formatFiles = readdirSync(FORMATS_DIR).filter((f) => f.endsWith(".json"))
    expect(formatFiles.length).toBeGreaterThan(0)
    for (const f of formatFiles) {
      expect(() => JSON.parse(readFileSync(path.join(FORMATS_DIR, f), "utf-8"))).not.toThrow()
    }
  })

  test("total.min <= total.max in all formats", () => {
    const formatFiles = readdirSync(FORMATS_DIR).filter((f) => f.endsWith(".json"))
    const violations: string[] = []
    for (const f of formatFiles) {
      const fmt = JSON.parse(readFileSync(path.join(FORMATS_DIR, f), "utf-8"))
      if (fmt.total.min > fmt.total.max) {
        violations.push(`${f}: total min=${fmt.total.min} > max=${fmt.total.max}`)
      }
    }
    expect(violations).toEqual([])
  })

  test("championCount.min <= championCount.max in all formats", () => {
    const formatFiles = readdirSync(FORMATS_DIR).filter((f) => f.endsWith(".json"))
    const violations: string[] = []
    for (const f of formatFiles) {
      const fmt = JSON.parse(readFileSync(path.join(FORMATS_DIR, f), "utf-8"))
      if (fmt.championCount.min > fmt.championCount.max) {
        violations.push(`${f}: champion min=${fmt.championCount.min} > max=${fmt.championCount.max}`)
      }
    }
    expect(violations).toEqual([])
  })

  test("typeLimits min <= max in all formats", () => {
    const formatFiles = readdirSync(FORMATS_DIR).filter((f) => f.endsWith(".json"))
    const violations: string[] = []
    for (const f of formatFiles) {
      const fmt = JSON.parse(readFileSync(path.join(FORMATS_DIR, f), "utf-8"))
      for (const [name, limit] of Object.entries(fmt.typeLimits ?? {}) as [string, any][]) {
        if (limit.min > limit.max) {
          violations.push(`${f}: typeLimits[${name}] min=${limit.min} > max=${limit.max}`)
        }
      }
    }
    expect(violations).toEqual([])
  })
})

// ─── Spell meta regex edge cases ─────────────────────────────────────────────

describe("spell meta edge cases", () => {
  test("first tag wins when description has multiple spell tags", () => {
    // parseSpellMeta uses .match() which returns first match
    const result = parseSpellMeta(19, "First (Off/3) then second (Def/5)", [])
    expect(result.spellNature).toBe("offensive")
    expect(result.castPhases).toEqual([3])
  })

  test("description tag takes precedence over attribute tag", () => {
    const result = parseSpellMeta(19, "Spell effect (Def/4)", ["(Off/3)"])
    expect(result.spellNature).toBe("defensive")
    expect(result.castPhases).toEqual([4])
  })

  test("case insensitive Off/Def matching", () => {
    expect(parseSpellMeta(19, "(off/3)", []).spellNature).toBe("offensive")
    expect(parseSpellMeta(19, "(DEF/5)", []).spellNature).toBe("defensive")
  })

  test("all valid CastPhase values accepted", () => {
    expect(parseSpellMeta(4, "(Off/3)", []).castPhases).toEqual([3])
    expect(parseSpellMeta(4, "(Off/4)", []).castPhases).toEqual([4])
    expect(parseSpellMeta(4, "(Off/5)", []).castPhases).toEqual([5])
  })

  test("three phases in tag — no match, falls to default", () => {
    // regex expects (Off), (Off/N), or (Off/N/N) — three slashes breaks the pattern
    // so "(Off/3/4/5)" doesn't match → null nature, default [4]
    const result = parseSpellMeta(19, "(Off/3/4/5)", [])
    expect(result.spellNature).toBeNull()
    expect(result.castPhases).toEqual([4])
  })
})
