import type { FormationSlot } from "@spell/engine"

// ─── Scenario definition types ────────────────────────────────────────────────

export interface CardRef {
  setId: string
  cardNumber: number
}

export interface PoolEntryDef {
  card: CardRef
  attachments?: CardRef[]
}

export interface RealmSlotDef {
  realm: CardRef
  holdings?: CardRef[]
}

export interface PlayerDef {
  hand?: CardRef[]
  pool?: PoolEntryDef[]
  formation?: Partial<Record<FormationSlot, RealmSlotDef>>
}

export interface CombatDef {
  /** Which player is attacking. The other is the defender. */
  attackingPlayer: "p1" | "p2"
  /** Formation slot of the defending player being attacked. */
  targetSlot: FormationSlot
  /** Combat sub-phase to start in. CARD_PLAY is the most useful for testing spell access. */
  roundPhase: "CARD_PLAY" | "AWAITING_ATTACKER" | "AWAITING_DEFENDER"
}

export interface ScenarioDef {
  /** Short display name shown in the dev UI. */
  name: string
  /** What rule or interaction this scenario is designed to explore. */
  description: string
  p1: PlayerDef
  p2: PlayerDef
  /** If provided, the game starts in an active combat at the given phase. */
  combat?: CombatDef
}

// ─── Scenario registry ────────────────────────────────────────────────────────
// Add new scenarios here. Each key becomes the URL slug for loading it.
//
// Card references use real setId + cardNumber from packages/data/cards/.
// Look up IDs with: grep -r '"CardName"' packages/data/cards/ | head -1

export const DEV_SCENARIOS: Record<string, ScenarioDef> = {
  // ── Realm grants wizard spells ───────────────────────────────────────────
  // The Lands of Iuz (1st #112, typeId 13) has supportIds ["d19","o19"],
  // granting any champion defending it the ability to cast wizard spells.
  // Alias the Sell-Sword (1st #41, level 6, Hero) has no wizard support.
  // The Pereghost (1st #48, level 7, Monster) attacks — defender is losing.
  // Horrors of the Abyss (1st #96, typeId 19, Off/4) is the spell to cast.
  "iuz-realm-wizard-spell": {
    name: "The Lands of Iuz — non-caster casts wizard spell",
    description:
      "Alias (Hero, no spell support, lv 6) defends Iuz realm against Pereghost (lv 7). " +
      "The realm grants wizard spell access — can Alias cast Horrors of the Abyss?",
    p1: {
      pool: [{ card: { setId: "1st", cardNumber: 48 } }], // The Pereghost, lv 7
    },
    p2: {
      formation: {
        A: { realm: { setId: "1st", cardNumber: 112 } }, // The Lands of Iuz
      },
      pool: [{ card: { setId: "1st", cardNumber: 41 } }], // Alias the Sell-Sword, lv 6
      hand: [{ setId: "1st", cardNumber: 96 }], // Horrors of the Abyss (Off/4)
    },
    combat: {
      attackingPlayer: "p1",
      targetSlot: "A",
      roundPhase: "CARD_PLAY",
    },
  },

  // ── Holding grants cleric spells ─────────────────────────────────────────
  // Arms of Iuz (1st #143, typeId 8 Holding) has supportIds ["d4","o4"],
  // granting the defender of the attached realm the ability to cast cleric spells.
  // Cormyr (1st #5, generic realm, no spell grants) hosts the holding.
  // Cure Light Wounds (1st #349, typeId 4, Def/4) is the spell to cast.
  "arms-of-iuz-holding-cleric-spell": {
    name: "Arms of Iuz holding — non-caster casts cleric spell",
    description:
      "Alias (Hero, no spell support, lv 6) defends Cormyr + Arms of Iuz holding against Pereghost (lv 7). " +
      "The holding grants cleric access — can Alias cast Cure Light Wounds?",
    p1: {
      pool: [{ card: { setId: "1st", cardNumber: 48 } }], // The Pereghost, lv 7
    },
    p2: {
      formation: {
        A: {
          realm: { setId: "1st", cardNumber: 5 }, // Cormyr (generic realm)
          holdings: [{ setId: "1st", cardNumber: 143 }], // Arms of Iuz
        },
      },
      pool: [{ card: { setId: "1st", cardNumber: 41 } }], // Alias the Sell-Sword, lv 6
      hand: [{ setId: "1st", cardNumber: 349 }], // Cure Light Wounds (Def/4)
    },
    combat: {
      attackingPlayer: "p1",
      targetSlot: "A",
      roundPhase: "CARD_PLAY",
    },
  },
}
