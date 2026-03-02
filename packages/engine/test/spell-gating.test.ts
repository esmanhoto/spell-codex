import { describe, expect, test } from "bun:test"
import { applyMove, EngineError } from "../src/engine.ts"
import { getLegalMoves } from "../src/legal-moves.ts"
import { getCastPhases, getSpellDirection, canChampionUseSpell } from "../src/spell-gating.ts"
import { Phase } from "../src/types.ts"
import type { CardData, CardInstance, GameState } from "../src/types.ts"
import { initGame } from "../src/init.ts"
import { DEFAULT_CONFIG, REALM_GENERIC } from "./fixtures.ts"

function makeSpell(
  cardNumber: number,
  name: string,
  description: string,
  attributes: string[] = [],
): CardData {
  return {
    setId: "1st",
    cardNumber,
    name,
    typeId: 19,
    worldId: 0,
    isAvatar: false,
    level: null,
    description,
    attributes,
    supportIds: [],
    effects: [],
  }
}

function makeWizard(
  cardNumber: number,
  supportIds: Array<number | string>,
  level: number = 5,
): CardData {
  return {
    setId: "1st",
    cardNumber,
    name: `Wizard-${cardNumber}`,
    typeId: 20,
    worldId: 0,
    isAvatar: false,
    level,
    description: "",
    attributes: [],
    supportIds,
    effects: [],
  }
}

function ci(instanceId: string, card: CardData): CardInstance {
  return { instanceId, card }
}

function baseState(): GameState {
  return initGame(DEFAULT_CONFIG)
}

function withPoolState(hand: CardInstance[], champion: CardInstance): GameState {
  const s = baseState()
  return {
    ...s,
    phase: Phase.Pool,
    activePlayer: "p1",
    players: {
      ...s.players,
      p1: {
        ...s.players["p1"]!,
        hand,
        pool: [{ champion, attachments: [] }],
      },
    },
  }
}

function withCombatCardPlayState(params: {
  actingPlayer: "p1" | "p2"
  attackingPlayer: "p1" | "p2"
  defender: CardInstance
  attacker: CardInstance
  hand: CardInstance[]
}): GameState {
  const s = baseState()
  return {
    ...s,
    phase: Phase.Combat,
    activePlayer: params.actingPlayer,
    players: {
      ...s.players,
      p1: {
        ...s.players["p1"]!,
        hand: params.actingPlayer === "p1" ? params.hand : [],
        pool: [params.attackingPlayer === "p1" ? { champion: params.attacker, attachments: [] } : { champion: params.defender, attachments: [] }],
        formation: { size: 6, slots: {} },
      },
      p2: {
        ...s.players["p2"]!,
        hand: params.actingPlayer === "p2" ? params.hand : [],
        pool: [params.attackingPlayer === "p2" ? { champion: params.attacker, attachments: [] } : { champion: params.defender, attachments: [] }],
        formation: {
          size: 6,
          slots: {
            A: { realm: ci("realm-a", REALM_GENERIC), isRazed: false, holdings: [] },
          },
        },
      },
    },
    combatState: {
      attackingPlayer: params.attackingPlayer,
      defendingPlayer: params.attackingPlayer === "p1" ? "p2" : "p1",
      targetRealmSlot: "A",
      roundPhase: "CARD_PLAY",
      attacker: params.attacker,
      defender: params.defender,
      attackerCards: [],
      defenderCards: [],
      championsUsedThisBattle: [params.attacker.instanceId, params.defender.instanceId],
      attackerManualLevel: null,
      defenderManualLevel: null,
    },
  }
}

describe("spell-gating helpers", () => {
  test("parses direction and phases from description and attributes", () => {
    const off34 = makeSpell(9001, "Off 3/4", "Test. (Off/3/4)")
    const def3 = makeSpell(9002, "Def 3/5", "Test. (Def/3/5)")
    const attrDef = makeSpell(9003, "Attr Def", "No tag in description.", ["(Def)"])

    expect(getSpellDirection(off34)).toBe("offensive")
    expect(getCastPhases(off34)).toEqual([3, 4])

    expect(getSpellDirection(def3)).toBe("defensive")
    expect(getCastPhases(def3)).toEqual([3, 5])

    expect(getSpellDirection(attrDef)).toBe("defensive")
    expect(getCastPhases(attrDef)).toEqual([4]) // default
  })

  test("canChampionUseSpell checks supportIds by spell direction", () => {
    const off4 = makeSpell(9010, "Off", "Spell. (Off/4)")
    const def4 = makeSpell(9011, "Def", "Spell. (Def/4)")
    const offOnly = makeWizard(9100, ["o19"])
    const defOnly = makeWizard(9101, ["d19"])
    const allByType = makeWizard(9102, [19])

    expect(canChampionUseSpell(off4, offOnly)).toBe(true)
    expect(canChampionUseSpell(off4, defOnly)).toBe(false)
    expect(canChampionUseSpell(def4, defOnly)).toBe(true)
    expect(canChampionUseSpell(def4, offOnly)).toBe(false)
    expect(canChampionUseSpell(def4, allByType)).toBe(true)
  })
})

describe("spell-gating legal moves", () => {
  test("phase 3 shows only spells that include phase 3", () => {
    const champ = ci("wiz-pool", makeWizard(9200, ["o19", "d19"]))
    const off4 = ci("off4", makeSpell(9201, "Off4", "Test. (Off/4)"))
    const off34 = ci("off34", makeSpell(9202, "Off34", "Test. (Off/3/4)"))
    const s = withPoolState([off4, off34], champ)

    const moves = getLegalMoves(s, "p1")
      .filter(m => m.type === "PLAY_PHASE3_CARD")
      .map(m => (m as { cardInstanceId: string }).cardInstanceId)

    expect(moves.includes("off34")).toBe(true)
    expect(moves.includes("off4")).toBe(false)
  })

  test("defender can cast offensive spell in combat when eligible", () => {
    const defender = ci("def", makeWizard(9300, ["o19"], 4))
    const attacker = ci("att", makeWizard(9301, ["d19"], 8))
    const offensiveSpell = ci("spell-off", makeSpell(9302, "Off", "Spell. (Off/4)"))
    const s = withCombatCardPlayState({
      actingPlayer: "p1",
      attackingPlayer: "p2",
      attacker,
      defender,
      hand: [offensiveSpell],
    })

    const moves = getLegalMoves(s, "p1")
    expect(
      moves.some(m => m.type === "PLAY_COMBAT_CARD" &&
        (m as { cardInstanceId: string }).cardInstanceId === "spell-off"),
    ).toBe(true)
  })

  test("attacker can cast defensive spell in combat when eligible", () => {
    const attacker = ci("att", makeWizard(9400, ["d19"]))
    const defender = ci("def", makeWizard(9401, ["o19"]))
    const defensiveSpell = ci("spell-def", makeSpell(9402, "Def", "Spell. (Def/4)"))
    const s = withCombatCardPlayState({
      actingPlayer: "p1",
      attackingPlayer: "p1",
      attacker,
      defender,
      hand: [defensiveSpell],
    })

    const moves = getLegalMoves(s, "p1")
    expect(
      moves.some(m => m.type === "PLAY_COMBAT_CARD" &&
        (m as { cardInstanceId: string }).cardInstanceId === "spell-def"),
    ).toBe(true)
  })

  test("phase 5 includes spells that can be cast in phase 5", () => {
    const s0 = baseState()
    const champ = ci("wiz-pool", makeWizard(9500, ["d19"]))
    const phase5Spell = ci("def35", makeSpell(9501, "Def35", "Spell. (Def/3/5)"))
    const s: GameState = {
      ...s0,
      phase: Phase.PhaseFive,
      activePlayer: "p1",
      players: {
        ...s0.players,
        p1: {
          ...s0.players["p1"]!,
          hand: [phase5Spell],
          pool: [{ champion: champ, attachments: [] }],
        },
      },
    }

    const moves = getLegalMoves(s, "p1")
    expect(
      moves.some(m => m.type === "PLAY_PHASE5_CARD" &&
        (m as { cardInstanceId: string }).cardInstanceId === "def35"),
    ).toBe(true)
  })
})

describe("spell-gating applyMove validation", () => {
  test("rejects crafted phase 3 move for phase-4-only spell", () => {
    const champ = ci("wiz-pool", makeWizard(9600, ["o19"]))
    const off4 = ci("off4", makeSpell(9601, "Off4", "Spell. (Off/4)"))
    const s = withPoolState([off4], champ)

    expect(() =>
      applyMove(s, "p1", { type: "PLAY_PHASE3_CARD", cardInstanceId: "off4" }),
    ).toThrow(EngineError)
  })

  test("rejects crafted combat move for phase-3-only spell", () => {
    const attacker = ci("att", makeWizard(9700, ["o19"]))
    const defender = ci("def", makeWizard(9701, ["d19"]))
    const off3 = ci("off3", makeSpell(9702, "Off3", "Spell. (Off/3)"))
    const s = withCombatCardPlayState({
      actingPlayer: "p1",
      attackingPlayer: "p1",
      attacker,
      defender,
      hand: [off3],
    })

    expect(() =>
      applyMove(s, "p1", { type: "PLAY_COMBAT_CARD", cardInstanceId: "off3" }),
    ).toThrow(EngineError)
  })
})
