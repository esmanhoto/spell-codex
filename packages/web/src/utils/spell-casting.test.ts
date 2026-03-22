import { describe, it, expect } from "bun:test"
import {
  isSpellCard,
  getCastPhases,
  phaseToCastPhase,
  resolveSpellMove,
  spellCastersInPool,
  spellCasterInCombat,
} from "./spell-casting.ts"
import type { CardInfo, Move, PlayerBoard, CombatInfo } from "../api.ts"

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

// ─── isSpellCard ─────────────────────────────────────────────────────────────

describe("isSpellCard", () => {
  it("typeId 4 (cleric spell) → true", () => {
    expect(isSpellCard(makeCard({ typeId: 4 }))).toBe(true)
  })

  it("typeId 19 (wizard spell) → true", () => {
    expect(isSpellCard(makeCard({ typeId: 19 }))).toBe(true)
  })

  it("non-spell types → false", () => {
    for (const typeId of [1, 2, 5, 6, 7, 8, 9, 10, 12, 13, 14, 16, 20]) {
      expect(isSpellCard(makeCard({ typeId }))).toBe(false)
    }
  })
})

// ─── getCastPhases ───────────────────────────────────────────────────────────

describe("getCastPhases", () => {
  it("returns card's castPhases when non-empty", () => {
    expect(getCastPhases(makeCard({ castPhases: [3, 5] }))).toEqual([3, 5])
  })

  it("defaults to [4] when castPhases is empty", () => {
    expect(getCastPhases(makeCard({ castPhases: [] }))).toEqual([4])
  })

  it("deduplicates phases", () => {
    expect(getCastPhases(makeCard({ castPhases: [3, 3, 4] }))).toEqual([3, 4])
  })
})

// ─── phaseToCastPhase ────────────────────────────────────────────────────────

describe("phaseToCastPhase", () => {
  it("PLAY_REALM → 3", () => expect(phaseToCastPhase("PLAY_REALM")).toBe(3))
  it("POOL → 3", () => expect(phaseToCastPhase("POOL")).toBe(3))
  it("COMBAT → 4", () => expect(phaseToCastPhase("COMBAT")).toBe(4))
  it("PHASE_FIVE → 5", () => expect(phaseToCastPhase("PHASE_FIVE")).toBe(5))
  it("unknown phase → null", () => expect(phaseToCastPhase("END_TURN")).toBeNull())
})

// ─── resolveSpellMove ────────────────────────────────────────────────────────

describe("resolveSpellMove", () => {
  it("finds PLAY_COMBAT_CARD for the spell", () => {
    const moves: Move[] = [
      { type: "PASS" },
      { type: "PLAY_COMBAT_CARD", cardInstanceId: "spell-1" },
    ]
    const result = resolveSpellMove(moves, "spell-1")
    expect(result).toEqual({ type: "PLAY_COMBAT_CARD", cardInstanceId: "spell-1" })
  })

  it("finds PLAY_PHASE3_CARD for the spell", () => {
    const moves: Move[] = [
      { type: "PLAY_PHASE3_CARD", cardInstanceId: "spell-1", casterInstanceId: "wiz" },
    ]
    const result = resolveSpellMove(moves, "spell-1")
    expect(result!.type).toBe("PLAY_PHASE3_CARD")
  })

  it("finds PLAY_PHASE5_CARD for the spell", () => {
    const moves: Move[] = [
      { type: "PLAY_PHASE5_CARD", cardInstanceId: "spell-1" },
    ]
    const result = resolveSpellMove(moves, "spell-1")
    expect(result!.type).toBe("PLAY_PHASE5_CARD")
  })

  it("prefers PLAY_COMBAT_CARD over PLAY_PHASE3_CARD", () => {
    const moves: Move[] = [
      { type: "PLAY_PHASE3_CARD", cardInstanceId: "spell-1" },
      { type: "PLAY_COMBAT_CARD", cardInstanceId: "spell-1" },
    ]
    expect(resolveSpellMove(moves, "spell-1")!.type).toBe("PLAY_COMBAT_CARD")
  })

  it("returns null when no matching move", () => {
    const moves: Move[] = [{ type: "PASS" }]
    expect(resolveSpellMove(moves, "spell-1")).toBeNull()
  })

  it("does not match a different cardInstanceId", () => {
    const moves: Move[] = [
      { type: "PLAY_COMBAT_CARD", cardInstanceId: "other-spell" },
    ]
    expect(resolveSpellMove(moves, "spell-1")).toBeNull()
  })
})

// ─── spellCastersInPool ──────────────────────────────────────────────────────

describe("spellCastersInPool", () => {
  const wizardChampion = makeCard({
    instanceId: "wiz1",
    typeId: 14,
    name: "Gandalf",
    supportIds: [19, "d19", "o19"],
  })

  const clericChampion = makeCard({
    instanceId: "clr1",
    typeId: 5,
    name: "Cleric",
    supportIds: [4, "d4", "o4"],
  })

  it("returns champions whose supportIds include the spell typeId", () => {
    const board: PlayerBoard = {
      ...EMPTY_BOARD,
      pool: [{ champion: wizardChampion, attachments: [] }],
    }
    const wizardSpell = makeCard({ typeId: 19, spellNature: null })
    expect(spellCastersInPool(wizardSpell, board)).toEqual([wizardChampion])
  })

  it("returns empty when no champion can cast", () => {
    const board: PlayerBoard = {
      ...EMPTY_BOARD,
      pool: [{ champion: clericChampion, attachments: [] }],
    }
    const wizardSpell = makeCard({ typeId: 19, spellNature: null })
    expect(spellCastersInPool(wizardSpell, board)).toEqual([])
  })

  it("offensive spell matches o-prefixed supportId", () => {
    const champion = makeCard({ instanceId: "ch1", supportIds: ["o19"] })
    const board: PlayerBoard = {
      ...EMPTY_BOARD,
      pool: [{ champion, attachments: [] }],
    }
    const spell = makeCard({ typeId: 19, spellNature: "offensive" })
    expect(spellCastersInPool(spell, board).length).toBe(1)
  })

  it("defensive spell matches d-prefixed supportId", () => {
    const champion = makeCard({ instanceId: "ch1", supportIds: ["d4"] })
    const board: PlayerBoard = {
      ...EMPTY_BOARD,
      pool: [{ champion, attachments: [] }],
    }
    const spell = makeCard({ typeId: 4, spellNature: "defensive" })
    expect(spellCastersInPool(spell, board).length).toBe(1)
  })

  it("offensive spell does NOT match d-prefixed supportId", () => {
    const champion = makeCard({ instanceId: "ch1", supportIds: ["d19"] })
    const board: PlayerBoard = {
      ...EMPTY_BOARD,
      pool: [{ champion, attachments: [] }],
    }
    const spell = makeCard({ typeId: 19, spellNature: "offensive" })
    expect(spellCastersInPool(spell, board)).toEqual([])
  })

  it("attachment supportIds contribute to casting", () => {
    const champion = makeCard({ instanceId: "ch1", supportIds: [] })
    const item = makeCard({ instanceId: "item1", supportIds: [19] })
    const board: PlayerBoard = {
      ...EMPTY_BOARD,
      pool: [{ champion, attachments: [item] }],
    }
    const wizardSpell = makeCard({ typeId: 19, spellNature: null })
    expect(spellCastersInPool(wizardSpell, board).length).toBe(1)
  })

  it("returns multiple casters when several can cast", () => {
    const wiz1 = makeCard({ instanceId: "wiz1", supportIds: [19] })
    const wiz2 = makeCard({ instanceId: "wiz2", supportIds: ["o19", "d19"] })
    const board: PlayerBoard = {
      ...EMPTY_BOARD,
      pool: [
        { champion: wiz1, attachments: [] },
        { champion: wiz2, attachments: [] },
      ],
    }
    const spell = makeCard({ typeId: 19, spellNature: null })
    expect(spellCastersInPool(spell, board).length).toBe(2)
  })

  it("non-spell card returns empty", () => {
    const board: PlayerBoard = {
      ...EMPTY_BOARD,
      pool: [{ champion: wizardChampion, attachments: [] }],
    }
    const event = makeCard({ typeId: 6 })
    expect(spellCastersInPool(event, board)).toEqual([])
  })
})

// ─── spellCasterInCombat ─────────────────────────────────────────────────────

describe("spellCasterInCombat", () => {
  const attacker = makeCard({ instanceId: "att1", supportIds: [19, "o19"] })
  const defender = makeCard({ instanceId: "def1", supportIds: [4, "d4"] })

  const makeCombat = (overrides: Partial<CombatInfo> = {}): CombatInfo => ({
    attackingPlayer: "p1",
    defendingPlayer: "p2",
    targetSlot: "0",
    roundPhase: "CARD_PLAY",
    attacker,
    defender,
    attackerCards: [],
    defenderCards: [],
    attackerLevel: 5,
    defenderLevel: 3,
    attackerManualLevel: null,
    defenderManualLevel: null,
    championsUsedThisBattle: [],
    borrowedChampions: {},
    ...overrides,
  })

  const boardWithChampion = (champ: CardInfo): PlayerBoard => ({
    ...EMPTY_BOARD,
    pool: [{ champion: champ, attachments: [] }],
  })

  it("returns empty when combat is null", () => {
    const spell = makeCard({ typeId: 19 })
    expect(spellCasterInCombat(spell, null, "p1", EMPTY_BOARD, {})).toEqual([])
  })

  it("returns empty when roundPhase is not CARD_PLAY", () => {
    const combat = makeCombat({ roundPhase: "DECLARING" })
    const spell = makeCard({ typeId: 19 })
    expect(spellCasterInCombat(spell, combat, "p1", boardWithChampion(attacker), {})).toEqual([])
  })

  it("attacker can cast wizard spell with supportId 19", () => {
    const combat = makeCombat()
    const spell = makeCard({ typeId: 19, spellNature: null })
    const board = boardWithChampion(attacker)
    const result = spellCasterInCombat(spell, combat, "p1", board, { p1: board })
    expect(result).toEqual([attacker])
  })

  it("defender can cast cleric spell with supportId 4", () => {
    const combat = makeCombat()
    const spell = makeCard({ typeId: 4, spellNature: null })
    const defBoard = boardWithChampion(defender)
    const p1Board: PlayerBoard = {
      ...EMPTY_BOARD,
      formation: { "0": { realm: makeCard({ supportIds: [] }), holdings: [], holdingCount: 0, isRazed: false, holdingRevealedToAll: false } },
    }
    const result = spellCasterInCombat(spell, combat, "p2", defBoard, { p1: p1Board, p2: defBoard })
    expect(result).toEqual([defender])
  })

  it("defender gets bonus supportIds from realm and holdings", () => {
    const defChamp = makeCard({ instanceId: "def-no-support", supportIds: [] })
    const realm = makeCard({ instanceId: "realm1", supportIds: [4] })
    const combat = makeCombat({ defender: defChamp })

    // defender's board has the realm at targetSlot "0" (realm being defended)
    const defBoard: PlayerBoard = {
      ...EMPTY_BOARD,
      pool: [{ champion: defChamp, attachments: [] }],
      formation: {
        "0": { realm, holdings: [], holdingCount: 0, isRazed: false, holdingRevealedToAll: false },
      },
    }

    const spell = makeCard({ typeId: 4, spellNature: null })
    // p2 is defending their own realm at slot 0
    const result = spellCasterInCombat(spell, combat, "p2", defBoard, { p1: EMPTY_BOARD, p2: defBoard })
    expect(result).toEqual([defChamp])
  })

  it("attacker cannot cast when champion lacks support", () => {
    const noSupport = makeCard({ instanceId: "ns1", supportIds: [] })
    const combat = makeCombat({ attacker: noSupport })
    const spell = makeCard({ typeId: 19 })
    const board = boardWithChampion(noSupport)
    expect(spellCasterInCombat(spell, combat, "p1", board, { p1: board })).toEqual([])
  })
})
