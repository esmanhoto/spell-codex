import { describe, test, expect, beforeEach } from "bun:test"
import { populateTriggers } from "../../src/triggers.ts"
import { initGame } from "../../src/init.ts"
import { _resetInstanceCounter } from "../../src/utils.ts"
import type { GameState, GameEvent } from "../../src/types.ts"
import { DEFAULT_CONFIG } from "../fixtures.ts"
import { inst, makeRealm, makeHolding } from "../scenario-builders.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

const TRIGGER_EFFECT = { type: "turn_trigger" as const, timing: "start" as const }

function realmWithTrigger(id: string) {
  return inst(
    id,
    makeRealm({
      cardNumber: parseInt(id, 36),
      name: `Trigger Realm ${id}`,
      effects: [TRIGGER_EFFECT],
    }),
  )
}

function holdingWithTrigger(id: string) {
  return inst(
    id,
    makeHolding({
      cardNumber: parseInt(id, 36),
      name: `Trigger Holding ${id}`,
      effects: [TRIGGER_EFFECT],
    }),
  )
}

describe("populateTriggers: razed realm skipping", () => {
  test("unrazed realm with trigger effect is queued", () => {
    const base = initGame(DEFAULT_CONFIG)
    const realm = realmWithTrigger("r1")
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

    const events: GameEvent[] = []
    const newState = populateTriggers(state, "start", events)

    expect(newState.pendingTriggers).toHaveLength(1)
    expect(newState.pendingTriggers[0]!.sourceCardInstanceId).toBe("r1")
    expect(events.some((e) => e.type === "TRIGGERS_QUEUED")).toBe(true)
  })

  test("razed realm with trigger effect is SKIPPED", () => {
    const base = initGame(DEFAULT_CONFIG)
    const realm = realmWithTrigger("r1")
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

    const events: GameEvent[] = []
    const newState = populateTriggers(state, "start", events)

    expect(newState.pendingTriggers).toHaveLength(0)
    expect(events).toHaveLength(0)
  })

  test("holding on razed realm is also skipped", () => {
    const base = initGame(DEFAULT_CONFIG)
    const realm = realmWithTrigger("r1")
    const holding = holdingWithTrigger("h1")
    const state: GameState = {
      ...base,
      players: {
        ...base.players,
        p1: {
          ...base.players["p1"]!,
          formation: { size: 6, slots: { A: { realm, isRazed: true, holdings: [holding] } } },
        },
      },
    }

    const events: GameEvent[] = []
    const newState = populateTriggers(state, "start", events)

    expect(newState.pendingTriggers).toHaveLength(0)
  })

  test("mixed: one razed + one unrazed — only unrazed triggers queued", () => {
    const base = initGame(DEFAULT_CONFIG)
    const razedRealm = realmWithTrigger("r-razed")
    const liveRealm = realmWithTrigger("r-live")
    const state: GameState = {
      ...base,
      players: {
        ...base.players,
        p1: {
          ...base.players["p1"]!,
          formation: {
            size: 6,
            slots: {
              A: { realm: razedRealm, isRazed: true, holdings: [] },
              B: { realm: liveRealm, isRazed: false, holdings: [] },
            },
          },
        },
      },
    }

    const events: GameEvent[] = []
    const newState = populateTriggers(state, "start", events)

    expect(newState.pendingTriggers).toHaveLength(1)
    expect(newState.pendingTriggers[0]!.sourceCardInstanceId).toBe("r-live")
  })

  test("wrong timing is skipped even on unrazed realm", () => {
    const base = initGame(DEFAULT_CONFIG)
    const realm = realmWithTrigger("r1") // has "start" timing
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

    const events: GameEvent[] = []
    const newState = populateTriggers(state, "end", events) // asking for "end"

    expect(newState.pendingTriggers).toHaveLength(0)
  })
})
