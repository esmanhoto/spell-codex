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
  isRazed?: boolean
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
  /** Override the starting phase (default: Pool, or Combat if combat is set). */
  phase?: "START_OF_TURN" | "DRAW" | "PLAY_REALM" | "POOL" | "COMBAT" | "PHASE_FIVE" | "END_TURN"
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
      formation: {
        A: { realm: { setId: "1st", cardNumber: 112 } }, // The Lands of Iuz
      },
      pool: [{ card: { setId: "1st", cardNumber: 41 } }], // Alias the Sell-Sword, lv 6
      hand: [{ setId: "1st", cardNumber: 96 }], // Horrors of the Abyss (Off/4)
    },
    p2: {
      pool: [{ card: { setId: "1st", cardNumber: 48 } }], // The Pereghost, lv 7
    },
    combat: {
      attackingPlayer: "p2",
      targetSlot: "A",
      roundPhase: "CARD_PLAY",
    },
  },

  // ── Realm self-defense (Jungles of Chult) ────────────────────────────────
  // Jungles of Chult (1st #15, Realm, worldId=1, level=5) can defend itself.
  // King Azoun IV (1st #42, FR Hero, level=7) is the attacker — same world as
  // Chult, so he gets +3 world bonus (adjusted level 10). The realm does NOT
  // get a world bonus for defending itself (adjusted level stays 5).
  // Start at AWAITING_DEFENDER so p2 can choose to self-defend via right-click,
  // then verify the levels: King Azoun IV adjusted 10 (7+3 world bonus) vs Chult 5 (no bonus).
  "chult-self-defense": {
    name: "Jungles of Chult — realm self-defense full flow",
    description:
      "King Azoun IV (FR, lv 7 → 10) attacks Chult. " +
      "Round 1: right-click Chult to self-defend (lv 5, loses). " +
      "Round 2: p2 sends Elminster (lv 9 → 12), p1 defends with Alias (lv 6, loses). " +
      "Round 3: p1 has nothing left → Accept Defeat → realm razed.",
    p1: {
      formation: {
        A: { realm: { setId: "1st", cardNumber: 15 } }, // Jungles of Chult, lv 5
      },
      pool: [{ card: { setId: "1st", cardNumber: 41 } }], // Alias the Sell-Sword, lv 6
    },
    p2: {
      pool: [
        { card: { setId: "1st", cardNumber: 42 } }, // King Azoun IV, FR lv 7 (round 1)
        { card: { setId: "1st", cardNumber: 44 } }, // Elminster the Mage, FR lv 9 (round 2)
      ],
    },
    combat: {
      attackingPlayer: "p2",
      targetSlot: "A",
      roundPhase: "AWAITING_DEFENDER",
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
      formation: {
        A: {
          realm: { setId: "1st", cardNumber: 5 }, // Cormyr (generic realm)
          holdings: [{ setId: "1st", cardNumber: 143 }], // Arms of Iuz
        },
      },
      pool: [{ card: { setId: "1st", cardNumber: 41 } }], // Alias the Sell-Sword, lv 6
      hand: [{ setId: "1st", cardNumber: 349 }], // Cure Light Wounds (Def/4)
    },
    p2: {
      pool: [{ card: { setId: "1st", cardNumber: 48 } }], // The Pereghost, lv 7
    },
    combat: {
      attackingPlayer: "p2",
      targetSlot: "A",
      roundPhase: "CARD_PLAY",
    },
  },

  // ── Rebuild realm — discard 3 cards ──────────────────────────────────────
  // p1 has a razed realm in slot A and 4 cards in hand.
  // Right-click the razed realm → "Rebuild Realm (discard 3)" → pick 3 cards → confirm.
  "rebuild-realm-discard": {
    name: "Rebuild realm — discard 3 cards",
    description:
      "p1 has a razed Waterdeep in slot A and 4 cards in hand. " +
      "Right-click the razed realm, choose Rebuild Realm, select 3 cards to discard, confirm.",
    phase: "PLAY_REALM",
    p1: {
      formation: {
        A: { realm: { setId: "1st", cardNumber: 1 }, isRazed: true }, // Waterdeep (razed)
        B: { realm: { setId: "1st", cardNumber: 2 } }, // Menzoberranzan
      },
      hand: [
        { setId: "1st", cardNumber: 41 }, // Alias the Sell-Sword
        { setId: "1st", cardNumber: 48 }, // The Pereghost
        { setId: "1st", cardNumber: 42 }, // King Azoun IV
        { setId: "1st", cardNumber: 44 }, // Elminster the Mage
      ],
    },
    p2: {
      formation: {
        A: { realm: { setId: "1st", cardNumber: 5 } }, // Cormyr
      },
    },
  },

  // ── Rebuild realm — Safe Harbor! event ──────────────────────────────────
  // p1 has Safe Harbor! in hand and both players have a razed realm.
  // Play the event → resolution opens → use RESOLVE_REBUILD_REALM on any razed realm.
  "rebuild-realm-event": {
    name: "Rebuild realm — Safe Harbor! event",
    description:
      "p1 plays Safe Harbor! (every player can rebuild one razed realm). " +
      "Both players have a razed realm. Use the resolution panel to rebuild them.",
    p1: {
      formation: {
        A: { realm: { setId: "1st", cardNumber: 1 }, isRazed: true }, // Waterdeep (razed)
        B: { realm: { setId: "1st", cardNumber: 2 } }, // Menzoberranzan
      },
      pool: [{ card: { setId: "1st", cardNumber: 41 } }], // Alias (needed for Pool phase)
      hand: [{ setId: "1st", cardNumber: 107 }], // Safe Harbor!
    },
    p2: {
      formation: {
        A: { realm: { setId: "1st", cardNumber: 111 }, isRazed: true }, // Free City of Greyhawk (razed)
        B: { realm: { setId: "1st", cardNumber: 5 } }, // Cormyr
      },
    },
  },

  // ── Rebuild realm — Arms of the Shield Lands holding ───────────────────
  // p1 has Arms of the Shield Lands in hand and a razed Greyhawk realm.
  // Play the holding on the razed realm → it attaches AND rebuilds the realm.
  "rebuild-realm-holding": {
    name: "Rebuild realm — Arms of the Shield Lands",
    description:
      "p1 has Arms of the Shield Lands (rebuilds_razed_realm holding, GH worldId=2) " +
      "and a razed Free City of Greyhawk. Play the holding on the razed realm to rebuild it.",
    phase: "PLAY_REALM",
    p1: {
      formation: {
        A: { realm: { setId: "1st", cardNumber: 111 }, isRazed: true }, // Free City of Greyhawk (razed)
        B: { realm: { setId: "1st", cardNumber: 2 } }, // Menzoberranzan
      },
      hand: [{ setId: "1st", cardNumber: 216 }], // Arms of the Shield Lands
    },
    p2: {
      formation: {
        A: { realm: { setId: "1st", cardNumber: 5 } }, // Cormyr
      },
    },
  },
}
