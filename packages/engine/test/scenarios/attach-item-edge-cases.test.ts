import { describe, test, expect, beforeEach } from "bun:test"
import { applyMove } from "../../src/engine.ts"
import { initGame } from "../../src/init.ts"
import { _resetInstanceCounter } from "../../src/utils.ts"
import { Phase } from "../../src/types.ts"
import type { GameState } from "../../src/types.ts"
import { DEFAULT_CONFIG, ARTIFACT_FR, MAGICAL_ITEM_PLUS2_PLUS1 } from "../fixtures.ts"
import { inst, makeChampion } from "../scenario-builders.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

function poolPhaseState(): GameState {
  const base = initGame(DEFAULT_CONFIG)
  const champion = inst("champ", makeChampion())
  return {
    ...base,
    phase: Phase.Pool,
    players: {
      ...base.players,
      p1: {
        ...base.players["p1"]!,
        pool: [{ champion, attachments: [] }],
        hand: [],
      },
    },
  }
}

// ─── ATTACH_ITEM: artifact duplicate limit ───────────────────────────────────

describe("ATTACH_ITEM: artifact restrictions", () => {
  test("first artifact attaches successfully", () => {
    const artifact = inst("art1", ARTIFACT_FR)
    const state: GameState = {
      ...poolPhaseState(),
      players: {
        ...poolPhaseState().players,
        p1: { ...poolPhaseState().players["p1"]!, hand: [artifact] },
      },
    }

    const { newState } = applyMove(state, "p1", {
      type: "ATTACH_ITEM",
      cardInstanceId: "art1",
      championId: "champ",
    })

    expect(newState.players["p1"]!.pool[0]!.attachments).toHaveLength(1)
    expect(newState.players["p1"]!.pool[0]!.attachments[0]!.instanceId).toBe("art1")
  })

  test("second artifact on same champion throws ARTIFACT_ALREADY_ATTACHED", () => {
    const base = initGame(DEFAULT_CONFIG)
    const champion = inst("champ", makeChampion())
    const existingArt = inst("art-existing", {
      ...ARTIFACT_FR,
      name: "Existing Artifact",
      cardNumber: 302,
    })
    const newArt = inst("art-new", { ...ARTIFACT_FR, name: "New Artifact", cardNumber: 303 })

    const state: GameState = {
      ...base,
      phase: Phase.Pool,
      players: {
        ...base.players,
        p1: {
          ...base.players["p1"]!,
          pool: [{ champion, attachments: [existingArt] }],
          hand: [newArt],
        },
      },
    }

    expect(() =>
      applyMove(state, "p1", {
        type: "ATTACH_ITEM",
        cardInstanceId: "art-new",
        championId: "champ",
      }),
    ).toThrow("Champion already has an artifact")
  })

  test("magical items have no duplicate limit", () => {
    const base = initGame(DEFAULT_CONFIG)
    const champion = inst("champ", makeChampion())
    const item1 = inst("item1", MAGICAL_ITEM_PLUS2_PLUS1)
    const item2 = inst("item2", {
      ...MAGICAL_ITEM_PLUS2_PLUS1,
      name: "Sword of Glory",
      cardNumber: 203,
    })

    const state: GameState = {
      ...base,
      phase: Phase.Pool,
      players: {
        ...base.players,
        p1: {
          ...base.players["p1"]!,
          pool: [{ champion, attachments: [item1] }],
          hand: [item2],
        },
      },
    }

    const { newState } = applyMove(state, "p1", {
      type: "ATTACH_ITEM",
      cardInstanceId: "item2",
      championId: "champ",
    })

    expect(newState.players["p1"]!.pool[0]!.attachments).toHaveLength(2)
  })

  test("artifact + magical item on same champion is allowed", () => {
    const base = initGame(DEFAULT_CONFIG)
    const champion = inst("champ", makeChampion())
    const artifact = inst("art", ARTIFACT_FR)
    const item = inst("item", MAGICAL_ITEM_PLUS2_PLUS1)

    const state: GameState = {
      ...base,
      phase: Phase.Pool,
      players: {
        ...base.players,
        p1: {
          ...base.players["p1"]!,
          pool: [{ champion, attachments: [artifact] }],
          hand: [item],
        },
      },
    }

    const { newState } = applyMove(state, "p1", {
      type: "ATTACH_ITEM",
      cardInstanceId: "item",
      championId: "champ",
    })

    expect(newState.players["p1"]!.pool[0]!.attachments).toHaveLength(2)
  })

  test("attaching to nonexistent champion throws", () => {
    const item = inst("item", MAGICAL_ITEM_PLUS2_PLUS1)
    const state: GameState = {
      ...poolPhaseState(),
      players: {
        ...poolPhaseState().players,
        p1: { ...poolPhaseState().players["p1"]!, hand: [item] },
      },
    }

    expect(() =>
      applyMove(state, "p1", {
        type: "ATTACH_ITEM",
        cardInstanceId: "item",
        championId: "nonexistent",
      }),
    ).toThrow("CHAMPION_NOT_IN_POOL")
  })
})
