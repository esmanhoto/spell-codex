import { describe, test, expect, beforeEach } from "bun:test"
import { applyMove } from "../../src/engine.ts"
import { _resetInstanceCounter } from "../../src/utils.ts"
import { inst, makeChampion, makeRealm, buildCombatCardPlayState } from "../scenario-builders.ts"

beforeEach(() => {
  _resetInstanceCounter()
})

// ─── Multi-round combat: attackerWins 0 → 1 → 2 progression ────────────────

describe("multi-round combat: attacker beats two champions to raze realm", () => {
  test("first win: defender champion discarded, attackerWins becomes 1, AWAITING_ATTACKER", () => {
    const attacker = inst("att1", makeChampion({ level: 10 }))
    const defender = inst("def1", makeChampion({ level: 3, cardNumber: 9001 }))
    const realm = inst("realm", makeRealm())

    const state = buildCombatCardPlayState({
      attacker,
      defender,
      targetRealm: realm,
    })
    // p2 (defender side) is losing → active player, concedes
    const tweaked = { ...state, activePlayer: "p2" as const }

    const { newState } = applyMove(tweaked, "p2", { type: "STOP_PLAYING" })

    // Defender champion discarded
    expect(newState.players["p2"]!.pool.some((e) => e.champion.instanceId === "def1")).toBe(false)
    expect(newState.players["p2"]!.discardPile.some((c) => c.instanceId === "def1")).toBe(true)

    // Combat continues, not ended
    expect(newState.combatState).not.toBeNull()
    expect(newState.combatState!.attackerWins).toBe(1)
    expect(newState.combatState!.roundPhase).toBe("AWAITING_ATTACKER")

    // Attacker champion still in pool
    expect(newState.players["p1"]!.pool.some((e) => e.champion.instanceId === "att1")).toBe(true)

    // Realm NOT razed yet
    const realmSlot = newState.players["p2"]!.formation.slots["A"]
    expect(realmSlot).toBeDefined()
    expect(realmSlot!.isRazed).toBe(false)
  })

  test("CONTINUE_ATTACK after first win: attacker sends second champion", () => {
    const att1 = inst("att1", makeChampion({ level: 10 }))
    const att2 = inst("att2", makeChampion({ level: 8, cardNumber: 9002, name: "Second Champion" }))
    const def1 = inst("def1", makeChampion({ level: 3, cardNumber: 9001 }))
    const realm = inst("realm", makeRealm())

    // Start with attackerWins=1, AWAITING_ATTACKER, att2 in pool
    const base = buildCombatCardPlayState({
      attacker: att1,
      defender: def1,
      targetRealm: realm,
    })
    const state: typeof base = {
      ...base,
      players: {
        ...base.players,
        p1: {
          ...base.players["p1"]!,
          pool: [
            { champion: att1, attachments: [] },
            { champion: att2, attachments: [] },
          ],
        },
        p2: {
          ...base.players["p2"]!,
          pool: [], // def1 already discarded from round 1
        },
      },
      combatState: {
        ...base.combatState!,
        roundPhase: "AWAITING_ATTACKER",
        attacker: null,
        defender: null,
        attackerCards: [],
        defenderCards: [],
        attackerWins: 1,
        championsUsedThisBattle: ["att1", "def1"],
      },
      activePlayer: "p1",
    }

    const { newState } = applyMove(state, "p1", {
      type: "CONTINUE_ATTACK",
      championId: "att2",
    })

    expect(newState.combatState!.attacker!.instanceId).toBe("att2")
    expect(newState.combatState!.roundPhase).toBe("AWAITING_DEFENDER")
    expect(newState.combatState!.championsUsedThisBattle).toContain("att2")
    expect(newState.activePlayer).toBe("p2")
  })

  test("second win razes realm and earns spoils", () => {
    const att2 = inst(
      "att2",
      makeChampion({ level: 10, cardNumber: 9002, name: "Second Champion" }),
    )
    const def2 = inst("def2", makeChampion({ level: 3, cardNumber: 9003, name: "Second Defender" }))
    const realm = inst("realm", makeRealm())

    const base = buildCombatCardPlayState({
      attacker: att2,
      defender: def2,
      targetRealm: realm,
    })
    const state: typeof base = {
      ...base,
      activePlayer: "p2" as const,
      combatState: {
        ...base.combatState!,
        attackerWins: 1, // already won one round
        championsUsedThisBattle: ["att1", "def1", "att2", "def2"],
      },
    }

    // Defender concedes second round
    const { newState, events } = applyMove(state, "p2", { type: "STOP_PLAYING" })

    // Realm is razed
    const realmSlot = newState.players["p2"]!.formation.slots["A"]
    expect(realmSlot!.isRazed).toBe(true)

    // Combat ended
    expect(newState.combatState).toBeNull()

    // Spoils event
    expect(events.some((e) => e.type === "REALM_RAZED")).toBe(true)
  })

  test("CONTINUE_ATTACK rejects champion already used in this battle", () => {
    const att1 = inst("att1", makeChampion({ level: 10 }))
    const def1 = inst("def1", makeChampion({ level: 3, cardNumber: 9001 }))
    const realm = inst("realm", makeRealm())

    const base = buildCombatCardPlayState({
      attacker: att1,
      defender: def1,
      targetRealm: realm,
    })
    const state: typeof base = {
      ...base,
      combatState: {
        ...base.combatState!,
        roundPhase: "AWAITING_ATTACKER",
        attacker: null,
        defender: null,
        attackerWins: 1,
        championsUsedThisBattle: ["att1", "def1"],
      },
      activePlayer: "p1",
    }

    expect(() =>
      applyMove(state, "p1", {
        type: "CONTINUE_ATTACK",
        championId: "att1",
      }),
    ).toThrow("Cannot reuse a champion in the same battle")
  })

  test("END_ATTACK after first win: attacker chooses not to continue", () => {
    const att1 = inst("att1", makeChampion({ level: 10 }))
    const def1 = inst("def1", makeChampion({ level: 3, cardNumber: 9001 }))
    const realm = inst("realm", makeRealm())

    const base = buildCombatCardPlayState({
      attacker: att1,
      defender: def1,
      targetRealm: realm,
    })
    const state: typeof base = {
      ...base,
      combatState: {
        ...base.combatState!,
        roundPhase: "AWAITING_ATTACKER",
        attacker: null,
        defender: null,
        attackerWins: 1,
      },
      activePlayer: "p1",
    }

    const { newState } = applyMove(state, "p1", { type: "END_ATTACK" })

    // Combat ended without razing
    expect(newState.combatState).toBeNull()
    const realmSlot = newState.players["p2"]!.formation.slots["A"]
    expect(realmSlot!.isRazed).toBe(false)
  })
})

// ─── Realm self-defense: attacker beats realm, then continues ────────────────

describe("multi-round combat: realm self-defense then champion", () => {
  test("beating self-defending realm: attackerWins increments, realm NOT razed, combat continues", () => {
    const att = inst("att", makeChampion({ level: 10 }))
    const realm = inst("realm", makeRealm())

    const base = buildCombatCardPlayState({
      attacker: att,
      defender: inst("unused", makeChampion()),
      targetRealm: realm,
    })
    // Override to make realm the defender (self-defense)
    const state: typeof base = {
      ...base,
      activePlayer: "p2" as const,
      players: {
        ...base.players,
        p2: {
          ...base.players["p2"]!,
          pool: [], // no champions in pool
        },
      },
      combatState: {
        ...base.combatState!,
        defender: realm, // realm defends itself
        championsUsedThisBattle: ["att", "realm"],
      },
    }

    // Defender (realm) concedes
    const { newState } = applyMove(state, "p2", { type: "STOP_PLAYING" })

    expect(newState.combatState).not.toBeNull()
    expect(newState.combatState!.attackerWins).toBe(1)
    expect(newState.combatState!.roundPhase).toBe("AWAITING_ATTACKER")

    // Realm is NOT razed (only discarded champion, realm stays)
    const realmSlot = newState.players["p2"]!.formation.slots["A"]
    expect(realmSlot!.isRazed).toBe(false)
  })

  test("DECLINE_DEFENSE after realm self-defense lost: razes realm", () => {
    const att = inst("att", makeChampion({ level: 10 }))
    const realm = inst("realm", makeRealm())

    const base = buildCombatCardPlayState({
      attacker: att,
      defender: inst("unused", makeChampion()),
      targetRealm: realm,
    })
    const state: typeof base = {
      ...base,
      players: {
        ...base.players,
        p2: {
          ...base.players["p2"]!,
          pool: [],
        },
      },
      combatState: {
        ...base.combatState!,
        roundPhase: "AWAITING_DEFENDER",
        attacker: att,
        defender: null,
        attackerWins: 1,
        championsUsedThisBattle: ["att", "realm"],
      },
      activePlayer: "p2",
    }

    const { newState, events } = applyMove(state, "p2", { type: "DECLINE_DEFENSE" })

    expect(newState.combatState).toBeNull()
    const realmSlot = newState.players["p2"]!.formation.slots["A"]
    expect(realmSlot!.isRazed).toBe(true)
    expect(events.some((e) => e.type === "REALM_RAZED")).toBe(true)
  })
})
