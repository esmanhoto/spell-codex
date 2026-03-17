import { describe, test, expect, beforeEach } from "bun:test"
import { isUniqueInPlay } from "../../src/legal-moves.ts"
import { initGame } from "../../src/init.ts"
import { _resetInstanceCounter } from "../../src/utils.ts"
import type { GameState } from "../../src/types.ts"
import { DEFAULT_CONFIG, CHAMPION_WIZARD_FR, REALM_FR, ARTIFACT_FR, HOLDING_FR } from "../fixtures.ts"
import { inst } from "../scenario-builders.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

function stateWithPoolChampion(name: string, typeId: number): GameState {
  const base = initGame(DEFAULT_CONFIG)
  const champion = inst("pool-c", {
    setId: "test", cardNumber: 999, name, typeId, worldId: 0,
    isAvatar: false, level: 5, description: "", attributes: [], supportIds: [], effects: [],
  })
  return {
    ...base,
    players: {
      ...base.players,
      p1: { ...base.players["p1"]!, pool: [{ champion, attachments: [] }] },
    },
  }
}

describe("cosmos: case sensitivity of name matching", () => {
  test("exact name match blocks play", () => {
    const state = stateWithPoolChampion("Elminster", 20)
    expect(isUniqueInPlay(CHAMPION_WIZARD_FR, state)).toBe(false) // "Elminster", typeId 20
  })

  test("different case is NOT blocked (case-sensitive)", () => {
    const state = stateWithPoolChampion("ELMINSTER", 20)
    // "ELMINSTER" !== "Elminster" — different case passes cosmos check
    expect(isUniqueInPlay(CHAMPION_WIZARD_FR, state)).toBe(true)
  })

  test("lowercase variant is NOT blocked", () => {
    const state = stateWithPoolChampion("elminster", 20)
    expect(isUniqueInPlay(CHAMPION_WIZARD_FR, state)).toBe(true)
  })

  test("same name but different typeId is NOT blocked (both must match)", () => {
    const state = stateWithPoolChampion("Elminster", 7) // Hero, not Wizard(20)
    // nameAndTypeMatch requires BOTH name AND typeId to match
    expect(isUniqueInPlay(CHAMPION_WIZARD_FR, state)).toBe(true)
  })
})

describe("cosmos: checks across all zones", () => {
  test("champion in opponent pool blocks both players", () => {
    const base = initGame(DEFAULT_CONFIG)
    const champion = inst("opp-c", CHAMPION_WIZARD_FR)
    const state: GameState = {
      ...base,
      players: {
        ...base.players,
        p2: { ...base.players["p2"]!, pool: [{ champion, attachments: [] }] },
      },
    }
    // p1 tries to play same champion — blocked
    expect(isUniqueInPlay(CHAMPION_WIZARD_FR, state)).toBe(false)
  })

  test("realm in formation blocks duplicate realm", () => {
    const base = initGame(DEFAULT_CONFIG)
    const realm = inst("r1", REALM_FR)
    const state: GameState = {
      ...base,
      players: {
        ...base.players,
        p1: {
          ...base.players["p1"]!,
          formation: { size: 6, slots: { A: { realm, isRazed: false, holdings: [] } } },
        },
      },
    }
    expect(isUniqueInPlay(REALM_FR, state)).toBe(false)
  })

  test("razed realm STILL blocks (razed realms stay in formation)", () => {
    const base = initGame(DEFAULT_CONFIG)
    const realm = inst("r1", REALM_FR)
    const state: GameState = {
      ...base,
      players: {
        ...base.players,
        p1: {
          ...base.players["p1"]!,
          formation: { size: 6, slots: { A: { realm, isRazed: true, holdings: [] } } },
        },
      },
    }
    expect(isUniqueInPlay(REALM_FR, state)).toBe(false)
  })

  test("champion in limbo does NOT block (limbo excluded)", () => {
    const base = initGame(DEFAULT_CONFIG)
    const champion = inst("limbo-c", CHAMPION_WIZARD_FR)
    const state: GameState = {
      ...base,
      players: {
        ...base.players,
        p1: {
          ...base.players["p1"]!,
          pool: [],
          limbo: [{ champion, attachments: [], returnsOnTurn: 99 }],
        },
      },
    }
    expect(isUniqueInPlay(CHAMPION_WIZARD_FR, state)).toBe(true)
  })

  test("artifact as pool attachment blocks duplicate artifact", () => {
    const base = initGame(DEFAULT_CONFIG)
    const champion = inst("c", CHAMPION_WIZARD_FR)
    const artifact = inst("art", ARTIFACT_FR)
    const state: GameState = {
      ...base,
      players: {
        ...base.players,
        p1: { ...base.players["p1"]!, pool: [{ champion, attachments: [artifact] }] },
      },
    }
    expect(isUniqueInPlay(ARTIFACT_FR, state)).toBe(false)
  })

  test("holding on realm blocks duplicate holding", () => {
    const base = initGame(DEFAULT_CONFIG)
    const realm = inst("r1", REALM_FR)
    const holding = inst("h1", HOLDING_FR)
    const state: GameState = {
      ...base,
      players: {
        ...base.players,
        p1: {
          ...base.players["p1"]!,
          formation: { size: 6, slots: { A: { realm, isRazed: false, holdings: [holding] } } },
        },
      },
    }
    expect(isUniqueInPlay(HOLDING_FR, state)).toBe(false)
  })
})
