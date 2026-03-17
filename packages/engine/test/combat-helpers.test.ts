import { describe, test, expect } from "bun:test"
import { getCombatRealmContext, getCombatLevels } from "../src/combat.ts"
import { initGame } from "../src/init.ts"
import type { GameState, CombatState, CardInstance } from "../src/types.ts"
import {
  DEFAULT_CONFIG,
  REALM_FR,
  REALM_GENERIC,
  CHAMPION_CLERIC_FR,
  CHAMPION_HERO_GENERIC,
  ALLY_PLUS4,
} from "./fixtures.ts"

/** Build a minimal GameState with an active combat between two champions. */
function makeCombatState(opts?: {
  attackerWorld?: number
  defenderWorld?: number
  realmWorld?: number
  attackerCards?: CardInstance[]
  defenderCards?: CardInstance[]
  attackerManualLevel?: number | null
  defenderManualLevel?: number | null
}): GameState {
  const base = initGame(DEFAULT_CONFIG)
  const realmWorldId = opts?.realmWorld ?? 1
  const realmCard = realmWorldId === 1 ? REALM_FR : REALM_GENERIC
  const realmInstance: CardInstance = { instanceId: "realm-p2", card: realmCard }
  const attackerChamp: CardInstance = {
    instanceId: "champ-p1",
    card: {
      ...CHAMPION_CLERIC_FR,
      worldId: (opts?.attackerWorld ?? 1) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 9,
    },
  }
  const defenderChamp: CardInstance = {
    instanceId: "champ-p2",
    card: {
      ...CHAMPION_HERO_GENERIC,
      worldId: (opts?.defenderWorld ?? 0) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 9,
    },
  }

  const combat: CombatState = {
    attackingPlayer: "p1",
    defendingPlayer: "p2",
    targetRealmSlot: "A",
    roundPhase: "CARD_PLAY",
    attacker: attackerChamp,
    defender: defenderChamp,
    attackerCards: opts?.attackerCards ?? [],
    defenderCards: opts?.defenderCards ?? [],
    championsUsedThisBattle: [],
    attackerWins: 0,
    attackerManualLevel: opts?.attackerManualLevel ?? null,
    defenderManualLevel: opts?.defenderManualLevel ?? null,
  }

  return {
    ...base,
    combatState: combat,
    players: {
      ...base.players,
      p1: {
        ...base.players["p1"]!,
        pool: [{ champion: attackerChamp, attachments: [] }],
      },
      p2: {
        ...base.players["p2"]!,
        formation: {
          size: 6,
          slots: { A: { realm: realmInstance, isRazed: false, holdings: [] } },
        },
        pool: [{ champion: defenderChamp, attachments: [] }],
      },
    },
  }
}

describe("getCombatRealmContext", () => {
  test("returns correct realmWorldId and defenderIsRealm=false for champion defender", () => {
    const state = makeCombatState({ realmWorld: 1 })
    const { realmWorldId, defenderIsRealm } = getCombatRealmContext(state, state.combatState!)

    expect(realmWorldId).toBe(1)
    expect(defenderIsRealm).toBe(false)
  })

  test("defenderIsRealm=true when defender IS the realm", () => {
    const state = makeCombatState()
    // Make the defender the same instance as the realm
    const realm = state.players["p2"]!.formation.slots["A"]!.realm
    const modified: GameState = {
      ...state,
      combatState: { ...state.combatState!, defender: realm },
    }
    const { defenderIsRealm } = getCombatRealmContext(modified, modified.combatState!)
    expect(defenderIsRealm).toBe(true)
  })
})

describe("getCombatLevels", () => {
  test("returns numeric attacker and defender levels", () => {
    const state = makeCombatState()
    const { attackerLevel, defenderLevel } = getCombatLevels(state, state.combatState!)

    expect(typeof attackerLevel).toBe("number")
    expect(typeof defenderLevel).toBe("number")
    expect(attackerLevel).toBeGreaterThanOrEqual(0)
    expect(defenderLevel).toBeGreaterThanOrEqual(0)
  })

  test("attacker gets world bonus when worlds match", () => {
    // Attacker worldId=1 attacking realm worldId=1 → world bonus
    const withBonus = makeCombatState({ attackerWorld: 1, realmWorld: 1 })
    const { attackerLevel: withBonusLevel } = getCombatLevels(withBonus, withBonus.combatState!)

    // Attacker worldId=0 (generic) → no bonus
    const noBonus = makeCombatState({ attackerWorld: 0, realmWorld: 1 })
    const { attackerLevel: noBonusLevel } = getCombatLevels(noBonus, noBonus.combatState!)

    expect(withBonusLevel).toBe(noBonusLevel + 3)
  })

  test("respects manual level overrides", () => {
    const state = makeCombatState({ attackerManualLevel: 99 })
    const { attackerLevel } = getCombatLevels(state, state.combatState!)
    expect(attackerLevel).toBe(99)
  })

  test("includes combat card bonuses", () => {
    const ally: CardInstance = { instanceId: "ally-1", card: ALLY_PLUS4 }
    const withAlly = makeCombatState({ attackerCards: [ally] })
    const without = makeCombatState()

    const { attackerLevel: withAllyLevel } = getCombatLevels(withAlly, withAlly.combatState!)
    const { attackerLevel: baseLevel } = getCombatLevels(without, without.combatState!)

    expect(withAllyLevel).toBe(baseLevel + 4)
  })

  test("returns 0 for missing attacker/defender", () => {
    const state = makeCombatState()
    const combat: CombatState = { ...state.combatState!, attacker: null, defender: null }
    const modified = { ...state, combatState: combat }
    const { attackerLevel, defenderLevel } = getCombatLevels(modified, combat)

    expect(attackerLevel).toBe(0)
    expect(defenderLevel).toBe(0)
  })
})
