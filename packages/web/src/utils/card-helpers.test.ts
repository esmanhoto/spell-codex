import { describe, it, expect } from "bun:test"
import { cardImageUrl, CARD_BACK_URL, nameOfCard, findHandCard, findPoolChampion } from "./card-helpers.ts"
import type { CardInfo, PlayerBoard } from "../api.ts"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCard(overrides: Partial<CardInfo> = {}): CardInfo {
  return {
    instanceId: "c1",
    name: "Test Card",
    typeId: 7,
    worldId: 0,
    level: 5,
    setId: "1st",
    cardNumber: 1,
    description: "",
    supportIds: [],
    spellNature: null,
    castPhases: [],
    effects: [],
    ...overrides,
  }
}

const EMPTY_BOARD: PlayerBoard = {
  hand: [], handCount: 0, handHidden: false,
  formation: {}, pool: [],
  drawPileCount: 0, discardCount: 0, discardPile: [], lastingEffects: [],
}

// ─── cardImageUrl ────────────────────────────────────────────────────────────

describe("cardImageUrl", () => {
  it("builds correct URL from setId and cardNumber", () => {
    expect(cardImageUrl("1st", 42)).toBe("/api/cards/1st/42.jpg")
  })

  it("works with different sets", () => {
    expect(cardImageUrl("2nd", 1)).toBe("/api/cards/2nd/1.jpg")
    expect(cardImageUrl("3rd", 100)).toBe("/api/cards/3rd/100.jpg")
  })
})

describe("CARD_BACK_URL", () => {
  it("is a valid path", () => {
    expect(CARD_BACK_URL).toBe("/api/cards/cardback.jpg")
  })
})

// ─── nameOfCard ──────────────────────────────────────────────────────────────

describe("nameOfCard", () => {
  it("finds card in hand", () => {
    const card = makeCard({ instanceId: "h1", name: "Dragon" })
    const boards = { p1: { ...EMPTY_BOARD, hand: [card] } }
    expect(nameOfCard("h1", boards)).toBe("Dragon")
  })

  it("finds card in pool (champion)", () => {
    const champ = makeCard({ instanceId: "pc1", name: "Wizard" })
    const boards = { p1: { ...EMPTY_BOARD, pool: [{ champion: champ, attachments: [] }] } }
    expect(nameOfCard("pc1", boards)).toBe("Wizard")
  })

  it("finds card in pool (attachment)", () => {
    const champ = makeCard({ instanceId: "ch1" })
    const item = makeCard({ instanceId: "att1", name: "Magic Sword" })
    const boards = { p1: { ...EMPTY_BOARD, pool: [{ champion: champ, attachments: [item] }] } }
    expect(nameOfCard("att1", boards)).toBe("Magic Sword")
  })

  it("finds card in formation (realm)", () => {
    const realm = makeCard({ instanceId: "r1", name: "Menzoberranzan" })
    const boards = {
      p1: {
        ...EMPTY_BOARD,
        formation: {
          "0": { realm, holdings: [], holdingCount: 0, isRazed: false, holdingRevealedToAll: false },
        },
      },
    }
    expect(nameOfCard("r1", boards)).toBe("Menzoberranzan")
  })

  it("finds card in formation (holding)", () => {
    const realm = makeCard({ instanceId: "r1" })
    const holding = makeCard({ instanceId: "hld1", name: "Castle" })
    const boards = {
      p1: {
        ...EMPTY_BOARD,
        formation: {
          "0": { realm, holdings: [holding], holdingCount: 1, isRazed: false, holdingRevealedToAll: false },
        },
      },
    }
    expect(nameOfCard("hld1", boards)).toBe("Castle")
  })

  it("searches across multiple players", () => {
    const card = makeCard({ instanceId: "p2card", name: "Enemy Card" })
    const boards = {
      p1: EMPTY_BOARD,
      p2: { ...EMPTY_BOARD, hand: [card] },
    }
    expect(nameOfCard("p2card", boards)).toBe("Enemy Card")
  })

  it("returns truncated instanceId when card not found", () => {
    const result = nameOfCard("abcdefghijklmnop", { p1: EMPTY_BOARD })
    expect(result).toBe("abcdefgh\u2026")
  })

  it("handles null formation slots", () => {
    const boards = {
      p1: { ...EMPTY_BOARD, formation: { "0": null } },
    }
    expect(nameOfCard("missing", boards)).toContain("\u2026")
  })
})

// ─── findHandCard ────────────────────────────────────────────────────────────

describe("findHandCard", () => {
  it("finds card in player's hand", () => {
    const card = makeCard({ instanceId: "h1" })
    const boards = { p1: { ...EMPTY_BOARD, hand: [card] } }
    expect(findHandCard(boards, "h1")).toBe(card)
  })

  it("searches across all players", () => {
    const card = makeCard({ instanceId: "h2" })
    const boards = {
      p1: EMPTY_BOARD,
      p2: { ...EMPTY_BOARD, hand: [card] },
    }
    expect(findHandCard(boards, "h2")).toBe(card)
  })

  it("returns undefined when card not in any hand", () => {
    expect(findHandCard({ p1: EMPTY_BOARD }, "missing")).toBeUndefined()
  })
})

// ─── findPoolChampion ────────────────────────────────────────────────────────

describe("findPoolChampion", () => {
  it("finds champion in pool", () => {
    const champ = makeCard({ instanceId: "ch1" })
    const boards = { p1: { ...EMPTY_BOARD, pool: [{ champion: champ, attachments: [] }] } }
    expect(findPoolChampion(boards, "ch1")).toBe(champ)
  })

  it("searches across all players", () => {
    const champ = makeCard({ instanceId: "ch2" })
    const boards = {
      p1: EMPTY_BOARD,
      p2: { ...EMPTY_BOARD, pool: [{ champion: champ, attachments: [] }] },
    }
    expect(findPoolChampion(boards, "ch2")).toBe(champ)
  })

  it("does not match attachments", () => {
    const champ = makeCard({ instanceId: "ch1" })
    const item = makeCard({ instanceId: "att1" })
    const boards = { p1: { ...EMPTY_BOARD, pool: [{ champion: champ, attachments: [item] }] } }
    expect(findPoolChampion(boards, "att1")).toBeUndefined()
  })

  it("returns undefined when not found", () => {
    expect(findPoolChampion({ p1: EMPTY_BOARD }, "missing")).toBeUndefined()
  })
})
