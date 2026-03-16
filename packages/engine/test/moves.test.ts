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
  EVENT_CARD,
  CHAMPION_HERO_GENERIC,
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

  test("END_TURN is legal at START_OF_TURN when hand is within limit", () => {
    const s = initGame(DEFAULT_CONFIG)
    expect(s.phase).toBe(Phase.StartOfTurn)
    const moves = getLegalMoves(s, "p1")
    expect(moves.some((m) => m.type === "END_TURN")).toBe(true)
  })

  test("END_TURN from START_OF_TURN skips drawing and passes to next player", () => {
    const s = initGame(DEFAULT_CONFIG)
    const hand0 = s.players["p1"]!.hand.length
    const { newState } = applyMove(s, "p1", { type: "END_TURN" })
    // No cards drawn
    expect(newState.players["p1"]!.hand.length).toBe(hand0)
    // Turn passed to next player
    expect(newState.activePlayer).toBe("p2")
    expect(newState.phase).toBe(Phase.StartOfTurn)
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

    // Spoil is now pending (not auto-drawn) — hand unchanged, pendingSpoil set
    expect(afterDecline.players["p1"]!.hand.length).toBe(handSizeBefore)
    expect(afterDecline.pendingSpoil).toBe("p1")
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
    expect(events.some((e) => e.type === "SPOILS_EARNED")).toBe(false) // only attackers earn spoils
    expect(s3.combatState).toBeNull()
    expect(s3.activePlayer).toBe("p1") // return control to attacker
  })
})

// ─── Events during combat ─────────────────────────────────────────────────────

describe("events during combat", () => {
  /** Build a state in Phase.Combat with events in both players' hands. */
  function buildCombatReadyState() {
    let s = initGame(DEFAULT_CONFIG)
    const attacker: CardInstance = { instanceId: "att", card: CHAMPION_WIZARD_FR } // level 8
    const defender: CardInstance = { instanceId: "def", card: CHAMPION_CLERIC_FR } // level 6
    const realmP2: CardInstance = { instanceId: "realm-p2", card: REALM_GENERIC }
    const eventAtt: CardInstance = { instanceId: "ev-att", card: EVENT_CARD }
    const eventDef: CardInstance = { instanceId: "ev-def", card: EVENT_CARD }
    return {
      ...s,
      phase: Phase.Combat,
      players: {
        ...s.players,
        p1: {
          ...s.players["p1"]!,
          pool: [{ champion: attacker, attachments: [] }],
          hand: [eventAtt],
        },
        p2: {
          ...s.players["p2"]!,
          pool: [{ champion: defender, attachments: [] }],
          formation: {
            size: 6 as const,
            slots: { A: { realm: realmP2, isRazed: false, holdings: [] } },
          },
          hand: [eventDef],
        },
      },
    }
  }

  // ─── AWAITING_DEFENDER phase ──────────────────────────────────────────────

  test("attacker gets PLAY_EVENT during AWAITING_DEFENDER", () => {
    const s = buildCombatReadyState()
    const { newState: afterAttack } = applyMove(s, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetRealmSlot: "A",
      targetPlayerId: "p2",
    })
    expect(afterAttack.combatState!.roundPhase).toBe("AWAITING_DEFENDER")
    const p1Moves = getLegalMoves(afterAttack, "p1")
    expect(p1Moves.some((m) => m.type === "PLAY_EVENT")).toBe(true)
  })

  test("attacker can successfully applyMove PLAY_EVENT during AWAITING_DEFENDER", () => {
    const s = buildCombatReadyState()
    const { newState: afterAttack } = applyMove(s, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetRealmSlot: "A",
      targetPlayerId: "p2",
    })
    const { newState } = applyMove(afterAttack, "p1", {
      type: "PLAY_EVENT",
      cardInstanceId: "ev-att",
    })
    expect(newState.resolutionContext).not.toBeNull()
    expect(newState.resolutionContext!.initiatingPlayer).toBe("p1")
  })

  // ─── AWAITING_ATTACKER phase ──────────────────────────────────────────────

  test("defender gets PLAY_EVENT during AWAITING_ATTACKER", () => {
    const s = buildCombatReadyState()
    const { newState: s1 } = applyMove(s, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetRealmSlot: "A",
      targetPlayerId: "p2",
    })
    const { newState: s2 } = applyMove(s1, "p2", { type: "DECLARE_DEFENSE", championId: "def" })
    // Attacker wins (8 > 6) → AWAITING_ATTACKER for next round
    const { newState: s3 } = applyMove(s2, "p2", { type: "STOP_PLAYING" })
    expect(s3.combatState!.roundPhase).toBe("AWAITING_ATTACKER")

    const p2Moves = getLegalMoves(s3, "p2")
    expect(p2Moves.some((m) => m.type === "PLAY_EVENT")).toBe(true)
  })

  test("defender can successfully applyMove PLAY_EVENT during AWAITING_ATTACKER", () => {
    const s = buildCombatReadyState()
    const { newState: s1 } = applyMove(s, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetRealmSlot: "A",
      targetPlayerId: "p2",
    })
    const { newState: s2 } = applyMove(s1, "p2", { type: "DECLARE_DEFENSE", championId: "def" })
    const { newState: s3 } = applyMove(s2, "p2", { type: "STOP_PLAYING" })

    const { newState } = applyMove(s3, "p2", { type: "PLAY_EVENT", cardInstanceId: "ev-def" })
    expect(newState.resolutionContext).not.toBeNull()
    expect(newState.resolutionContext!.initiatingPlayer).toBe("p2")
  })

  // ─── CARD_PLAY phase ──────────────────────────────────────────────────────

  test("losing player gets PLAY_EVENT alongside combat cards during CARD_PLAY", () => {
    const s = buildCombatReadyState()
    const { newState: s1 } = applyMove(s, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetRealmSlot: "A",
      targetPlayerId: "p2",
    })
    const { newState: s2 } = applyMove(s1, "p2", { type: "DECLARE_DEFENSE", championId: "def" })
    // p2 is losing (6 < 8) → p2 is active
    expect(s2.combatState!.roundPhase).toBe("CARD_PLAY")
    expect(s2.activePlayer).toBe("p2")

    const p2Moves = getLegalMoves(s2, "p2")
    expect(p2Moves.some((m) => m.type === "PLAY_EVENT")).toBe(true)
    expect(p2Moves.some((m) => m.type === "STOP_PLAYING")).toBe(true)
  })

  test("winning player gets PLAY_EVENT during CARD_PLAY", () => {
    const s = buildCombatReadyState()
    const { newState: s1 } = applyMove(s, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetRealmSlot: "A",
      targetPlayerId: "p2",
    })
    const { newState: s2 } = applyMove(s1, "p2", { type: "DECLARE_DEFENSE", championId: "def" })
    // p1 is winning (8 > 6)
    const p1Moves = getLegalMoves(s2, "p1")
    expect(p1Moves.some((m) => m.type === "PLAY_EVENT")).toBe(true)
  })

  test("losing player can successfully applyMove PLAY_EVENT during CARD_PLAY", () => {
    const s = buildCombatReadyState()
    const { newState: s1 } = applyMove(s, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetRealmSlot: "A",
      targetPlayerId: "p2",
    })
    const { newState: s2 } = applyMove(s1, "p2", { type: "DECLARE_DEFENSE", championId: "def" })
    // p2 is losing — play event
    const { newState } = applyMove(s2, "p2", { type: "PLAY_EVENT", cardInstanceId: "ev-def" })
    expect(newState.resolutionContext).not.toBeNull()
    expect(newState.resolutionContext!.initiatingPlayer).toBe("p2")
  })
})

// ─── INTERRUPT_COMBAT ─────────────────────────────────────────────────────────

describe("INTERRUPT_COMBAT", () => {
  /** Combat-ready state: p1 attacker (lvl 8), p2 defender (lvl 6), allies in both hands. */
  function buildState() {
    let s = initGame(DEFAULT_CONFIG)
    const attacker: CardInstance = { instanceId: "att", card: CHAMPION_WIZARD_FR } // lvl 8
    const defender: CardInstance = { instanceId: "def", card: CHAMPION_CLERIC_FR } // lvl 6
    const allyAtt: CardInstance = { instanceId: "ally-att", card: ALLY_PLUS4 }
    const allyDef: CardInstance = { instanceId: "ally-def", card: ALLY_PLUS4 }
    const realmP2: CardInstance = { instanceId: "realm-p2", card: REALM_GENERIC }
    s = {
      ...s,
      phase: Phase.Combat,
      players: {
        ...s.players,
        p1: {
          ...s.players["p1"]!,
          pool: [{ champion: attacker, attachments: [] }],
          hand: [allyAtt],
        },
        p2: {
          ...s.players["p2"]!,
          pool: [{ champion: defender, attachments: [] }],
          hand: [allyDef],
          formation: {
            size: 6,
            slots: { A: { realm: realmP2, isRazed: false, holdings: [] } },
          },
        },
      },
    }
    return s
  }

  function afterAttackDeclared(s: GameState) {
    const { newState } = applyMove(s, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetRealmSlot: "A",
      targetPlayerId: "p2",
    })
    return newState // roundPhase: AWAITING_DEFENDER
  }

  function afterDefenseDeclared(s: GameState) {
    const s1 = afterAttackDeclared(s)
    const { newState } = applyMove(s1, "p2", { type: "DECLARE_DEFENSE", championId: "def" })
    return newState // roundPhase: CARD_PLAY (p2 losing)
  }

  function afterRoundWon(s: GameState) {
    const s2 = afterDefenseDeclared(s)
    const { newState } = applyMove(s2, "p2", { type: "STOP_PLAYING" })
    return newState // roundPhase: AWAITING_ATTACKER (p1 won)
  }

  // ─── Legal moves availability ──────────────────────────────────────────────

  test("both players get INTERRUPT_COMBAT during AWAITING_DEFENDER", () => {
    const s = afterAttackDeclared(buildState())
    expect(s.combatState!.roundPhase).toBe("AWAITING_DEFENDER")
    expect(getLegalMoves(s, "p1").some((m) => m.type === "INTERRUPT_COMBAT")).toBe(true)
    expect(getLegalMoves(s, "p2").some((m) => m.type === "INTERRUPT_COMBAT")).toBe(true)
  })

  test("both players get INTERRUPT_COMBAT during AWAITING_ATTACKER", () => {
    const s = afterRoundWon(buildState())
    expect(s.combatState!.roundPhase).toBe("AWAITING_ATTACKER")
    expect(getLegalMoves(s, "p1").some((m) => m.type === "INTERRUPT_COMBAT")).toBe(true)
    expect(getLegalMoves(s, "p2").some((m) => m.type === "INTERRUPT_COMBAT")).toBe(true)
  })

  test("both players get INTERRUPT_COMBAT during CARD_PLAY", () => {
    const s = afterDefenseDeclared(buildState())
    expect(s.combatState!.roundPhase).toBe("CARD_PLAY")
    expect(getLegalMoves(s, "p1").some((m) => m.type === "INTERRUPT_COMBAT")).toBe(true)
    expect(getLegalMoves(s, "p2").some((m) => m.type === "INTERRUPT_COMBAT")).toBe(true)
  })

  // ─── Outcome ───────────────────────────────────────────────────────────────

  test("clears combatState and returns control to attacker", () => {
    const s = afterDefenseDeclared(buildState())
    const { newState, events } = applyMove(s, "p1", { type: "INTERRUPT_COMBAT" })
    expect(newState.combatState).toBeNull()
    expect(newState.activePlayer).toBe("p1")
    expect(events.some((e) => e.type === "COMBAT_INTERRUPTED")).toBe(true)
  })

  test("defending player can also trigger interrupt", () => {
    const s = afterDefenseDeclared(buildState())
    const { newState } = applyMove(s, "p2", { type: "INTERRUPT_COMBAT" })
    expect(newState.combatState).toBeNull()
  })

  test("round cards (allies played) are discarded on interrupt", () => {
    const s = afterDefenseDeclared(buildState())
    // p2 is losing — play ally card first, then interrupt
    const { newState: withAlly } = applyMove(s, "p2", {
      type: "PLAY_COMBAT_CARD",
      cardInstanceId: "ally-def",
    })
    expect(withAlly.combatState!.defenderCards).toHaveLength(1)

    const { newState: interrupted } = applyMove(withAlly, "p1", { type: "INTERRUPT_COMBAT" })
    expect(interrupted.combatState).toBeNull()
    expect(interrupted.players["p2"]!.discardPile.some((c) => c.instanceId === "ally-def")).toBe(
      true,
    )
  })

  test("champions and their attachments are NOT discarded on interrupt", () => {
    const s = afterDefenseDeclared(buildState())
    const { newState } = applyMove(s, "p1", { type: "INTERRUPT_COMBAT" })
    // Attacker and defender champions should still be in their pools
    expect(newState.players["p1"]!.pool.some((e) => e.champion.instanceId === "att")).toBe(true)
    expect(newState.players["p2"]!.pool.some((e) => e.champion.instanceId === "def")).toBe(true)
  })

  test("no realm is razed on interrupt", () => {
    const s = afterDefenseDeclared(buildState())
    const { newState } = applyMove(s, "p1", { type: "INTERRUPT_COMBAT" })
    const realmSlot = newState.players["p2"]!.formation.slots["A"]
    expect(realmSlot).toBeDefined()
    expect(realmSlot!.isRazed).toBe(false)
  })

  test("no spoils are earned on interrupt", () => {
    const s = afterDefenseDeclared(buildState())
    const { events } = applyMove(s, "p1", { type: "INTERRUPT_COMBAT" })
    expect(events.some((e) => e.type === "SPOILS_EARNED")).toBe(false)
  })
})

// ─── Spoil of combat ──────────────────────────────────────────────────────────

describe("spoil of combat", () => {
  function buildCombatState() {
    const champ: CardInstance = { instanceId: "att", card: CHAMPION_CLERIC_FR }
    const realm: CardInstance = { instanceId: "realm-p2", card: REALM_GENERIC }
    let s = initGame(DEFAULT_CONFIG)
    s = {
      ...s,
      phase: Phase.Combat,
      players: {
        ...s.players,
        p1: { ...s.players["p1"]!, pool: [{ champion: champ, attachments: [] }] },
        p2: {
          ...s.players["p2"]!,
          formation: {
            size: 6,
            slots: { A: { realm, isRazed: false, holdings: [], holdingRevealedToAll: false } },
          },
        },
      },
    }
    return s
  }

  test("pendingSpoil set for attacker on realm razed (DECLINE_DEFENSE)", () => {
    const s = buildCombatState()
    const { newState: s1 } = applyMove(s, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetRealmSlot: "A",
      targetPlayerId: "p2",
    })
    const { newState: s2 } = applyMove(s1, "p2", { type: "DECLINE_DEFENSE" })
    expect(s2.pendingSpoil).toBe("p1")
    expect(s2.players["p1"]!.hand.length).toBe(s.players["p1"]!.hand.length) // not auto-drawn
  })

  test("CLAIM_SPOIL is in legal moves when pendingSpoil matches player", () => {
    const s = buildCombatState()
    const { newState: s1 } = applyMove(s, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetRealmSlot: "A",
      targetPlayerId: "p2",
    })
    const { newState: s2 } = applyMove(s1, "p2", { type: "DECLINE_DEFENSE" })
    const moves = getLegalMoves(s2, "p1")
    expect(moves.some((m) => m.type === "CLAIM_SPOIL")).toBe(true)
    // Opponent should not see CLAIM_SPOIL
    expect(getLegalMoves(s2, "p2").some((m) => m.type === "CLAIM_SPOIL")).toBe(false)
  })

  test("CLAIM_SPOIL draws 1 card and clears pendingSpoil", () => {
    const s = buildCombatState()
    const { newState: s1 } = applyMove(s, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetRealmSlot: "A",
      targetPlayerId: "p2",
    })
    const { newState: s2 } = applyMove(s1, "p2", { type: "DECLINE_DEFENSE" })
    const handBefore = s2.players["p1"]!.hand.length
    const { newState: s3 } = applyMove(s2, "p1", { type: "CLAIM_SPOIL" })
    expect(s3.pendingSpoil).toBeNull()
    expect(s3.players["p1"]!.hand.length).toBe(handBefore + 1)
  })

  test("pendingSpoil clears on turn transition without claiming", () => {
    const s = buildCombatState()
    const { newState: s1 } = applyMove(s, "p1", {
      type: "DECLARE_ATTACK",
      championId: "att",
      targetRealmSlot: "A",
      targetPlayerId: "p2",
    })
    const { newState: s2 } = applyMove(s1, "p2", { type: "DECLINE_DEFENSE" })
    expect(s2.pendingSpoil).toBe("p1")
    // End p1's turn without claiming
    const { newState: s3 } = applyMove(s2, "p1", { type: "END_TURN" })
    expect(s3.pendingSpoil).toBeNull()
    expect(s3.activePlayer).toBe("p2")
  })

  test("defender wins — no spoil earned (only attackers earn spoils)", () => {
    const attacker: CardInstance = { instanceId: "att", card: CHAMPION_CLERIC_FR } // level 6
    const defender: CardInstance = { instanceId: "def", card: CHAMPION_WIZARD_FR } // level 8
    const realm: CardInstance = { instanceId: "realm-p2", card: REALM_GENERIC }
    let s = initGame(DEFAULT_CONFIG)
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
            slots: { A: { realm, isRazed: false, holdings: [], holdingRevealedToAll: false } },
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
    const { newState: s3 } = applyMove(s2, "p1", { type: "STOP_PLAYING" })
    expect(s3.pendingSpoil).toBeNull()
    expect(getLegalMoves(s3, "p2").some((m) => m.type === "CLAIM_SPOIL")).toBe(false)
  })
})

// ─── PLAY_REALM from START_OF_TURN ────────────────────────────────────────────

describe("PLAY_REALM from START_OF_TURN (skip draw confirmation)", () => {
  function buildStateWithRealmInHand() {
    const realm: CardInstance = { instanceId: "realm-inst", card: REALM_GENERIC }
    let s = initGame(DEFAULT_CONFIG)
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players["p1"]!, hand: [...s.players["p1"]!.hand, realm] },
      },
    }
    expect(s.phase).toBe(Phase.StartOfTurn)
    return s
  }

  test("PLAY_REALM is in legal moves during START_OF_TURN when realm in hand", () => {
    const s = buildStateWithRealmInHand()
    const moves = getLegalMoves(s, "p1")
    expect(moves.some((m) => m.type === "PLAY_REALM")).toBe(true)
  })

  test("PLAY_REALM from START_OF_TURN skips drawing — no cards drawn", () => {
    const s = buildStateWithRealmInHand()
    const handBefore = s.players["p1"]!.hand.length // includes the realm
    const drawBefore = s.players["p1"]!.drawPile.length
    const { newState } = applyMove(s, "p1", {
      type: "PLAY_REALM",
      cardInstanceId: "realm-inst",
      slot: "A",
    })
    // Only the realm is removed from hand — no cards drawn
    expect(newState.players["p1"]!.hand.length).toBe(handBefore - 1)
    expect(newState.players["p1"]!.drawPile.length).toBe(drawBefore)
  })

  test("PLAY_REALM from START_OF_TURN advances phase to POOL", () => {
    const s = buildStateWithRealmInHand()
    const { newState } = applyMove(s, "p1", {
      type: "PLAY_REALM",
      cardInstanceId: "realm-inst",
      slot: "A",
    })
    expect(newState.phase).toBe(Phase.Pool)
  })

  test("PLAY_REALM from START_OF_TURN places realm in correct slot", () => {
    const s = buildStateWithRealmInHand()
    const { newState } = applyMove(s, "p1", {
      type: "PLAY_REALM",
      cardInstanceId: "realm-inst",
      slot: "A",
    })
    const slot = newState.players["p1"]!.formation.slots["A"]
    expect(slot).toBeDefined()
    expect(slot!.realm.instanceId).toBe("realm-inst")
    expect(slot!.isRazed).toBe(false)
  })
})

// ─── REBUILD_REALM ────────────────────────────────────────────────────────────

describe("REBUILD_REALM", () => {
  function ci(instanceId: string, card: typeof REALM_GENERIC): CardInstance {
    return { instanceId, card }
  }

  function buildRebuildState(): GameState {
    const s = initGame(DEFAULT_CONFIG)
    const filler1 = ci("f1", CHAMPION_HERO_GENERIC)
    const filler2 = ci("f2", CHAMPION_HERO_GENERIC)
    const filler3 = ci("f3", CHAMPION_HERO_GENERIC)
    const filler4 = ci("f4", CHAMPION_HERO_GENERIC)
    return {
      ...s,
      phase: Phase.PlayRealm,
      activePlayer: "p1",
      hasPlayedRealmThisTurn: false,
      players: {
        ...s.players,
        p1: {
          ...s.players["p1"]!,
          hand: [filler1, filler2, filler3, filler4],
          formation: {
            size: 6,
            slots: {
              A: { realm: ci("realm-a", REALM_GENERIC), isRazed: true, holdings: [] },
              B: { realm: ci("realm-b", REALM_GENERIC), isRazed: false, holdings: [] },
            },
          },
        },
      },
    }
  }

  test("discards chosen 3 cards and rebuilds the razed realm", () => {
    const s = buildRebuildState()
    const { newState } = applyMove(s, "p1", {
      type: "REBUILD_REALM",
      slot: "A",
      cardInstanceIds: ["f1", "f2", "f3"],
    })
    expect(newState.players["p1"]!.formation.slots["A"]!.isRazed).toBe(false)
    expect(newState.players["p1"]!.hand).toHaveLength(1)
    expect(newState.players["p1"]!.hand[0]!.instanceId).toBe("f4")
    expect(newState.players["p1"]!.discardPile.map((c) => c.instanceId)).toEqual(
      expect.arrayContaining(["f1", "f2", "f3"]),
    )
  })

  test("allows choosing non-consecutive cards from hand", () => {
    const s = buildRebuildState()
    const { newState } = applyMove(s, "p1", {
      type: "REBUILD_REALM",
      slot: "A",
      cardInstanceIds: ["f1", "f3", "f4"],
    })
    expect(newState.players["p1"]!.formation.slots["A"]!.isRazed).toBe(false)
    expect(newState.players["p1"]!.hand).toHaveLength(1)
    expect(newState.players["p1"]!.hand[0]!.instanceId).toBe("f2")
  })

  test("throws when a cardInstanceId is not in hand", () => {
    const s = buildRebuildState()
    expect(() =>
      applyMove(s, "p1", {
        type: "REBUILD_REALM",
        slot: "A",
        cardInstanceIds: ["f1", "f2", "nonexistent"],
      }),
    ).toThrow(EngineError)
  })

  test("throws when duplicate cardInstanceIds", () => {
    const s = buildRebuildState()
    expect(() =>
      applyMove(s, "p1", {
        type: "REBUILD_REALM",
        slot: "A",
        cardInstanceIds: ["f1", "f1", "f2"],
      }),
    ).toThrow(EngineError)
  })

  test("throws when slot is not razed", () => {
    const s = buildRebuildState()
    expect(() =>
      applyMove(s, "p1", {
        type: "REBUILD_REALM",
        slot: "B",
        cardInstanceIds: ["f1", "f2", "f3"],
      }),
    ).toThrow(EngineError)
  })

  test("legal moves include REBUILD_REALM when hand >= 3 and realm is razed", () => {
    const s = buildRebuildState()
    const moves = getLegalMoves(s, "p1")
    const rebuildMoves = moves.filter((m) => m.type === "REBUILD_REALM")
    expect(rebuildMoves).toHaveLength(1)
    expect((rebuildMoves[0] as { slot: string }).slot).toBe("A")
  })

  test("no REBUILD_REALM in legal moves when hand < 3", () => {
    const s = buildRebuildState()
    const twoCards = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players["p1"]!, hand: s.players["p1"]!.hand.slice(0, 2) },
      },
    }
    const moves = getLegalMoves(twoCards, "p1")
    expect(moves.some((m) => m.type === "REBUILD_REALM")).toBe(false)
  })
})

// ─── PLAY_HOLDING on razed realm (rebuilder) ─────────────────────────────────

describe("PLAY_HOLDING with rebuild_realm effect", () => {
  const REBUILDER_HOLDING: typeof HOLDING_FR = {
    ...HOLDING_FR,
    cardNumber: 401,
    name: "Rebuilder Holding",
    effects: [{ type: "rebuild_realm" as const }],
  }

  function ci(instanceId: string, card: typeof REALM_GENERIC): CardInstance {
    return { instanceId, card }
  }

  function buildHoldingRebuildState(): GameState {
    const s = initGame(DEFAULT_CONFIG)
    return {
      ...s,
      phase: Phase.PlayRealm,
      activePlayer: "p1",
      hasPlayedRealmThisTurn: false,
      players: {
        ...s.players,
        p1: {
          ...s.players["p1"]!,
          hand: [ci("holding-1", REBUILDER_HOLDING)],
          formation: {
            size: 6,
            slots: {
              A: { realm: ci("realm-a", REALM_GENERIC), isRazed: true, holdings: [] },
            },
          },
        },
      },
    }
  }

  test("rebuilder holding on razed realm unrazes it and attaches", () => {
    const s = buildHoldingRebuildState()
    const { newState, events } = applyMove(s, "p1", {
      type: "PLAY_HOLDING",
      cardInstanceId: "holding-1",
      realmSlot: "A",
    })
    expect(newState.players["p1"]!.formation.slots["A"]!.isRazed).toBe(false)
    expect(newState.players["p1"]!.formation.slots["A"]!.holdings).toHaveLength(1)
    expect(newState.players["p1"]!.formation.slots["A"]!.holdingRevealedToAll).toBe(true)
    expect(events.some((e) => e.type === "REALM_REBUILT")).toBe(true)
  })

  test("normal holding on razed realm still throws", () => {
    const s = initGame(DEFAULT_CONFIG)
    const state: GameState = {
      ...s,
      phase: Phase.PlayRealm,
      activePlayer: "p1",
      hasPlayedRealmThisTurn: false,
      players: {
        ...s.players,
        p1: {
          ...s.players["p1"]!,
          hand: [ci("holding-1", HOLDING_FR)],
          formation: {
            size: 6,
            slots: {
              A: { realm: ci("realm-a", REALM_GENERIC), isRazed: true, holdings: [] },
            },
          },
        },
      },
    }
    expect(() =>
      applyMove(state, "p1", {
        type: "PLAY_HOLDING",
        cardInstanceId: "holding-1",
        realmSlot: "A",
      }),
    ).toThrow(EngineError)
  })

  test("rebuilder holding appears in legal moves for razed realm", () => {
    const s = buildHoldingRebuildState()
    const moves = getLegalMoves(s, "p1")
    const holdingMoves = moves.filter((m) => m.type === "PLAY_HOLDING")
    expect(holdingMoves).toHaveLength(1)
    expect((holdingMoves[0] as { realmSlot: string }).realmSlot).toBe("A")
  })
})

// ─── Champion from hand in combat ────────────────────────────────────────────

describe("combat: attacker champion from hand", () => {
  function buildHandAttackState() {
    let s = initGame(DEFAULT_CONFIG)
    const champInHand: CardInstance = { instanceId: "champ-hand", card: CHAMPION_CLERIC_FR }
    const realmP2: CardInstance = { instanceId: "realm-p2", card: REALM_GENERIC }
    return {
      ...s,
      phase: Phase.Combat,
      currentTurn: 3, // past round 1 (isRoundOne = currentTurn <= playerOrder.length)
      players: {
        ...s.players,
        p1: {
          ...s.players["p1"]!,
          pool: [],
          hand: [champInHand],
        },
        p2: {
          ...s.players["p2"]!,
          pool: [],
          formation: {
            size: 6 as const,
            slots: { A: { realm: realmP2, isRazed: false, holdings: [] } },
          },
        },
      },
    }
  }

  test("DECLARE_ATTACK legal moves include hand champion", () => {
    const s = buildHandAttackState()
    const moves = getLegalMoves(s, "p1")
    const attackMoves = moves.filter((m) => m.type === "DECLARE_ATTACK")
    expect(attackMoves.length).toBeGreaterThan(0)
    expect(attackMoves.some((m) => (m as { championId: string }).championId === "champ-hand")).toBe(
      true,
    )
  })

  test("DECLARE_ATTACK from hand moves champion to pool", () => {
    const s = buildHandAttackState()
    const { newState } = applyMove(s, "p1", {
      type: "DECLARE_ATTACK",
      championId: "champ-hand",
      targetRealmSlot: "A",
      targetPlayerId: "p2",
    })
    expect(newState.players["p1"]!.hand.find((c) => c.instanceId === "champ-hand")).toBeUndefined()
    expect(
      newState.players["p1"]!.pool.find((e) => e.champion.instanceId === "champ-hand"),
    ).toBeDefined()
    expect(newState.combatState!.attacker!.instanceId).toBe("champ-hand")
  })

  test("CONTINUE_ATTACK legal moves include hand champion", () => {
    let s = initGame(DEFAULT_CONFIG)
    const round1Champ: CardInstance = { instanceId: "att-r1", card: CHAMPION_CLERIC_FR }
    const round2Champ: CardInstance = { instanceId: "att-r2", card: CHAMPION_WIZARD_FR }
    const defender: CardInstance = { instanceId: "def", card: CHAMPION_CLERIC_FR }
    const realm: CardInstance = { instanceId: "realm-p2", card: REALM_GENERIC }

    // Set up: p1 already won round 1, now AWAITING_ATTACKER. round2Champ is in hand.
    s = {
      ...s,
      phase: Phase.Combat,
      players: {
        ...s.players,
        p1: {
          ...s.players["p1"]!,
          pool: [{ champion: round1Champ, attachments: [] }],
          hand: [round2Champ],
        },
        p2: {
          ...s.players["p2"]!,
          pool: [{ champion: defender, attachments: [] }],
          formation: { size: 6, slots: { A: { realm, isRazed: false, holdings: [] } } },
        },
      },
      combatState: {
        attackingPlayer: "p1",
        defendingPlayer: "p2",
        targetRealmSlot: "A",
        roundPhase: "AWAITING_ATTACKER",
        attacker: round1Champ,
        defender: null,
        attackerCards: [],
        defenderCards: [],
        championsUsedThisBattle: [round1Champ.instanceId],
        attackerWins: 1,
        attackerManualLevel: null,
        defenderManualLevel: null,
      },
    }

    const moves = getLegalMoves(s, "p1")
    const continueMoves = moves.filter((m) => m.type === "CONTINUE_ATTACK")
    expect(continueMoves.some((m) => (m as { championId: string }).championId === "att-r2")).toBe(
      true,
    )
  })

  test("CONTINUE_ATTACK from hand moves champion to pool", () => {
    let s = initGame(DEFAULT_CONFIG)
    const round1Champ: CardInstance = { instanceId: "att-r1", card: CHAMPION_CLERIC_FR }
    const round2Champ: CardInstance = { instanceId: "att-r2", card: CHAMPION_WIZARD_FR }
    const defender: CardInstance = { instanceId: "def", card: CHAMPION_CLERIC_FR }
    const realm: CardInstance = { instanceId: "realm-p2", card: REALM_GENERIC }

    s = {
      ...s,
      phase: Phase.Combat,
      players: {
        ...s.players,
        p1: {
          ...s.players["p1"]!,
          pool: [{ champion: round1Champ, attachments: [] }],
          hand: [round2Champ],
        },
        p2: {
          ...s.players["p2"]!,
          pool: [{ champion: defender, attachments: [] }],
          formation: { size: 6, slots: { A: { realm, isRazed: false, holdings: [] } } },
        },
      },
      combatState: {
        attackingPlayer: "p1",
        defendingPlayer: "p2",
        targetRealmSlot: "A",
        roundPhase: "AWAITING_ATTACKER",
        attacker: round1Champ,
        defender: null,
        attackerCards: [],
        defenderCards: [],
        championsUsedThisBattle: [round1Champ.instanceId],
        attackerWins: 1,
        attackerManualLevel: null,
        defenderManualLevel: null,
      },
    }

    const { newState } = applyMove(s, "p1", {
      type: "CONTINUE_ATTACK",
      championId: "att-r2",
    })
    expect(newState.players["p1"]!.hand.find((c) => c.instanceId === "att-r2")).toBeUndefined()
    expect(
      newState.players["p1"]!.pool.find((e) => e.champion.instanceId === "att-r2"),
    ).toBeDefined()
    expect(newState.combatState!.attacker!.instanceId).toBe("att-r2")
  })
})

describe("combat: defender champion from hand", () => {
  test("DECLARE_DEFENSE legal moves include hand champion", () => {
    let s = initGame(DEFAULT_CONFIG)
    const attacker: CardInstance = { instanceId: "att", card: CHAMPION_WIZARD_FR }
    const defenderInHand: CardInstance = { instanceId: "def-hand", card: CHAMPION_CLERIC_FR }
    const realm: CardInstance = { instanceId: "realm-p1", card: REALM_GENERIC }

    s = {
      ...s,
      phase: Phase.Combat,
      players: {
        ...s.players,
        p1: {
          ...s.players["p1"]!,
          pool: [],
          hand: [defenderInHand],
          formation: { size: 6, slots: { A: { realm, isRazed: false, holdings: [] } } },
        },
        p2: { ...s.players["p2"]!, pool: [{ champion: attacker, attachments: [] }] },
      },
      combatState: {
        attackingPlayer: "p2",
        defendingPlayer: "p1",
        targetRealmSlot: "A",
        roundPhase: "AWAITING_DEFENDER",
        attacker,
        defender: null,
        attackerCards: [],
        defenderCards: [],
        championsUsedThisBattle: [attacker.instanceId],
        attackerWins: 0,
        attackerManualLevel: null,
        defenderManualLevel: null,
      },
      activePlayer: "p1",
    }

    const moves = getLegalMoves(s, "p1")
    const defenseMoves = moves.filter((m) => m.type === "DECLARE_DEFENSE")
    expect(defenseMoves.some((m) => (m as { championId: string }).championId === "def-hand")).toBe(
      true,
    )
  })

  test("DECLARE_DEFENSE from hand moves champion to pool", () => {
    let s = initGame(DEFAULT_CONFIG)
    const attacker: CardInstance = { instanceId: "att", card: CHAMPION_WIZARD_FR }
    const defenderInHand: CardInstance = { instanceId: "def-hand", card: CHAMPION_CLERIC_FR }
    const realm: CardInstance = { instanceId: "realm-p1", card: REALM_GENERIC }

    s = {
      ...s,
      phase: Phase.Combat,
      players: {
        ...s.players,
        p1: {
          ...s.players["p1"]!,
          pool: [],
          hand: [defenderInHand],
          formation: { size: 6, slots: { A: { realm, isRazed: false, holdings: [] } } },
        },
        p2: { ...s.players["p2"]!, pool: [{ champion: attacker, attachments: [] }] },
      },
      combatState: {
        attackingPlayer: "p2",
        defendingPlayer: "p1",
        targetRealmSlot: "A",
        roundPhase: "AWAITING_DEFENDER",
        attacker,
        defender: null,
        attackerCards: [],
        defenderCards: [],
        championsUsedThisBattle: [attacker.instanceId],
        attackerWins: 0,
        attackerManualLevel: null,
        defenderManualLevel: null,
      },
      activePlayer: "p1",
    }

    const { newState } = applyMove(s, "p1", {
      type: "DECLARE_DEFENSE",
      championId: "def-hand",
    })
    expect(newState.players["p1"]!.hand.find((c) => c.instanceId === "def-hand")).toBeUndefined()
    expect(
      newState.players["p1"]!.pool.find((e) => e.champion.instanceId === "def-hand"),
    ).toBeDefined()
    expect(newState.combatState!.defender!.instanceId).toBe("def-hand")
  })
})
