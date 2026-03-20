import { describe, it, expect } from "bun:test"
import { buildHandContextActions } from "./manual-actions.ts"
import type { CardInfo, Move, CombatInfo, PlayerBoard } from "../api.ts"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCard(overrides: Partial<CardInfo> = {}): CardInfo {
  return {
    instanceId: "c1",
    name: "Test Card",
    typeId: 7, // Hero (champion)
    worldId: 0,
    level: 5,
    setId: "1st",
    cardNumber: 1,
    description: "",
    supportIds: [],
    spellNature: null,
    castPhases: [],
    ...overrides,
  }
}

const noopSpellCast = () => {}

const EMPTY_BOARD: PlayerBoard = {
  hand: [], handCount: 0, handHidden: false,
  formation: {}, pool: [],
  drawPileCount: 0, discardCount: 0, discardPile: [], lastingEffects: [],
}

/** Default required args for buildHandContextActions (no casters, pool phase). */
const BASE_ARGS = {
  myBoard: EMPTY_BOARD,
  myPlayerId: "p1",
  allBoards: { p1: EMPTY_BOARD } as Record<string, PlayerBoard>,
  phase: "POOL",
} as const

/** Board with a wizard champion that can cast wizard+cleric spells in pool. */
const WIZARD_CHAMP = makeCard({ instanceId: "wiz-pool", typeId: 20, name: "Wizard", supportIds: [1, 4, 9, "d4", "o4", "d19", "o19"] })
const BOARD_WITH_CASTER: PlayerBoard = {
  ...EMPTY_BOARD,
  pool: [{ champion: WIZARD_CHAMP, attachments: [] }],
}
const CASTER_ARGS = {
  myBoard: BOARD_WITH_CASTER,
  myPlayerId: "p1",
  allBoards: { p1: BOARD_WITH_CASTER } as Record<string, PlayerBoard>,
  phase: "POOL",
} as const

// ─── Card type constants ─────────────────────────────────────────────────────
// Champion types: 5(Cleric), 7(Hero), 10(Monster), 12(Thief), 14(Wizard), 16(Psionicist), 20(Regent)
// Other: 1(Ally), 2(Artifact), 4(ClericSpell), 6(Event), 8(Holding), 9(MagicalItem), 13(Realm), 19(WizardSpell)

describe("buildHandContextActions — always returns all applicable actions", () => {
  it("opponent cards → empty array", () => {
    const actions = buildHandContextActions({
        ...BASE_ARGS,
      card: makeCard(),
      isOpponent: true,
      legalMoves: [],
      requestSpellCast: noopSpellCast,
    })
    expect(actions).toEqual([])
  })

  // ─── Champion cards ──────────────────────────────────────────────────────

  describe("champion card", () => {
    const champion = makeCard({ typeId: 7, instanceId: "champ" })

    it("returns Place in Pool (disabled) when no legal move", () => {
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: champion,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
      })
      const place = actions.find((a) => a.label === "Place in Pool")
      expect(place).toBeDefined()
      expect(place!.disabled).toBe(true)
    })

    it("returns Place in Pool (enabled) when PLACE_CHAMPION legal", () => {
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: champion,
        isOpponent: false,
        legalMoves: [{ type: "PLACE_CHAMPION", cardInstanceId: "champ" }],
        requestSpellCast: noopSpellCast,
      })
      const place = actions.find((a) => a.label === "Place in Pool")
      expect(place).toBeDefined()
      expect(place!.disabled).not.toBe(true)
      expect(place!.move).toEqual({ type: "PLACE_CHAMPION", cardInstanceId: "champ" })
    })

    it("returns Discard (disabled) when no legal move", () => {
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: champion,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
      })
      const discard = actions.find((a) => a.label === "Discard")
      expect(discard).toBeDefined()
      expect(discard!.disabled).toBe(true)
    })

    it("returns Discard (enabled) when DISCARD_CARD legal", () => {
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: champion,
        isOpponent: false,
        legalMoves: [{ type: "DISCARD_CARD", cardInstanceId: "champ" }],
        requestSpellCast: noopSpellCast,
      })
      const discard = actions.find((a) => a.label === "Discard")
      expect(discard).toBeDefined()
      expect(discard!.disabled).not.toBe(true)
    })
  })

  // ─── Realm cards ─────────────────────────────────────────────────────────

  describe("realm card", () => {
    const realm = makeCard({ typeId: 13, instanceId: "realm1", name: "Test Realm" })

    it("returns Play Realm (disabled) when no legal move", () => {
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: realm,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
      })
      const play = actions.find((a) => a.label === "Play Realm")
      expect(play).toBeDefined()
      expect(play!.disabled).toBe(true)
    })

    it("returns Play Realm (enabled) when PLAY_REALM legal", () => {
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: realm,
        isOpponent: false,
        legalMoves: [{ type: "PLAY_REALM", cardInstanceId: "realm1", slot: "A" }],
        requestSpellCast: noopSpellCast,
      })
      const play = actions.find((a) => a.label === "Play Realm")
      expect(play).toBeDefined()
      expect(play!.disabled).not.toBe(true)
    })
  })

  // ─── Holding cards ───────────────────────────────────────────────────────

  describe("holding card", () => {
    const holding = makeCard({ typeId: 8, instanceId: "hold1" })

    it("returns Play Holding (disabled) when no legal move", () => {
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: holding,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
      })
      const play = actions.find((a) => a.label === "Play Holding")
      expect(play).toBeDefined()
      expect(play!.disabled).toBe(true)
    })

    it("returns Play Holding (enabled) when PLAY_HOLDING legal", () => {
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: holding,
        isOpponent: false,
        legalMoves: [{ type: "PLAY_HOLDING", cardInstanceId: "hold1", realmSlot: "A" }],
        requestSpellCast: noopSpellCast,
      })
      const play = actions.find((a) => a.label === "Play Holding")
      expect(play).toBeDefined()
      expect(play!.disabled).not.toBe(true)
    })
  })

  // ─── Artifact cards ──────────────────────────────────────────────────────

  describe("artifact card", () => {
    const artifact = makeCard({ typeId: 2, instanceId: "art1" })

    it("returns Attach to Champion (disabled) when no legal move", () => {
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: artifact,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
      })
      const attach = actions.find((a) => a.label === "Attach to Champion")
      expect(attach).toBeDefined()
      expect(attach!.disabled).toBe(true)
    })

    it("returns Attach to Champion (enabled) when ATTACH_ITEM legal", () => {
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: artifact,
        isOpponent: false,
        legalMoves: [{ type: "ATTACH_ITEM", cardInstanceId: "art1", championId: "champ1" }],
        requestSpellCast: noopSpellCast,
      })
      const attach = actions.find((a) => a.label === "Attach to Champion")
      expect(attach).toBeDefined()
      expect(attach!.disabled).not.toBe(true)
    })
  })

  // ─── Magical Item cards ──────────────────────────────────────────────────

  describe("magical item card", () => {
    const magItem = makeCard({ typeId: 9, instanceId: "mi1" })

    it("returns Attach to Champion (disabled) when no legal move", () => {
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: magItem,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
      })
      const attach = actions.find((a) => a.label === "Attach to Champion")
      expect(attach).toBeDefined()
      expect(attach!.disabled).toBe(true)
    })

    it("returns Attach to Champion (enabled) when ATTACH_ITEM legal", () => {
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: magItem,
        isOpponent: false,
        legalMoves: [{ type: "ATTACH_ITEM", cardInstanceId: "mi1", championId: "champ1" }],
        requestSpellCast: noopSpellCast,
      })
      const attach = actions.find((a) => a.label === "Attach to Champion")
      expect(attach).toBeDefined()
      expect(attach!.disabled).not.toBe(true)
    })
  })

  // ─── Spell cards ─────────────────────────────────────────────────────────

  describe("spell card", () => {
    const spell = makeCard({ typeId: 19, instanceId: "spell1", name: "Fireball" })

    it("returns Cast Spell (enabled when caster in pool)", () => {
      let castId = ""
      const actions = buildHandContextActions({
        ...CASTER_ARGS,
        phase: "COMBAT", // default castPhases=[] → [4] (combat)
        card: spell,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: (id) => { castId = id },
      })
      const cast = actions.find((a) => a.label === "Cast Spell")
      expect(cast).toBeDefined()
      expect(cast!.disabled).not.toBe(true)
      cast!.action!()
      expect(castId).toBe("spell1")
    })

    it("returns Discard", () => {
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: spell,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
      })
      expect(actions.find((a) => a.label === "Discard")).toBeDefined()
    })
  })

  // ─── Event cards ─────────────────────────────────────────────────────────

  describe("event card", () => {
    const event = makeCard({ typeId: 6, instanceId: "ev1" })

    it("returns Play Event (disabled) when no legal move", () => {
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: event,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
      })
      const play = actions.find((a) => a.label === "Play Event")
      expect(play).toBeDefined()
      expect(play!.disabled).toBe(true)
    })

    it("returns Play Event (enabled) when PLAY_EVENT legal", () => {
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: event,
        isOpponent: false,
        legalMoves: [{ type: "PLAY_EVENT", cardInstanceId: "ev1" }],
        requestSpellCast: noopSpellCast,
      })
      const play = actions.find((a) => a.label === "Play Event")
      expect(play).toBeDefined()
      expect(play!.disabled).not.toBe(true)
    })

    it("returns Discard", () => {
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: event,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
      })
      expect(actions.find((a) => a.label === "Discard")).toBeDefined()
    })
  })

  // ─── Ally cards ──────────────────────────────────────────────────────────

  describe("ally card", () => {
    const ally = makeCard({ typeId: 1, instanceId: "ally1" })

    it("returns Play in Combat (disabled) when no legal move", () => {
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: ally,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
      })
      const play = actions.find((a) => a.label === "Play in Combat")
      expect(play).toBeDefined()
      expect(play!.disabled).toBe(true)
    })

    it("returns Play in Combat (enabled) when PLAY_COMBAT_CARD legal", () => {
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: ally,
        isOpponent: false,
        legalMoves: [{ type: "PLAY_COMBAT_CARD", cardInstanceId: "ally1" }],
        requestSpellCast: noopSpellCast,
      })
      const play = actions.find((a) => a.label === "Play in Combat")
      expect(play).toBeDefined()
      expect(play!.disabled).not.toBe(true)
    })

    it("returns Discard", () => {
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: ally,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
      })
      expect(actions.find((a) => a.label === "Discard")).toBeDefined()
    })
  })

  // ─── During combat: non-combat actions disabled ──────────────────────────

  describe("during combat", () => {
    const combat: CombatInfo = {
      attackingPlayer: "p1",
      defendingPlayer: "p2",
      targetSlot: "A",
      roundPhase: "CARD_PLAY",
      attacker: makeCard({ instanceId: "att" }),
      defender: makeCard({ instanceId: "def" }),
      attackerCards: [],
      defenderCards: [],
      attackerLevel: 8,
      defenderLevel: 5,
      attackerManualLevel: null,
      defenderManualLevel: null,
      championsUsedThisBattle: [],
      borrowedChampions: {},
    }

    it("champion: Place in Pool is disabled during combat", () => {
      const champion = makeCard({ typeId: 7, instanceId: "champ" })
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: champion,
        isOpponent: false,
        legalMoves: [{ type: "PLACE_CHAMPION", cardInstanceId: "champ" }],
        requestSpellCast: noopSpellCast,
        combat,
      })
      const place = actions.find((a) => a.label === "Place in Pool")
      expect(place).toBeDefined()
      expect(place!.disabled).toBe(true)
    })

    it("realm: Play Realm is disabled during combat", () => {
      const realm = makeCard({ typeId: 13, instanceId: "r1" })
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: realm,
        isOpponent: false,
        legalMoves: [{ type: "PLAY_REALM", cardInstanceId: "r1", slot: "A" }],
        requestSpellCast: noopSpellCast,
        combat,
      })
      const play = actions.find((a) => a.label === "Play Realm")
      expect(play!.disabled).toBe(true)
    })

    it("holding: Play Holding is disabled during combat", () => {
      const holding = makeCard({ typeId: 8, instanceId: "h1" })
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: holding,
        isOpponent: false,
        legalMoves: [{ type: "PLAY_HOLDING", cardInstanceId: "h1", realmSlot: "A" }],
        requestSpellCast: noopSpellCast,
        combat,
      })
      const play = actions.find((a) => a.label === "Play Holding")
      expect(play!.disabled).toBe(true)
    })

    it("artifact: Attach to Champion is disabled during combat", () => {
      const artifact = makeCard({ typeId: 2, instanceId: "art1" })
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: artifact,
        isOpponent: false,
        legalMoves: [{ type: "ATTACH_ITEM", cardInstanceId: "art1", championId: "c1" }],
        requestSpellCast: noopSpellCast,
        combat,
      })
      const attach = actions.find((a) => a.label === "Attach to Champion")
      expect(attach!.disabled).toBe(true)
    })

    it("Discard is disabled during combat", () => {
      const card = makeCard({ typeId: 7, instanceId: "c1" })
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card,
        isOpponent: false,
        legalMoves: [{ type: "DISCARD_CARD", cardInstanceId: "c1" }],
        requestSpellCast: noopSpellCast,
        combat,
      })
      const discard = actions.find((a) => a.label === "Discard")
      expect(discard!.disabled).toBe(true)
    })

    it("Play in Combat is enabled during combat for combat-legal cards", () => {
      const ally = makeCard({ typeId: 1, instanceId: "ally1" })
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: ally,
        isOpponent: false,
        legalMoves: [{ type: "PLAY_COMBAT_CARD", cardInstanceId: "ally1" }],
        requestSpellCast: noopSpellCast,
        combat,
      })
      const play = actions.find((a) => a.label === "Play in Combat")
      expect(play).toBeDefined()
      expect(play!.disabled).not.toBe(true)
    })

    it("Play Event is enabled during combat", () => {
      const event = makeCard({ typeId: 6, instanceId: "ev1" })
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: event,
        isOpponent: false,
        legalMoves: [{ type: "PLAY_EVENT", cardInstanceId: "ev1" }],
        requestSpellCast: noopSpellCast,
        combat,
      })
      const play = actions.find((a) => a.label === "Play Event")
      expect(play!.disabled).not.toBe(true)
    })

    it("Cast Spell is enabled during combat when fighting wizard", () => {
      const wizAttacker = makeCard({ instanceId: "wiz-att", typeId: 20, supportIds: [1, 9, "d19", "o19"] })
      const wizCombat: CombatInfo = { ...combat, attacker: wizAttacker }
      const wizBoard: PlayerBoard = {
        ...EMPTY_BOARD,
        pool: [{ champion: wizAttacker, attachments: [] }],
      }
      const spell = makeCard({ typeId: 19, instanceId: "ws1" })
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: spell,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
        combat: wizCombat,
        myBoard: wizBoard,
        allBoards: { p1: wizBoard, p2: EMPTY_BOARD },
        phase: "COMBAT",
      })
      const cast = actions.find((a) => a.label === "Cast Spell")
      expect(cast).toBeDefined()
      expect(cast!.disabled).not.toBe(true)
    })

    it("magical item: Play in Combat enabled, Attach disabled during combat", () => {
      const mi = makeCard({ typeId: 9, instanceId: "mi1" })
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: mi,
        isOpponent: false,
        legalMoves: [
          { type: "PLAY_COMBAT_CARD", cardInstanceId: "mi1" },
          { type: "ATTACH_ITEM", cardInstanceId: "mi1", championId: "c1" },
        ],
        requestSpellCast: noopSpellCast,
        combat,
      })
      const playInCombat = actions.find((a) => a.label === "Play in Combat")
      expect(playInCombat!.disabled).not.toBe(true)
      const attach = actions.find((a) => a.label === "Attach to Champion")
      expect(attach!.disabled).toBe(true)
    })
  })

  // ─── All 22 card type IDs: action shape per type ───────────────────────────

  describe("all card type IDs produce correct action sets", () => {
    // Champion types: 5,7,10,12,14,16,20
    const CHAMPION_TYPE_IDS = [5, 7, 10, 12, 14, 16, 20]

    for (const typeId of CHAMPION_TYPE_IDS) {
      it(`typeId ${typeId} (champion) → Place in Pool + Discard`, () => {
        const card = makeCard({ typeId, instanceId: `champ-${typeId}` })
        const actions = buildHandContextActions({
        ...BASE_ARGS,
          card,
          isOpponent: false,
          legalMoves: [],
          requestSpellCast: noopSpellCast,
        })
        expect(actions.find((a) => a.label === "Place in Pool")).toBeDefined()
        expect(actions.find((a) => a.label === "Discard")).toBeDefined()
        // Champions should NOT have Play Realm, Play Holding, Attach to Champion
        expect(actions.find((a) => a.label === "Play Realm")).toBeUndefined()
        expect(actions.find((a) => a.label === "Play Holding")).toBeUndefined()
        expect(actions.find((a) => a.label === "Attach to Champion")).toBeUndefined()
      })
    }

    // Spell types: 4(ClericSpell), 19(WizardSpell)
    for (const typeId of [4, 19]) {
      it(`typeId ${typeId} (spell) → Cast Spell + Play in Combat + Discard`, () => {
        const card = makeCard({ typeId, instanceId: `spell-${typeId}` })
        const actions = buildHandContextActions({
        ...BASE_ARGS,
          card,
          isOpponent: false,
          legalMoves: [],
          requestSpellCast: noopSpellCast,
        })
        expect(actions.find((a) => a.label === "Cast Spell")).toBeDefined()
        expect(actions.find((a) => a.label === "Play in Combat")).toBeDefined()
        expect(actions.find((a) => a.label === "Discard")).toBeDefined()
      })
    }

    it("typeId 1 (Ally) → Play in Combat + Discard", () => {
      const card = makeCard({ typeId: 1, instanceId: "ally" })
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
      })
      expect(actions.find((a) => a.label === "Play in Combat")).toBeDefined()
      expect(actions.find((a) => a.label === "Discard")).toBeDefined()
      expect(actions.find((a) => a.label === "Place in Pool")).toBeUndefined()
    })

    it("typeId 2 (Artifact) → Play in Combat + Attach to Champion + Discard", () => {
      const card = makeCard({ typeId: 2, instanceId: "art" })
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
      })
      expect(actions.find((a) => a.label === "Play in Combat")).toBeDefined()
      expect(actions.find((a) => a.label === "Attach to Champion")).toBeDefined()
      expect(actions.find((a) => a.label === "Discard")).toBeDefined()
    })

    it("typeId 6 (Event) → Play Event + Discard", () => {
      const card = makeCard({ typeId: 6, instanceId: "ev" })
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
      })
      expect(actions.find((a) => a.label === "Play Event")).toBeDefined()
      expect(actions.find((a) => a.label === "Discard")).toBeDefined()
    })

    it("typeId 8 (Holding) → Play Holding + Discard", () => {
      const card = makeCard({ typeId: 8, instanceId: "hold" })
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
      })
      expect(actions.find((a) => a.label === "Play Holding")).toBeDefined()
      expect(actions.find((a) => a.label === "Discard")).toBeDefined()
    })

    it("typeId 9 (Magical Item) → Play in Combat + Attach to Champion + Discard", () => {
      const card = makeCard({ typeId: 9, instanceId: "mi" })
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
      })
      expect(actions.find((a) => a.label === "Play in Combat")).toBeDefined()
      expect(actions.find((a) => a.label === "Attach to Champion")).toBeDefined()
      expect(actions.find((a) => a.label === "Discard")).toBeDefined()
    })

    it("typeId 13 (Realm) → Play Realm + Discard", () => {
      const card = makeCard({ typeId: 13, instanceId: "realm" })
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
      })
      expect(actions.find((a) => a.label === "Play Realm")).toBeDefined()
      expect(actions.find((a) => a.label === "Discard")).toBeDefined()
    })

    // Types with no special actions: 0(All), 3(BloodAbility), 11(PsionicPower),
    // 15(Rule), 17(ThiefAbility), 18(UnarmedCombat), 21(Dungeon)
    const DISCARD_ONLY_TYPES = [0, 3, 11, 15, 17, 18, 21]
    for (const typeId of DISCARD_ONLY_TYPES) {
      it(`typeId ${typeId} → only Discard`, () => {
        const card = makeCard({ typeId, instanceId: `card-${typeId}` })
        const actions = buildHandContextActions({
        ...BASE_ARGS,
          card,
          isOpponent: false,
          legalMoves: [],
          requestSpellCast: noopSpellCast,
        })
        // Should only have Discard
        expect(actions).toHaveLength(1)
        expect(actions[0]!.label).toBe("Discard")
      })
    }
  })

  // ─── Multi-target picker actions ────────────────────────────────────────────

  describe("multi-target picker", () => {
    it("Attach to Champion opens picker when multiple champions available", () => {
      const artifact = makeCard({ typeId: 2, instanceId: "art1" })
      let pickerTitle = ""
      let pickerTargets: { label: string; move: Move }[] = []
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: artifact,
        isOpponent: false,
        legalMoves: [
          { type: "ATTACH_ITEM", cardInstanceId: "art1", championId: "c1" },
          { type: "ATTACH_ITEM", cardInstanceId: "art1", championId: "c2" },
        ],
        requestSpellCast: noopSpellCast,
        openTargetPicker: (title, targets) => { pickerTitle = title; pickerTargets = targets },
        myBoard: {
          hand: [], handCount: 0, handHidden: false, formation: {},
          pool: [
            { champion: makeCard({ instanceId: "c1", name: "Sir Roland" }), attachments: [] },
            { champion: makeCard({ instanceId: "c2", name: "Elminster" }), attachments: [] },
          ],
          drawPileCount: 0, discardCount: 0, discardPile: [], lastingEffects: [],
        },
      })
      const attach = actions.find((a) => a.label === "Attach to Champion...")
      expect(attach).toBeDefined()
      expect(attach!.action).toBeDefined()
      attach!.action!()
      expect(pickerTitle).toBe("Attach to")
      expect(pickerTargets).toHaveLength(2)
      expect(pickerTargets[0]!.label).toBe("Sir Roland")
      expect(pickerTargets[1]!.label).toBe("Elminster")
    })

    it("Attach to Champion uses direct move when single champion", () => {
      const artifact = makeCard({ typeId: 2, instanceId: "art1" })
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: artifact,
        isOpponent: false,
        legalMoves: [{ type: "ATTACH_ITEM", cardInstanceId: "art1", championId: "c1" }],
        requestSpellCast: noopSpellCast,
        openTargetPicker: () => {},
      })
      const attach = actions.find((a) => a.label === "Attach to Champion")
      expect(attach).toBeDefined()
      expect(attach!.move).toEqual({ type: "ATTACH_ITEM", cardInstanceId: "art1", championId: "c1" })
      expect(attach!.action).toBeUndefined()
    })

    it("Play Realm opens picker when multiple slots available", () => {
      const realm = makeCard({ typeId: 13, instanceId: "r1" })
      let pickerTitle = ""
      let pickerTargets: { label: string; move: Move }[] = []
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: realm,
        isOpponent: false,
        legalMoves: [
          { type: "PLAY_REALM", cardInstanceId: "r1", slot: "A" },
          { type: "PLAY_REALM", cardInstanceId: "r1", slot: "B" },
          { type: "PLAY_REALM", cardInstanceId: "r1", slot: "C" },
        ],
        requestSpellCast: noopSpellCast,
        openTargetPicker: (title, targets) => { pickerTitle = title; pickerTargets = targets },
      })
      const play = actions.find((a) => a.label === "Play Realm...")
      expect(play).toBeDefined()
      play!.action!()
      expect(pickerTitle).toBe("Play Realm in slot")
      expect(pickerTargets).toHaveLength(3)
      expect(pickerTargets[0]!.label).toBe("Slot A")
    })

    it("Play Realm uses direct move when single slot", () => {
      const realm = makeCard({ typeId: 13, instanceId: "r1" })
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: realm,
        isOpponent: false,
        legalMoves: [{ type: "PLAY_REALM", cardInstanceId: "r1", slot: "A" }],
        requestSpellCast: noopSpellCast,
        openTargetPicker: () => {},
      })
      const play = actions.find((a) => a.label === "Play Realm")
      expect(play).toBeDefined()
      expect(play!.move).toEqual({ type: "PLAY_REALM", cardInstanceId: "r1", slot: "A" })
    })

    it("Play Holding opens picker when multiple realms available", () => {
      const holding = makeCard({ typeId: 8, instanceId: "h1" })
      let pickerTargets: { label: string; move: Move }[] = []
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: holding,
        isOpponent: false,
        legalMoves: [
          { type: "PLAY_HOLDING", cardInstanceId: "h1", realmSlot: "A" },
          { type: "PLAY_HOLDING", cardInstanceId: "h1", realmSlot: "B" },
        ],
        requestSpellCast: noopSpellCast,
        openTargetPicker: (_, targets) => { pickerTargets = targets },
        myBoard: {
          hand: [], handCount: 0, handHidden: false,
          formation: {
            A: { realm: makeCard({ instanceId: "ra", name: "Waterdeep" }), holdings: [], holdingCount: 0, isRazed: false, holdingRevealedToAll: false },
            B: { realm: makeCard({ instanceId: "rb", name: "Village" }), holdings: [], holdingCount: 0, isRazed: false, holdingRevealedToAll: false },
          },
          pool: [], drawPileCount: 0, discardCount: 0, discardPile: [], lastingEffects: [],
        },
      })
      const play = actions.find((a) => a.label === "Play Holding...")
      expect(play).toBeDefined()
      play!.action!()
      expect(pickerTargets).toHaveLength(2)
      expect(pickerTargets[0]!.label).toBe("Waterdeep")
      expect(pickerTargets[1]!.label).toBe("Village")
    })
  })

  // ─── Cleric spell specifics ────────────────────────────────────────────────

  describe("cleric spell card (typeId 4)", () => {
    const clericSpell = makeCard({ typeId: 4, instanceId: "cs1", name: "Healing Word" })

    it("has Cast Spell and Play in Combat actions", () => {
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: clericSpell,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
      })
      expect(actions.find((a) => a.label === "Cast Spell")).toBeDefined()
      expect(actions.find((a) => a.label === "Play in Combat")).toBeDefined()
    })

    it("Cast Spell triggers requestSpellCast callback", () => {
      let castId = ""
      const actions = buildHandContextActions({
        ...CASTER_ARGS,
        phase: "COMBAT", // default castPhases=[] → [4] (combat)
        card: clericSpell,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: (id) => { castId = id },
      })
      actions.find((a) => a.label === "Cast Spell")!.action!()
      expect(castId).toBe("cs1")
    })
  })

  // ─── Cast Spell disabled when no caster available ──────────────────────────

  describe("Cast Spell caster gating", () => {
    const wizardSpell = makeCard({ typeId: 19, instanceId: "ws1", name: "Fireball" })
    const clericSpell = makeCard({ typeId: 4, instanceId: "cs1", name: "Healing Word" })
    const emptyBoard: PlayerBoard = {
      hand: [], handCount: 0, handHidden: false,
      formation: {}, pool: [],
      drawPileCount: 0, discardCount: 0, discardPile: [], lastingEffects: [],
    }

    it("disabled when no pool caster supports the spell (phase 3)", () => {
      // Hero has supportIds [1, 9] — no wizard spell support
      const phase3Spell = makeCard({ typeId: 19, instanceId: "ws1", name: "Fireball", castPhases: [3, 4] })
      const heroChamp = makeCard({ instanceId: "hero", typeId: 7, supportIds: [1, 9] })
      const board: PlayerBoard = {
        ...emptyBoard,
        pool: [{ champion: heroChamp, attachments: [] }],
      }
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: phase3Spell,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
        myBoard: board,
        myPlayerId: "p1",
        allBoards: { p1: board },
        phase: "POOL",
      })
      const cast = actions.find((a) => a.label === "Cast Spell")
      expect(cast).toBeDefined()
      expect(cast!.disabled).toBe(true)
    })

    it("enabled when pool champion supports wizard spells (phase 3)", () => {
      const phase3Spell = makeCard({ typeId: 19, instanceId: "ws1", name: "Fireball", castPhases: [3, 4] })
      const wizChamp = makeCard({ instanceId: "wiz", typeId: 20, supportIds: [1, 9, "d19", "o19"] })
      const board: PlayerBoard = {
        ...emptyBoard,
        pool: [{ champion: wizChamp, attachments: [] }],
      }
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: phase3Spell,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
        myBoard: board,
        myPlayerId: "p1",
        allBoards: { p1: board },
        phase: "POOL",
      })
      const cast = actions.find((a) => a.label === "Cast Spell")
      expect(cast).toBeDefined()
      expect(cast!.disabled).not.toBe(true)
    })

    it("enabled when champion has attachment that grants spell support", () => {
      const phase3Spell = makeCard({ typeId: 19, instanceId: "ws1", name: "Fireball", castPhases: [3, 4] })
      const hero = makeCard({ instanceId: "hero", typeId: 7, supportIds: [1, 9] })
      const tomeOfMagic = makeCard({ instanceId: "tome", typeId: 9, supportIds: ["d19", "o19"] })
      const board: PlayerBoard = {
        ...emptyBoard,
        pool: [{ champion: hero, attachments: [tomeOfMagic] }],
      }
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: phase3Spell,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
        myBoard: board,
        myPlayerId: "p1",
        allBoards: { p1: board },
        phase: "POOL",
      })
      const cast = actions.find((a) => a.label === "Cast Spell")
      expect(cast!.disabled).not.toBe(true)
    })

    it("disabled when pool has caster but wrong phase (START_OF_TURN)", () => {
      const wizChamp = makeCard({ instanceId: "wiz", typeId: 20, supportIds: ["d19", "o19"] })
      const board: PlayerBoard = {
        ...emptyBoard,
        pool: [{ champion: wizChamp, attachments: [] }],
      }
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: wizardSpell,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
        myBoard: board,
        myPlayerId: "p1",
        allBoards: { p1: board },
        phase: "START_OF_TURN",
      })
      const cast = actions.find((a) => a.label === "Cast Spell")
      expect(cast!.disabled).toBe(true)
    })

    it("disabled when spell only castable in combat but in pool phase", () => {
      // Default wizard spell has castPhases: [] → defaults to [4] (combat only)
      const wizChamp = makeCard({ instanceId: "wiz", typeId: 20, supportIds: ["d19", "o19"] })
      const board: PlayerBoard = {
        ...emptyBoard,
        pool: [{ champion: wizChamp, attachments: [] }],
      }
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: wizardSpell, // castPhases defaults to [4]
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
        myBoard: board,
        myPlayerId: "p1",
        allBoards: { p1: board },
        phase: "POOL",
      })
      const cast = actions.find((a) => a.label === "Cast Spell")
      expect(cast!.disabled).toBe(true)
    })

    it("disabled in combat when fighting champion cannot cast the spell", () => {
      // Fighter in combat has no wizard spell support
      const fighter = makeCard({ instanceId: "att", typeId: 7, supportIds: [1, 9] })
      const defender = makeCard({ instanceId: "def", typeId: 7, supportIds: [1] })
      const combat: CombatInfo = {
        attackingPlayer: "p1",
        defendingPlayer: "p2",
        targetSlot: "A",
        roundPhase: "CARD_PLAY",
        attacker: fighter,
        defender,
        attackerCards: [],
        defenderCards: [],
        attackerLevel: 5,
        defenderLevel: 4,
        attackerManualLevel: null,
        defenderManualLevel: null,
        championsUsedThisBattle: [],
        borrowedChampions: {},
      }
      const board: PlayerBoard = {
        ...emptyBoard,
        pool: [{ champion: fighter, attachments: [] }],
      }
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: wizardSpell,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
        combat,
        myBoard: board,
        myPlayerId: "p1",
        allBoards: { p1: board, p2: emptyBoard },
        phase: "COMBAT",
      })
      const cast = actions.find((a) => a.label === "Cast Spell")
      expect(cast!.disabled).toBe(true)
    })

    it("enabled in combat when fighting champion can cast the spell", () => {
      const wizard = makeCard({ instanceId: "att", typeId: 20, supportIds: [1, 9, "d19", "o19"] })
      const defender = makeCard({ instanceId: "def", typeId: 7, supportIds: [1] })
      const combat: CombatInfo = {
        attackingPlayer: "p1",
        defendingPlayer: "p2",
        targetSlot: "A",
        roundPhase: "CARD_PLAY",
        attacker: wizard,
        defender,
        attackerCards: [],
        defenderCards: [],
        attackerLevel: 8,
        defenderLevel: 4,
        attackerManualLevel: null,
        defenderManualLevel: null,
        championsUsedThisBattle: [],
        borrowedChampions: {},
      }
      const board: PlayerBoard = {
        ...emptyBoard,
        pool: [{ champion: wizard, attachments: [] }],
      }
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: wizardSpell,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
        combat,
        myBoard: board,
        myPlayerId: "p1",
        allBoards: { p1: board, p2: emptyBoard },
        phase: "COMBAT",
      })
      const cast = actions.find((a) => a.label === "Cast Spell")
      expect(cast!.disabled).not.toBe(true)
    })

    it("disabled when no champions in pool at all", () => {
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: wizardSpell,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
        myBoard: emptyBoard,
        myPlayerId: "p1",
        allBoards: { p1: emptyBoard },
        phase: "POOL",
      })
      const cast = actions.find((a) => a.label === "Cast Spell")
      expect(cast!.disabled).toBe(true)
    })

    it("cleric spell disabled when only wizard casters in pool", () => {
      const wizChamp = makeCard({ instanceId: "wiz", typeId: 20, supportIds: ["d19", "o19"] })
      const board: PlayerBoard = {
        ...emptyBoard,
        pool: [{ champion: wizChamp, attachments: [] }],
      }
      const actions = buildHandContextActions({
        ...BASE_ARGS,
        card: clericSpell,
        isOpponent: false,
        legalMoves: [],
        requestSpellCast: noopSpellCast,
        myBoard: board,
        myPlayerId: "p1",
        allBoards: { p1: board },
        phase: "POOL",
      })
      const cast = actions.find((a) => a.label === "Cast Spell")
      expect(cast!.disabled).toBe(true)
    })

  })
})
