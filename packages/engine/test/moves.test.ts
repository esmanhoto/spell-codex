import { describe, test, expect, beforeEach } from "bun:test"
import { initGame } from "../src/init.ts"
import { applyMove, EngineError } from "../src/engine.ts"
import { getLegalMoves } from "../src/legal-moves.ts"
import { Phase } from "../src/types.ts"
import type { GameState, CardInstance } from "../src/types.ts"
import { _resetInstanceCounter } from "../src/utils.ts"
import {
  DEFAULT_CONFIG,
  REALM_FR,
  REALM_GENERIC,
  CHAMPION_CLERIC_FR,
  CHAMPION_WIZARD_FR,
  ALLY_PLUS4,
  HOLDING_FR,
} from "./fixtures.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

// ─── Helper: advance to a specific phase ─────────────────────────────────────

function advanceTo(state: GameState, phase: Phase): GameState {
  let s = state
  const phases = [Phase.StartOfTurn, Phase.PlayRealm, Phase.Pool, Phase.Combat, Phase.PhaseFive]
  const target = phases.indexOf(phase)
  const current = phases.indexOf(s.phase as Phase)
  for (let i = current; i < target; i++) {
    s = applyMove(s, s.activePlayer, { type: "PASS" }).newState
  }
  return s
}

/** Finds the first card of the given typeId in the active player's hand */
function findInHand(state: GameState, typeId: number): CardInstance | undefined {
  return state.players[state.activePlayer]!.hand.find((c) => c.card.typeId === typeId)
}

// ─── Phase transitions ────────────────────────────────────────────────────────

describe("phase transitions via PASS", () => {
  test("START_OF_TURN → draws cards → PLAY_REALM", () => {
    const init = initGame(DEFAULT_CONFIG)
    const hand0 = init.players["p1"]!.hand.length
    const { newState } = applyMove(init, "p1", { type: "PASS" })
    expect(newState.phase).toBe(Phase.PlayRealm)
    expect(newState.players["p1"]!.hand.length).toBe(hand0 + 3) // 55-card draws 3
  })

  test("PLAY_REALM → POOL", () => {
    const s = advanceTo(initGame(DEFAULT_CONFIG), Phase.PlayRealm)
    const { newState } = applyMove(s, "p1", { type: "PASS" })
    expect(newState.phase).toBe(Phase.Pool)
  })

  test("POOL → COMBAT", () => {
    const s = advanceTo(initGame(DEFAULT_CONFIG), Phase.Pool)
    const { newState } = applyMove(s, "p1", { type: "PASS" })
    expect(newState.phase).toBe(Phase.Combat)
  })

  test("COMBAT → PHASE_FIVE", () => {
    const s = advanceTo(initGame(DEFAULT_CONFIG), Phase.Combat)
    const { newState } = applyMove(s, "p1", { type: "PASS" })
    expect(newState.phase).toBe(Phase.PhaseFive)
  })

  test("PHASE_FIVE → switches to next player's START_OF_TURN", () => {
    const s = advanceTo(initGame(DEFAULT_CONFIG), Phase.PhaseFive)
    const { newState } = applyMove(s, "p1", { type: "PASS" })
    expect(newState.activePlayer).toBe("p2")
    expect(newState.phase).toBe(Phase.StartOfTurn)
  })

  test("turn counter increments when turn passes to next player", () => {
    const s = advanceTo(initGame(DEFAULT_CONFIG), Phase.PhaseFive)
    const { newState } = applyMove(s, "p1", { type: "PASS" })
    expect(newState.currentTurn).toBe(2)
  })

  test("hasAttackedThisTurn resets at start of new turn", () => {
    let s = advanceTo(initGame(DEFAULT_CONFIG), Phase.PhaseFive)
    s = { ...s, hasAttackedThisTurn: true }
    const { newState } = applyMove(s, "p1", { type: "PASS" })
    expect(newState.hasAttackedThisTurn).toBe(false)
  })

  test("non-active player cannot PASS", () => {
    const s = initGame(DEFAULT_CONFIG)
    expect(() => applyMove(s, "p2", { type: "PASS" })).toThrow(EngineError)
  })

  test("PASS from PHASE_FIVE fails if hand is over limit", () => {
    let s = advanceTo(initGame(DEFAULT_CONFIG), Phase.PhaseFive)
    // Stuff hand to over limit (max 8 for 55-card)
    const player = s.players["p1"]!
    const extra: CardInstance[] = Array.from({ length: 5 }, (_, i) => ({
      instanceId: `extra-${i}`,
      card: ALLY_PLUS4,
    }))
    s = { ...s, players: { ...s.players, p1: { ...player, hand: [...player.hand, ...extra] } } }
    expect(() => applyMove(s, "p1", { type: "PASS" })).toThrow(EngineError)
  })
})

// ─── PLAY_REALM ───────────────────────────────────────────────────────────────

describe("PLAY_REALM", () => {
  test("plays a realm into slot A", () => {
    let s = advanceTo(initGame(DEFAULT_CONFIG), Phase.PlayRealm)
    const realm = findInHand(s, 13) // Realm typeId=13
    if (!realm) return // skip if none in hand after shuffle

    const { newState } = applyMove(s, "p1", {
      type: "PLAY_REALM",
      cardInstanceId: realm.instanceId,
      slot: "A",
    })

    expect(newState.players["p1"]!.formation.slots["A"]).toBeDefined()
    expect(newState.players["p1"]!.formation.slots["A"]!.realm.instanceId).toBe(realm.instanceId)
    expect(newState.players["p1"]!.formation.slots["A"]!.isRazed).toBe(false)
    expect(
      newState.players["p1"]!.hand.find((c) => c.instanceId === realm.instanceId),
    ).toBeUndefined()
  })

  test("cannot play realm into slot B before A is filled", () => {
    let s = advanceTo(initGame(DEFAULT_CONFIG), Phase.PlayRealm)
    const realm = findInHand(s, 13)
    if (!realm) return

    expect(() =>
      applyMove(s, "p1", { type: "PLAY_REALM", cardInstanceId: realm.instanceId, slot: "B" }),
    ).toThrow(EngineError)
  })

  test("cannot play realm in wrong phase", () => {
    const s = initGame(DEFAULT_CONFIG) // START_OF_TURN
    const realm = findInHand(s, 13)
    if (!realm) return

    expect(() =>
      applyMove(s, "p1", { type: "PLAY_REALM", cardInstanceId: realm.instanceId, slot: "A" }),
    ).toThrow(EngineError)
  })

  test("emits REALM_PLAYED event", () => {
    let s = advanceTo(initGame(DEFAULT_CONFIG), Phase.PlayRealm)
    const realm = findInHand(s, 13)
    if (!realm) return

    const { events } = applyMove(s, "p1", {
      type: "PLAY_REALM",
      cardInstanceId: realm.instanceId,
      slot: "A",
    })

    expect(events.some((e) => e.type === "REALM_PLAYED")).toBe(true)
  })
})

// ─── PLACE_CHAMPION ───────────────────────────────────────────────────────────

describe("PLACE_CHAMPION", () => {
  test("moves champion from hand to pool", () => {
    let s = advanceTo(initGame(DEFAULT_CONFIG), Phase.Pool)
    const champ = s.players["p1"]!.hand.find((c) =>
      [5, 7, 10, 12, 14, 16, 20].includes(c.card.typeId),
    )
    if (!champ) return

    const { newState } = applyMove(s, "p1", {
      type: "PLACE_CHAMPION",
      cardInstanceId: champ.instanceId,
    })

    const inPool = newState.players["p1"]!.pool.find(
      (e) => e.champion.instanceId === champ.instanceId,
    )
    expect(inPool).toBeDefined()
    expect(inPool!.attachments).toHaveLength(0)
    expect(
      newState.players["p1"]!.hand.find((c) => c.instanceId === champ.instanceId),
    ).toBeUndefined()
  })

  test("pool entry starts with empty attachments", () => {
    let s = advanceTo(initGame(DEFAULT_CONFIG), Phase.Pool)
    const champ = s.players["p1"]!.hand.find((c) =>
      [5, 7, 10, 12, 14, 16, 20].includes(c.card.typeId),
    )
    if (!champ) return

    const { newState } = applyMove(s, "p1", {
      type: "PLACE_CHAMPION",
      cardInstanceId: champ.instanceId,
    })
    const entry = newState.players["p1"]!.pool.find(
      (e) => e.champion.instanceId === champ.instanceId,
    )!
    expect(entry.attachments).toHaveLength(0)
  })

  test("emits CHAMPION_PLACED event", () => {
    let s = advanceTo(initGame(DEFAULT_CONFIG), Phase.Pool)
    const champ = s.players["p1"]!.hand.find((c) =>
      [5, 7, 10, 12, 14, 16, 20].includes(c.card.typeId),
    )
    if (!champ) return

    const { events } = applyMove(s, "p1", {
      type: "PLACE_CHAMPION",
      cardInstanceId: champ.instanceId,
    })
    expect(events.some((e) => e.type === "CHAMPION_PLACED")).toBe(true)
  })
})

// ─── DISCARD_CARD ─────────────────────────────────────────────────────────────

describe("DISCARD_CARD in Phase 5", () => {
  test("non-event card goes to discard pile", () => {
    let s = advanceTo(initGame(DEFAULT_CONFIG), Phase.PhaseFive)
    const card = s.players["p1"]!.hand.find((c) => c.card.typeId !== 6) // not Event
    if (!card) return

    const { newState } = applyMove(s, "p1", {
      type: "DISCARD_CARD",
      cardInstanceId: card.instanceId,
    })
    expect(
      newState.players["p1"]!.discardPile.find((c) => c.instanceId === card.instanceId),
    ).toBeDefined()
    expect(
      newState.players["p1"]!.abyss.find((c) => c.instanceId === card.instanceId),
    ).toBeUndefined()
  })

  test("event card goes to abyss", () => {
    let s = advanceTo(initGame(DEFAULT_CONFIG), Phase.PhaseFive)

    // Force an event card into hand
    const player = s.players["p1"]!
    const eventInstance: CardInstance = {
      instanceId: "event-test-1",
      card: { ...ALLY_PLUS4, typeId: 6, name: "Test Event" },
    }
    s = {
      ...s,
      players: { ...s.players, p1: { ...player, hand: [eventInstance, ...player.hand] } },
    }

    const { newState } = applyMove(s, "p1", {
      type: "DISCARD_CARD",
      cardInstanceId: "event-test-1",
    })
    expect(newState.players["p1"]!.abyss.find((c) => c.instanceId === "event-test-1")).toBeDefined()
    expect(
      newState.players["p1"]!.discardPile.find((c) => c.instanceId === "event-test-1"),
    ).toBeUndefined()
  })
})

// ─── Holding reveal toggle ───────────────────────────────────────────────────

describe("TOGGLE_HOLDING_REVEAL", () => {
  test("owner can toggle reveal state for a realm holding", () => {
    let s = advanceTo(initGame(DEFAULT_CONFIG), Phase.PlayRealm)
    const realm: CardInstance = { instanceId: "realm-a", card: REALM_FR }
    const holding: CardInstance = { instanceId: "holding-a", card: HOLDING_FR }

    s = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...s.players["p1"]!,
          formation: {
            size: 6,
            slots: {
              A: { realm, isRazed: false, holdings: [holding], holdingRevealedToAll: false },
            },
          },
        },
      },
    }

    const { newState, events } = applyMove(s, "p1", {
      type: "TOGGLE_HOLDING_REVEAL",
      realmSlot: "A",
    })
    expect(newState.players["p1"]!.formation.slots["A"]!.holdingRevealedToAll).toBe(true)
    expect(events.some((e) => e.type === "HOLDING_REVEAL_TOGGLED")).toBe(true)
  })

  test("legal moves include TOGGLE_HOLDING_REVEAL when holding is attached", () => {
    let s = advanceTo(initGame(DEFAULT_CONFIG), Phase.PlayRealm)
    const realm: CardInstance = { instanceId: "realm-a", card: REALM_FR }
    const holding: CardInstance = { instanceId: "holding-a", card: HOLDING_FR }

    s = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...s.players["p1"]!,
          formation: {
            size: 6,
            slots: {
              A: { realm, isRazed: false, holdings: [holding], holdingRevealedToAll: false },
            },
          },
        },
      },
    }

    const moves = getLegalMoves(s, "p1")
    expect(
      moves.some(
        (m) => m.type === "TOGGLE_HOLDING_REVEAL" && (m as { realmSlot: string }).realmSlot === "A",
      ),
    ).toBe(true)
  })
})

// ─── getLegalMoves ────────────────────────────────────────────────────────────

describe("getLegalMoves", () => {
  test("non-active player gets no legal moves (out of combat)", () => {
    const state = initGame(DEFAULT_CONFIG)
    const moves = getLegalMoves(state, "p2")
    expect(moves).toHaveLength(0)
  })

  test("START_OF_TURN always includes PASS", () => {
    const state = initGame(DEFAULT_CONFIG)
    const moves = getLegalMoves(state, "p1")
    expect(moves.some((m) => m.type === "PASS")).toBe(true)
  })

  test("PHASE_FIVE shows only DISCARD_CARD when hand is over limit", () => {
    let s = advanceTo(initGame(DEFAULT_CONFIG), Phase.PhaseFive)
    const player = s.players["p1"]!
    const extra: CardInstance[] = Array.from({ length: 5 }, (_, i) => ({
      instanceId: `over-limit-${i}`,
      card: ALLY_PLUS4,
    }))
    s = { ...s, players: { ...s.players, p1: { ...player, hand: [...player.hand, ...extra] } } }

    const moves = getLegalMoves(s, "p1")
    expect(moves.every((m) => m.type === "DISCARD_CARD")).toBe(true)
    expect(moves.some((m) => m.type === "PASS")).toBe(false)
  })

  test("PHASE_FIVE includes END_TURN when hand is at limit", () => {
    const s = advanceTo(initGame(DEFAULT_CONFIG), Phase.PhaseFive)
    const moves = getLegalMoves(s, "p1")
    // After drawing, hand is at 5 (starting) + 3 (drawn) = 8, which equals maxEnd for 55-card
    expect(moves.some((m) => m.type === "END_TURN")).toBe(true)
  })

  test("finished game returns no legal moves", () => {
    const s = { ...initGame(DEFAULT_CONFIG), winner: "p1" }
    expect(getLegalMoves(s, "p1")).toHaveLength(0)
    expect(getLegalMoves(s, "p2")).toHaveLength(0)
  })
})

describe("PLAY_RULE_CARD", () => {
  test("discards the rule card and emits CARDS_DISCARDED only", () => {
    let s = initGame(DEFAULT_CONFIG)
    const ruleCard: CardInstance = {
      instanceId: "rule-test-1",
      card: {
        ...ALLY_PLUS4,
        cardNumber: 9991,
        name: "Test Rule",
        typeId: 15,
      },
    }
    s = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...s.players["p1"]!,
          hand: [ruleCard, ...s.players["p1"]!.hand],
        },
      },
    }

    const { newState, events } = applyMove(s, "p1", {
      type: "PLAY_RULE_CARD",
      cardInstanceId: "rule-test-1",
    })

    expect(newState.players["p1"]!.hand.some((c) => c.instanceId === "rule-test-1")).toBe(false)
    expect(newState.players["p1"]!.discardPile.some((c) => c.instanceId === "rule-test-1")).toBe(
      true,
    )
    expect(events).toEqual([
      { type: "CARDS_DISCARDED", playerId: "p1", instanceIds: ["rule-test-1"] },
    ])
  })
})

// ─── Combat flow ──────────────────────────────────────────────────────────────

describe("combat: DECLARE_ATTACK → DECLINE_DEFENSE → realm razed", () => {
  test("attacker wins undefended realm — realm is razed", () => {
    let s = initGame(DEFAULT_CONFIG)

    // Set up: p1 has pool champion, p2 has a realm
    const champInstance: CardInstance = { instanceId: "champ-p1", card: CHAMPION_CLERIC_FR }
    const realmInstance: CardInstance = { instanceId: "realm-p2", card: REALM_FR }

    s = {
      ...s,
      phase: Phase.Combat,
      players: {
        ...s.players,
        p1: { ...s.players["p1"]!, pool: [{ champion: champInstance, attachments: [] }] },
        p2: {
          ...s.players["p2"]!,
          formation: {
            size: 6,
            slots: { A: { realm: realmInstance, isRazed: false, holdings: [] } },
          },
        },
      },
    }

    const { newState: afterAttack } = applyMove(s, "p1", {
      type: "DECLARE_ATTACK",
      championId: "champ-p1",
      targetRealmSlot: "A",
      targetPlayerId: "p2",
    })

    expect(afterAttack.combatState).not.toBeNull()
    expect(afterAttack.combatState!.roundPhase).toBe("AWAITING_DEFENDER")
    expect(afterAttack.activePlayer).toBe("p2")

    const { newState: afterDecline } = applyMove(afterAttack, "p2", { type: "DECLINE_DEFENSE" })

    expect(afterDecline.combatState).toBeNull()
    expect(afterDecline.players["p2"]!.formation.slots["A"]!.isRazed).toBe(true)
  })

  test("attacker earns spoils card when realm is razed", () => {
    let s = initGame(DEFAULT_CONFIG)
    const champInstance: CardInstance = { instanceId: "champ-p1", card: CHAMPION_CLERIC_FR }
    const realmInstance: CardInstance = { instanceId: "realm-p2", card: REALM_FR }

    s = {
      ...s,
      phase: Phase.Combat,
      players: {
        ...s.players,
        p1: { ...s.players["p1"]!, pool: [{ champion: champInstance, attachments: [] }] },
        p2: {
          ...s.players["p2"]!,
          formation: {
            size: 6,
            slots: { A: { realm: realmInstance, isRazed: false, holdings: [] } },
          },
        },
      },
    }

    const handSizeBefore = s.players["p1"]!.hand.length
    const { newState: afterAttack } = applyMove(s, "p1", {
      type: "DECLARE_ATTACK",
      championId: "champ-p1",
      targetRealmSlot: "A",
      targetPlayerId: "p2",
    })
    const { newState: afterDecline } = applyMove(afterAttack, "p2", { type: "DECLINE_DEFENSE" })

    expect(afterDecline.players["p1"]!.hand.length).toBe(handSizeBefore + 1)
  })

  test("emits DEFENSE_DECLINED and REALM_RAZED events", () => {
    let s = initGame(DEFAULT_CONFIG)
    const champInstance: CardInstance = { instanceId: "champ-p1", card: CHAMPION_CLERIC_FR }
    const realmInstance: CardInstance = { instanceId: "realm-p2", card: REALM_FR }

    s = {
      ...s,
      phase: Phase.Combat,
      players: {
        ...s.players,
        p1: { ...s.players["p1"]!, pool: [{ champion: champInstance, attachments: [] }] },
        p2: {
          ...s.players["p2"]!,
          formation: {
            size: 6,
            slots: { A: { realm: realmInstance, isRazed: false, holdings: [] } },
          },
        },
      },
    }

    const { newState: afterAttack } = applyMove(s, "p1", {
      type: "DECLARE_ATTACK",
      championId: "champ-p1",
      targetRealmSlot: "A",
      targetPlayerId: "p2",
    })
    const { events } = applyMove(afterAttack, "p2", { type: "DECLINE_DEFENSE" })

    expect(events.some((e) => e.type === "DEFENSE_DECLINED")).toBe(true)
    expect(events.some((e) => e.type === "REALM_RAZED")).toBe(true)
    expect(events.some((e) => e.type === "SPOILS_EARNED")).toBe(true)
  })
})

describe("combat: attack defended → CARD_PLAY → STOP_PLAYING → resolve", () => {
  test("attacker wins when higher level — defender discarded", () => {
    let s = initGame(DEFAULT_CONFIG)

    const attacker: CardInstance = { instanceId: "att", card: CHAMPION_WIZARD_FR } // level 8
    const defender: CardInstance = { instanceId: "def", card: CHAMPION_CLERIC_FR } // level 6
    const realmInstance: CardInstance = { instanceId: "realm-p2", card: REALM_GENERIC }

    s = {
      ...s,
      phase: Phase.Combat,
      players: {
        ...s.players,
        p1: { ...s.players["p1"]!, pool: [{ champion: attacker, attachments: [] }] },
        p2: {
          ...s.players["p2"]!,
          pool: [{ champion: defender, attachments: [] }],
          formation: {
            size: 6,
            slots: { A: { realm: realmInstance, isRazed: false, holdings: [] } },
          },
        },
      },
    }

    const { newState: s1 } = applyMove(s, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetRealmSlot: "A",
      targetPlayerId: "p2",
    })
    expect(s1.activePlayer).toBe("p2")

    const { newState: s2 } = applyMove(s1, "p2", { type: "DECLARE_DEFENSE", championId: "def" })
    expect(s2.combatState!.roundPhase).toBe("CARD_PLAY")

    // Defender (level 6) is losing vs attacker (level 8) → p2 is active
    expect(s2.activePlayer).toBe("p2")

    const { newState: s3, events } = applyMove(s2, "p2", { type: "STOP_PLAYING" })

    // Attacker wins (8 > 6)
    expect(events.find((e) => e.type === "COMBAT_RESOLVED")).toMatchObject({
      type: "COMBAT_RESOLVED",
      outcome: "ATTACKER_WINS",
    })

    // Defender discarded
    expect(s3.players["p2"]!.pool.find((e) => e.champion.instanceId === "def")).toBeUndefined()
    expect(s3.players["p2"]!.discardPile.find((c) => c.instanceId === "def")).toBeDefined()

    // Attacker champion still in pool
    expect(s3.players["p1"]!.pool.find((e) => e.champion.instanceId === "att")).toBeDefined()

    // Transitions to AWAITING_ATTACKER for next round
    expect(s3.combatState!.roundPhase).toBe("AWAITING_ATTACKER")
    expect(s3.activePlayer).toBe("p1")
  })

  test("defender wins on tie — attacker discarded, defender earns spoils", () => {
    let s = initGame(DEFAULT_CONFIG)

    const attacker: CardInstance = { instanceId: "att", card: CHAMPION_CLERIC_FR } // level 6
    const defender: CardInstance = { instanceId: "def", card: CHAMPION_CLERIC_FR } // level 6
    const realmInstance: CardInstance = { instanceId: "realm-p2", card: REALM_GENERIC }

    s = {
      ...s,
      phase: Phase.Combat,
      players: {
        ...s.players,
        p1: { ...s.players["p1"]!, pool: [{ champion: attacker, attachments: [] }] },
        p2: {
          ...s.players["p2"]!,
          pool: [{ champion: defender, attachments: [] }],
          formation: {
            size: 6,
            slots: { A: { realm: realmInstance, isRazed: false, holdings: [] } },
          },
        },
      },
    }

    const { newState: s1 } = applyMove(s, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetRealmSlot: "A",
      targetPlayerId: "p2",
    })
    const { newState: s2 } = applyMove(s1, "p2", { type: "DECLARE_DEFENSE", championId: "def" })

    // Both at level 6 — p1 (attacker) is losing on tie
    expect(s2.activePlayer).toBe("p1")
    const { newState: s3, events } = applyMove(s2, "p1", { type: "STOP_PLAYING" })

    expect(events.find((e) => e.type === "COMBAT_RESOLVED")).toMatchObject({
      outcome: "DEFENDER_WINS",
    })
    expect(s3.players["p1"]!.discardPile.find((c) => c.instanceId === "att")).toBeDefined()
    expect(s3.players["p2"]!.pool.find((e) => e.champion.instanceId === "def")).toBeDefined()
    expect(events.some((e) => e.type === "SPOILS_EARNED")).toBe(true)
    expect(s3.combatState).toBeNull()
    expect(s3.activePlayer).toBe("p1") // return control to attacker
  })
})
