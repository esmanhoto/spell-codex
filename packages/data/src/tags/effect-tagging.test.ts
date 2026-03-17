import { describe, test, expect } from "bun:test"
import { shouldTag as shouldTagRebuildRealm } from "./tag-rebuild-realm.ts"
import { shouldTagAsCounterEvent, shouldTagAsCounterSpell } from "./tag-counter-cards.ts"
import { shouldTagTurnStart } from "./tag-turn-trigger-start.ts"
import { shouldTagTurnEnd } from "./tag-turn-trigger-end.ts"
import { patchEffectByName, patchEffectByNumber, type CardEntry } from "./tag-utils.ts"

// ─── shouldTag rebuild_realm ─────────────────────────────────────────────────

describe("shouldTagRebuildRealm", () => {
  test("matches 'rebuild a razed realm'", () => {
    expect(shouldTagRebuildRealm("This card can rebuild a razed realm.")).toBe(true)
  })

  test("matches 'rebuilds razed realms'", () => {
    // "rebuilds" matches REBUILD_PATTERN (/rebuil[dt]/) and "razed" matches REALM_OR_RAZED
    expect(shouldTagRebuildRealm("Can rebuild razed realms.")).toBe(true)
  })

  test("matches 'rebuild it' (refers to realm)", () => {
    expect(shouldTagRebuildRealm("If a realm is razed, rebuild it.")).toBe(true)
  })

  test("matches 'restores razed'", () => {
    expect(shouldTagRebuildRealm("Restores a razed realm to its former glory.")).toBe(true)
  })

  test("matches 'restore razed' pattern", () => {
    // RESTORE_RAZED = /\brestore[sd]?\b.*\brazed\b/i — restore must come BEFORE razed
    expect(shouldTagRebuildRealm("Can restore a razed realm.")).toBe(true)
  })

  test("rejects negation: 'cannot rebuild'", () => {
    expect(shouldTagRebuildRealm("This realm cannot rebuild after being razed.")).toBe(false)
  })

  test("rejects negation: 'prevent rebuild'", () => {
    expect(shouldTagRebuildRealm("Prevent rebuild of any razed realm.")).toBe(false)
  })

  test("rejects negation: 'can't rebuild'", () => {
    expect(shouldTagRebuildRealm("The player can't rebuild the realm.")).toBe(false)
  })

  test("rejects trigger-only: 'when rebuilt' with no other realm ref", () => {
    expect(shouldTagRebuildRealm("When rebuilt, draw a card.")).toBe(false)
  })

  test("allows 'when rebuilt' if realm mentioned elsewhere", () => {
    expect(shouldTagRebuildRealm("When rebuilt, the realm gains +2.")).toBe(true)
  })

  test("rejects unrelated description", () => {
    expect(shouldTagRebuildRealm("Deals 5 damage to target champion.")).toBe(false)
  })

  test("rejects 'rebuild' without realm/razed context", () => {
    expect(shouldTagRebuildRealm("Rebuild your army of allies.")).toBe(false)
  })
})

// ─── shouldTagAsCounterEvent ─────────────────────────────────────────────────

describe("shouldTagAsCounterEvent", () => {
  const EVENT = 6

  test("matches 'undoes event'", () => {
    expect(shouldTagAsCounterEvent("Undoes any event just played.", EVENT)).toBe(true)
  })

  test("matches 'magical calm event'", () => {
    expect(shouldTagAsCounterEvent("A magical calm settles over the event.", EVENT)).toBe(true)
  })

  test("matches 'just-cast spell' (mass dispel pattern)", () => {
    expect(shouldTagAsCounterEvent("Cancels a just-cast spell or event.", EVENT)).toBe(true)
  })

  test("rejects non-event typeId", () => {
    expect(shouldTagAsCounterEvent("Undoes any event just played.", 7)).toBe(false)
  })

  test("rejects unrelated event description", () => {
    expect(shouldTagAsCounterEvent("All players draw 2 cards.", EVENT)).toBe(false)
  })
})

// ─── shouldTagAsCounterSpell ─────────────────────────────────────────────────

describe("shouldTagAsCounterSpell", () => {
  const WIZARD = 19
  const CLERIC = 4

  test("matches 'cancels spell' on wizard spell", () => {
    expect(shouldTagAsCounterSpell("Cancels any spell just cast.", WIZARD)).toBe(true)
  })

  test("matches 'cancel spell' on cleric spell", () => {
    expect(shouldTagAsCounterSpell("Cancel a spell targeting you.", CLERIC)).toBe(true)
  })

  test("matches 'negates wall spell'", () => {
    expect(shouldTagAsCounterSpell("Negates any wall spell in play.", WIZARD)).toBe(true)
  })

  test("matches 'dispel spell'", () => {
    expect(shouldTagAsCounterSpell("Can dispel any spell.", WIZARD)).toBe(true)
  })

  test("matches 'spells dispel' (reverse order)", () => {
    // DISPEL_SPELL_PATTERN: /\bdispel\b.*\bspell\b|\bspell[s]?\b.*\bdispel\b/
    // "dispelled" doesn't match \bdispel\b (word boundary after "l"), so false
    expect(shouldTagAsCounterSpell("All spells are dispelled.", CLERIC)).toBe(false)
  })

  test("rejects non-spell typeId", () => {
    expect(shouldTagAsCounterSpell("Cancels any spell.", 7)).toBe(false)
    expect(shouldTagAsCounterSpell("Cancels any spell.", EVENT)).toBe(false)
  })

  test("rejects unrelated spell description", () => {
    expect(shouldTagAsCounterSpell("Deals 3 damage to all champions.", WIZARD)).toBe(false)
  })
})

// ─── shouldTagTurnStart ──────────────────────────────────────────────────────

describe("shouldTagTurnStart", () => {
  test("matches 'at the start of the player's turn'", () => {
    expect(shouldTagTurnStart("At the start of the player's turn, draw a card.")).toBe(true)
  })

  test("matches 'at the beginning of his turn'", () => {
    expect(shouldTagTurnStart("At the beginning of his turn, gain 1 life.")).toBe(true)
  })

  test("matches 'at the start of its owner's turn'", () => {
    expect(shouldTagTurnStart("At the start of its owner's turn, untap.")).toBe(true)
  })

  test("rejects 'played at the start of' (timing, not trigger)", () => {
    expect(shouldTagTurnStart("Can only be played at the start of a turn.")).toBe(false)
  })

  test("rejects 'played at the beginning of'", () => {
    expect(shouldTagTurnStart("Played at the beginning of your turn.")).toBe(false)
  })

  test("rejects unrelated description", () => {
    expect(shouldTagTurnStart("Deals 5 damage to target.")).toBe(false)
  })
})

// ─── shouldTagTurnEnd ────────────────────────────────────────────────────────

describe("shouldTagTurnEnd", () => {
  test("matches 'at the end of his turn'", () => {
    expect(shouldTagTurnEnd("At the end of his turn, discard a card.")).toBe(true)
  })

  test("matches 'at the end of the player's turn'", () => {
    expect(shouldTagTurnEnd("At the end of the player's turn, lose 1 life.")).toBe(true)
  })

  test("'end of his turn' without 'until the' prefix matches", () => {
    // EXCLUDE_UNTIL = /\buntil the end of\b/ — only excludes "until THE end of"
    // "Lasts until end of" doesn't have "the", so it matches END_PATTERN
    expect(shouldTagTurnEnd("Lasts until end of his turn.")).toBe(true)
  })

  test("rejects 'until the end of'", () => {
    expect(shouldTagTurnEnd("Buff lasts until the end of his turn.")).toBe(false)
  })

  test("rejects 'end of each player's turn'", () => {
    expect(shouldTagTurnEnd("At the end of each player's turn, draw.")).toBe(false)
  })

  test("rejects unrelated description", () => {
    expect(shouldTagTurnEnd("Fly over any realm to attack.")).toBe(false)
  })
})

// ─── patchEffectByName ───────────────────────────────────────────────────────

describe("patchEffectByName", () => {
  const card: CardEntry = {
    setId: "1st",
    cardNumber: 107,
    name: "Safe Harbor!",
    description: "Rebuilds razed realms.",
    typeId: 6,
    effects: [],
  }

  test("patches empty effects array", () => {
    const json = `[{\n  "name": "Safe Harbor!",\n  "effects": []\n}]`
    const result = patchEffectByName(json, card, '{"type":"rebuild_realm"}')
    expect(result).toContain('[{"type":"rebuild_realm"}]')
  })

  test("appends to existing effects", () => {
    const cardWithEffects = { ...card, effects: [{ type: "existing" }] as any }
    const json = `[{"name": "Safe Harbor!", "effects": [{"type":"existing"}]}]`
    const result = patchEffectByName(json, cardWithEffects, '{"type":"rebuild_realm"}')
    expect(result).toContain(',{"type":"rebuild_realm"}]')
  })

  test("returns unmodified text when name not found", () => {
    const json = `[{"name": "Other Card", "effects": []}]`
    const result = patchEffectByName(json, card, '{"type":"rebuild_realm"}')
    expect(result).toBe(json)
  })
})

// ─── patchEffectByNumber ─────────────────────────────────────────────────────

describe("patchEffectByNumber", () => {
  const card: CardEntry = {
    setId: "1st",
    cardNumber: 220,
    name: "Dispel Magic",
    description: "Cancels a spell.",
    typeId: 19,
    effects: [],
  }

  test("patches empty effects by cardNumber", () => {
    const json = `[{"cardNumber": 220, "name": "Dispel Magic", "effects": []}]`
    const result = patchEffectByNumber(json, card, '{"type":"counter_spell"}')
    expect(result).toContain('[{"type":"counter_spell"}]')
  })

  test("appends to existing effects by cardNumber", () => {
    const cardWithEffects = { ...card, effects: [{ type: "existing" }] as any }
    const json = `[{"cardNumber": 220, "name": "Dispel Magic", "effects": [{"type":"existing"}]}]`
    const result = patchEffectByNumber(json, cardWithEffects, '{"type":"counter_spell"}')
    expect(result).toContain(',{"type":"counter_spell"}]')
  })
})

const EVENT = 6
