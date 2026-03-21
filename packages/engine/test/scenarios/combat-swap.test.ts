/**
 * Tests for SWAP_COMBAT_CHAMPION move.
 *
 * Covers: swap from pool/hand/discard, old champion destinations,
 * pool attachments transfer, manual level reset, championsUsedThisBattle updated.
 */
import { describe, test, expect } from "bun:test"
import { applyMove } from "../../src/engine.ts"
import { getLegalMoves } from "../../src/legal-moves.ts"
import {
  buildCombatCardPlayState,
  inst,
  makeChampion,
  makeRealm,
  makeMagicalItem,
} from "../scenario-builders.ts"
import type { GameState, Move } from "../../src/types.ts"

function hasMove(moves: Move[], type: string, fields: Record<string, unknown> = {}): boolean {
  return moves.some((m) => {
    if (m.type !== type) return false
    for (const [k, v] of Object.entries(fields)) {
      if ((m as Record<string, unknown>)[k] !== v) return false
    }
    return true
  })
}

describe("SWAP_COMBAT_CHAMPION", () => {
  const attacker = inst("att", makeChampion({ level: 8, name: "Attacker" }))
  const defender = inst("def", makeChampion({ level: 4, name: "Defender" }))
  const realm = inst("realm", makeRealm())
  const newChamp = inst("new-champ", makeChampion({ level: 6, name: "New Champion" }))

  test("swap attacker from pool → old to pool", () => {
    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    // Add new champion to attacker's pool
    const s: GameState = {
      ...state,
      players: {
        ...state.players,
        p1: {
          ...state.players.p1!,
          pool: [
            ...state.players.p1!.pool,
            { champion: newChamp, attachments: [] },
          ],
        },
      },
    }

    const result = applyMove(s, "p1", {
      type: "SWAP_COMBAT_CHAMPION",
      side: "attacker",
      newChampionId: "new-champ",
      newChampionSource: "pool",
      oldChampionDestination: "pool",
    })

    expect(result.newState.combatState!.attacker!.instanceId).toBe("new-champ")
    expect(result.newState.combatState!.attackerManualLevel).toBeNull()
    expect(result.newState.combatState!.championsUsedThisBattle).toContain("new-champ")
    expect(result.events.some((e) => e.type === "COMBAT_CHAMPION_SWAPPED")).toBe(true)
  })

  test("swap defender from hand → old to discard", () => {
    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    // Put new champion in defender's hand
    const s: GameState = {
      ...state,
      players: {
        ...state.players,
        p2: {
          ...state.players.p2!,
          hand: [newChamp],
        },
      },
    }

    const result = applyMove(s, "p2", {
      type: "SWAP_COMBAT_CHAMPION",
      side: "defender",
      newChampionId: "new-champ",
      newChampionSource: "hand",
      oldChampionDestination: "discard",
    })

    expect(result.newState.combatState!.defender!.instanceId).toBe("new-champ")
    // Old defender should be in discard
    expect(
      result.newState.players.p2!.discardPile.some((c) => c.instanceId === "def"),
    ).toBe(true)
  })

  test("swap from discard → old to abyss", () => {
    const discardChamp = inst("disc-champ", makeChampion({ level: 7, name: "Discard Champ" }))
    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const s: GameState = {
      ...state,
      players: {
        ...state.players,
        p1: {
          ...state.players.p1!,
          discardPile: [discardChamp],
        },
      },
    }

    const result = applyMove(s, "p1", {
      type: "SWAP_COMBAT_CHAMPION",
      side: "attacker",
      newChampionId: "disc-champ",
      newChampionSource: "discard",
      oldChampionDestination: "abyss",
    })

    expect(result.newState.combatState!.attacker!.instanceId).toBe("disc-champ")
    expect(result.newState.players.p1!.abyss.some((c) => c.instanceId === "att")).toBe(true)
    expect(
      result.newState.players.p1!.discardPile.some((c) => c.instanceId === "disc-champ"),
    ).toBe(false)
  })

  test("combat cards are split: items go with old champion, rest stays", () => {
    const item = inst("item1", makeMagicalItem({ name: "Magic Sword" }))
    const ally = inst("ally1", {
      setId: "test",
      cardNumber: 9001,
      name: "Test Ally",
      typeId: 1,
      worldId: 0,
      isAvatar: false,
      level: "+3",
      description: "",
      attributes: [],
      supportIds: [],
      effects: [],
    })

    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    // Add combat cards and new champion to pool
    const s: GameState = {
      ...state,
      combatState: {
        ...state.combatState!,
        attackerCards: [item, ally],
      },
      players: {
        ...state.players,
        p1: {
          ...state.players.p1!,
          pool: [
            ...state.players.p1!.pool,
            { champion: newChamp, attachments: [] },
          ],
        },
      },
    }

    const result = applyMove(s, "p1", {
      type: "SWAP_COMBAT_CHAMPION",
      side: "attacker",
      newChampionId: "new-champ",
      newChampionSource: "pool",
      oldChampionDestination: "pool",
    })

    // Ally stays in combat (as remaining cards)
    expect(
      result.newState.combatState!.attackerCards.some((c) => c.instanceId === "ally1"),
    ).toBe(true)
    // Item goes with old champion (not in combat cards)
    expect(
      result.newState.combatState!.attackerCards.some((c) => c.instanceId === "item1"),
    ).toBe(false)
  })

  test("manual level is reset after swap", () => {
    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const s: GameState = {
      ...state,
      combatState: {
        ...state.combatState!,
        attackerManualLevel: 15,
      },
      players: {
        ...state.players,
        p1: {
          ...state.players.p1!,
          pool: [
            ...state.players.p1!.pool,
            { champion: newChamp, attachments: [] },
          ],
        },
      },
    }

    const result = applyMove(s, "p1", {
      type: "SWAP_COMBAT_CHAMPION",
      side: "attacker",
      newChampionId: "new-champ",
      newChampionSource: "pool",
      oldChampionDestination: "pool",
    })

    expect(result.newState.combatState!.attackerManualLevel).toBeNull()
  })

  test("legal moves include SWAP_COMBAT_CHAMPION during CARD_PLAY", () => {
    const state = buildCombatCardPlayState({ attacker, defender, targetRealm: realm })
    const s: GameState = {
      ...state,
      players: {
        ...state.players,
        p1: {
          ...state.players.p1!,
          pool: [
            ...state.players.p1!.pool,
            { champion: newChamp, attachments: [] },
          ],
        },
      },
    }

    const moves = getLegalMoves(s, "p1")
    expect(hasMove(moves, "SWAP_COMBAT_CHAMPION", { newChampionId: "new-champ" })).toBe(true)
  })
})
