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
  drawPile?: CardRef[]
  discardPile?: CardRef[]
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

  // ── Resolution: Airship destroys allies (in combat) ─────────────────────
  // p2 attacks p1's Cormyr with King Azoun IV (lv 7) + War Band ally.
  // p1 defends with Alias (lv 6) + War Party ally.
  // p1 is losing → can play Airship event during CARD_PLAY.
  // Airship opens resolution → select "Discard/Remove an Ally" → check allies → Apply.
  "resolution-destroy-allies": {
    name: "Resolution — Airship destroys allies (combat)",
    description:
      "Combat: King Azoun IV (lv 7) + Armies of Bloodstone + Iron Legion attacks Cormyr. " +
      "Alias (lv 6) + War Party defends. p1 is losing and has Airship in hand. " +
      "Play Airship → resolution → check allies to destroy → Apply Effect.",
    p1: {
      formation: {
        A: { realm: { setId: "1st", cardNumber: 5 } }, // Cormyr
      },
      pool: [
        {
          card: { setId: "1st", cardNumber: 41 }, // Alias the Sell-Sword, lv 6
          attachments: [
            { setId: "1st", cardNumber: 54 }, // War Party (ally, +4)
          ],
        },
      ],
      hand: [{ setId: "1st", cardNumber: 90 }], // Airship (event)
    },
    p2: {
      formation: {
        A: { realm: { setId: "1st", cardNumber: 1 } }, // Waterdeep
      },
      pool: [
        {
          card: { setId: "1st", cardNumber: 42 }, // King Azoun IV, lv 7
          attachments: [
            { setId: "1st", cardNumber: 58 }, // Armies of Bloodstone (ally, +4)
            { setId: "1st", cardNumber: 59 }, // The Iron Legion (ally, +3)
          ],
        },
      ],
    },
    combat: {
      attackingPlayer: "p2",
      targetSlot: "A",
      roundPhase: "CARD_PLAY",
    },
  },

  // ── Combat bonuses — all card types ─────────────────────────────────────
  // p2 attacks with a stacked champion (Fejyelsae lv 10 + multiple allies ≈ 30).
  // p1 defends with The Harpers (lv 6, supports everything) and a big hand:
  // magical items (Off + Def), allies, wizard/cleric spells (Off + Def), artifact.
  // Verifies that spells, items, and artifacts all contribute via parseLevel.
  "combat-bonus-all-types": {
    name: "Combat bonuses — spells, items, artifacts",
    description:
      "Fejyelsae (lv 10) + 4 allies (≈30 adjusted) attacks Waterdeep. " +
      "The Harpers (lv 6, supports all) defends. Hand has Off/Def items, spells, allies, artifact. " +
      "Play cards and verify each type's bonus adds to combat level.",
    p1: {
      formation: {
        A: { realm: { setId: "1st", cardNumber: 1 } }, // Waterdeep
      },
      pool: [{ card: { setId: "1st", cardNumber: 51 } }], // The Harpers, lv 6
      hand: [
        // Magical items
        { setId: "1st", cardNumber: 94 }, // Dwarven Hammer (+3, Off)
        { setId: "1st", cardNumber: 197 }, // Magical Barding (+2, Def)
        { setId: "1st", cardNumber: 105 }, // Staff of Conjuring (+5, Off)
        { setId: "1st", cardNumber: 313 }, // Shield of Destruction (+1, Def)
        // Allies
        { setId: "1st", cardNumber: 54 }, // War Party (+4)
        { setId: "1st", cardNumber: 154 }, // Hordes of Castle Greyhawk (+5)
        // Wizard spells
        { setId: "1st", cardNumber: 96 }, // Horrors of the Abyss (+5, Off)
        { setId: "1st", cardNumber: 342 }, // Shield (+2, Def)
        // Cleric spells
        { setId: "1st", cardNumber: 351 }, // Sticks to Snakes (+4, Off)
        { setId: "1st", cardNumber: 349 }, // Cure Light Wounds (+1, Def)
        // Artifact
        { setId: "1st", cardNumber: 156 }, // Eye and Hand of Vecna (+5/+2)
      ],
    },
    p2: {
      formation: {
        A: { realm: { setId: "1st", cardNumber: 5 } }, // Cormyr
      },
      pool: [
        {
          card: { setId: "1st", cardNumber: 447 }, // Fejyelsae, lv 10
          attachments: [
            { setId: "1st", cardNumber: 58 }, // Armies of Bloodstone (+4)
            { setId: "1st", cardNumber: 59 }, // The Iron Legion (+3)
            { setId: "1st", cardNumber: 61 }, // Myrmidons (+4)
            { setId: "1st", cardNumber: 154 }, // Hordes of Castle Greyhawk (+5)
          ],
        },
      ],
    },
    combat: {
      attackingPlayer: "p2",
      targetSlot: "A",
      roundPhase: "CARD_PLAY",
    },
  },

  // ── Resolution: Fast Talking! discards items + holdings visible ────────
  // p1 has Fast Talking! (#210, Event). Both players have items on champions
  // and holdings on realms. Play event → resolution → discard items via
  // "Discard/Remove Magical Item" and holdings via "Discard/Remove a Holding".
  "resolution-discard-items-holdings": {
    name: "Resolution — Fast Talking! + items & holdings",
    description:
      "p1 plays Fast Talking! (discard all magical items and artifacts). " +
      "Both players have items on champions and holdings on realms. " +
      "Verify all action categories in the dropdown: items, holdings, realms, champions.",
    p1: {
      formation: {
        A: {
          realm: { setId: "1st", cardNumber: 1 }, // Waterdeep
          holdings: [{ setId: "1st", cardNumber: 143 }], // Arms of Iuz (holding)
        },
        B: { realm: { setId: "1st", cardNumber: 2 } }, // Menzoberranzan
      },
      pool: [
        {
          card: { setId: "1st", cardNumber: 44 }, // Elminster the Mage
          attachments: [
            { setId: "1st", cardNumber: 93 }, // Rod of Shapechange (artifact)
          ],
        },
      ],
      hand: [{ setId: "1st", cardNumber: 210 }], // Fast Talking! (event)
    },
    p2: {
      formation: {
        A: {
          realm: { setId: "1st", cardNumber: 5 }, // Cormyr
          holdings: [{ setId: "1st", cardNumber: 144 }], // Arms of Furyondy (holding)
        },
      },
      pool: [
        {
          card: { setId: "1st", cardNumber: 42 }, // King Azoun IV
          attachments: [
            { setId: "1st", cardNumber: 94 }, // Dwarven Hammer (magical item)
          ],
        },
      ],
    },
  },

  // ── Attacker from hand ────────────────────────────────────────────────────
  // p1 has no pool champions — their only champion is Alias in hand.
  // p2 has Cormyr in slot A (exposed). p1 must attack from hand.
  // Right-click Alias in hand → "Attack with" → pick target realm → combat starts.
  // Alias should appear in pool after attacking. p2 has no champion → decline → realm razed.
  "attacker-from-hand": {
    name: "Attack with champion from hand",
    description:
      "p1 has no pool. Alias (lv 6) is in hand. p2 has Cormyr (slot A, undefended). " +
      "Right-click Alias in hand to attack with it. Alias moves to pool, combat starts. " +
      "p2 declines → Cormyr is razed. p1 earns spoils.",
    p1: {
      formation: {
        A: { realm: { setId: "1st", cardNumber: 1 } }, // Waterdeep
      },
      pool: [],
      hand: [{ setId: "1st", cardNumber: 41 }], // Alias the Sell-Sword, lv 6
    },
    p2: {
      formation: {
        A: { realm: { setId: "1st", cardNumber: 5 } }, // Cormyr
      },
      pool: [],
    },
  },

  // ── Defender from hand ────────────────────────────────────────────────────
  // p1 is attacked on Cormyr by King Azoun IV (lv 7, same world → lv 10).
  // p1 has no pool champion — only Alias (lv 6, no world bonus → lv 6) in hand.
  // Right-click Alias in hand → "Defend with" → Alias moves to pool, fights King Azoun.
  // p1 is losing (6 < 10) → play a card or stop playing.
  "defender-from-hand": {
    name: "Defend with champion from hand",
    description:
      "King Azoun IV (FR, lv 7 → 10 with world bonus) attacks p1's Cormyr. " +
      "p1 has no pool champion. Alias (lv 6) is in hand. " +
      "Right-click Alias in hand to defend with it. Alias moves to pool and enters combat.",
    p1: {
      formation: {
        A: { realm: { setId: "1st", cardNumber: 5 } }, // Cormyr
      },
      pool: [],
      hand: [{ setId: "1st", cardNumber: 41 }], // Alias the Sell-Sword, lv 6
    },
    p2: {
      pool: [{ card: { setId: "1st", cardNumber: 42 } }], // King Azoun IV, FR lv 7
    },
    combat: {
      attackingPlayer: "p2",
      targetSlot: "A",
      roundPhase: "AWAITING_DEFENDER",
    },
  },

  // ── Turn trigger: Marco Volo (start of turn — peek draw pile top 1) ─────
  // Marco Volo (#50, Monster Hero, lv 3) fires at the start of the player's turn.
  // Text: "look at the top card of any draw pile and discard it if he wants."
  // Scenario starts at START_OF_TURN so the trigger panel appears immediately.
  // Use PEEK DRAW PILE ×1, then optionally discard or just DONE.
  "trigger-start-marco-volo": {
    name: "Turn trigger — Marco Volo (start, peek draw pile)",
    description:
      "Marco Volo (lv 3, Monster Hero) fires at start of p1's turn. " +
      "Peek the top card of any draw pile (×1). Discard it or leave it, then Done.",
    phase: "START_OF_TURN",
    p1: {
      formation: { A: { realm: { setId: "1st", cardNumber: 1 } } }, // Waterdeep
      pool: [{ card: { setId: "1st", cardNumber: 50 } }], // Marco Volo, lv 3
    },
    p2: {
      formation: { A: { realm: { setId: "1st", cardNumber: 5 } } }, // Cormyr
      pool: [{ card: { setId: "1st", cardNumber: 42 } }], // King Azoun IV
      hand: [
        { setId: "1st", cardNumber: 44 }, // Elminster
        { setId: "1st", cardNumber: 96 }, // Horrors of the Abyss
      ],
      drawPile: [
        { setId: "1st", cardNumber: 51 }, // The Harpers (top)
        { setId: "1st", cardNumber: 48 }, // The Pereghost
        { setId: "1st", cardNumber: 54 }, // War Party
      ],
    },
  },

  // ── Turn trigger: Ren's Crystal Ball (start — peek top 3, discard 1) ────
  // Ren's Crystal Ball (#199, Artifact) on a champion fires at start of turn.
  // Text: "inspect the top three cards of any deck and discard one."
  // Use PEEK DRAW PILE ×3, then pick one to discard from the peek view, then Done.
  "trigger-start-rens-crystal-ball": {
    name: "Turn trigger — Ren's Crystal Ball (start, peek ×3 + discard 1)",
    description:
      "Ren's Crystal Ball (Artifact) attached to Elminster fires at start of p1's turn. " +
      "Peek top 3 cards of any draw pile, discard one, then Done.",
    phase: "START_OF_TURN",
    p1: {
      formation: { A: { realm: { setId: "1st", cardNumber: 1 } } }, // Waterdeep
      pool: [
        {
          card: { setId: "1st", cardNumber: 44 }, // Elminster the Mage, lv 9
          attachments: [{ setId: "1st", cardNumber: 199 }], // Ren's Crystal Ball
        },
      ],
    },
    p2: {
      formation: { A: { realm: { setId: "1st", cardNumber: 5 } } }, // Cormyr
      pool: [{ card: { setId: "1st", cardNumber: 42 } }], // King Azoun IV
      hand: [
        { setId: "1st", cardNumber: 96 }, // Horrors of the Abyss
        { setId: "1st", cardNumber: 349 }, // Cure Light Wounds
      ],
      drawPile: [
        { setId: "1st", cardNumber: 58 }, // Armies of Bloodstone (top)
        { setId: "1st", cardNumber: 59 }, // The Iron Legion
        { setId: "1st", cardNumber: 61 }, // Myrmidons
        { setId: "1st", cardNumber: 54 }, // War Party
      ],
    },
  },

  // ── Turn trigger: Ring of All Seeing (start — peek opponent's hand) ──────
  // Ring of All Seeing (#311, Magical Item, Def) fires at start of turn.
  // Text: "look at one player's hand."
  // Use PEEK HAND on opponent, then Done.
  "trigger-start-ring-of-all-seeing": {
    name: "Turn trigger — Ring of All Seeing (start, peek hand)",
    description:
      "Ring of All Seeing (Magical Item) on Alias fires at start of p1's turn. " +
      "Select 'Peek Opponent's Hand' to reveal all cards in opponent's hand, then Done.",
    phase: "START_OF_TURN",
    p1: {
      formation: { A: { realm: { setId: "1st", cardNumber: 1 } } }, // Waterdeep
      pool: [
        {
          card: { setId: "1st", cardNumber: 41 }, // Alias the Sell-Sword, lv 6
          attachments: [{ setId: "1st", cardNumber: 311 }], // Ring of All Seeing
        },
      ],
    },
    p2: {
      formation: { A: { realm: { setId: "1st", cardNumber: 5 } } }, // Cormyr
      pool: [{ card: { setId: "1st", cardNumber: 42 } }], // King Azoun IV
      hand: [
        { setId: "1st", cardNumber: 44 }, // Elminster
        { setId: "1st", cardNumber: 51 }, // The Harpers
        { setId: "1st", cardNumber: 96 }, // Horrors of the Abyss
        { setId: "1st", cardNumber: 156 }, // Eye and Hand of Vecna
      ],
      drawPile: [
        { setId: "1st", cardNumber: 58 }, // Armies of Bloodstone
        { setId: "1st", cardNumber: 349 }, // Cure Light Wounds
      ],
    },
  },

  // ── Turn trigger: Hettman Tsurin (end of turn — discard from hand) ───────
  // Hettman Tsurin (#172, Monster Hero, lv 2) fires at end of turn IF he didn't attack.
  // Text: "randomly draw one card from another player's hand and discard it."
  // Start at PHASE_FIVE. p1 PASSes → end trigger fires → use DISCARD FROM OPPONENT HAND.
  "trigger-end-hettman-tsurin": {
    name: "Turn trigger — Hettman Tsurin (end, discard from opponent hand)",
    description:
      "Hettman Tsurin (lv 2, Monster Hero) fires at end of p1's turn if he did not attack. " +
      "Start at Phase Five, PASS → end trigger fires → use 'Discard from Opponent's Hand'. Done.",
    phase: "PHASE_FIVE",
    p1: {
      formation: { A: { realm: { setId: "1st", cardNumber: 1 } } }, // Waterdeep
      pool: [{ card: { setId: "1st", cardNumber: 172 } }], // Hettman Tsurin, lv 2
    },
    p2: {
      formation: { A: { realm: { setId: "1st", cardNumber: 5 } } }, // Cormyr
      pool: [{ card: { setId: "1st", cardNumber: 42 } }], // King Azoun IV
      hand: [
        { setId: "1st", cardNumber: 44 }, // Elminster
        { setId: "1st", cardNumber: 51 }, // The Harpers
        { setId: "1st", cardNumber: 96 }, // Horrors of the Abyss
        { setId: "1st", cardNumber: 349 }, // Cure Light Wounds
      ],
      drawPile: [
        { setId: "1st", cardNumber: 58 }, // Armies of Bloodstone
        { setId: "1st", cardNumber: 54 }, // War Party
      ],
    },
  },

  // ── Turn trigger: multiple triggers fire simultaneously ──────────────────
  // Marco Volo + Ring of All Seeing both fire at start of p1's turn.
  // Two triggers are queued; resolve each in order with Done between them.
  "trigger-start-multi": {
    name: "Turn trigger — multiple at once (Marco Volo + Ring of All Seeing)",
    description:
      "Alias has Ring of All Seeing; Marco Volo is also in pool. " +
      "Both fire at start of turn — two triggers queued. " +
      "Resolve each: peek hand for Ring, peek draw pile ×1 for Marco. Done after each.",
    phase: "START_OF_TURN",
    p1: {
      formation: { A: { realm: { setId: "1st", cardNumber: 1 } } }, // Waterdeep
      pool: [
        {
          card: { setId: "1st", cardNumber: 41 }, // Alias the Sell-Sword
          attachments: [{ setId: "1st", cardNumber: 311 }], // Ring of All Seeing
        },
        { card: { setId: "1st", cardNumber: 50 } }, // Marco Volo
      ],
    },
    p2: {
      formation: { A: { realm: { setId: "1st", cardNumber: 5 } } }, // Cormyr
      pool: [{ card: { setId: "1st", cardNumber: 42 } }], // King Azoun IV
      hand: [
        { setId: "1st", cardNumber: 44 }, // Elminster
        { setId: "1st", cardNumber: 96 }, // Horrors of the Abyss
        { setId: "1st", cardNumber: 156 }, // Eye and Hand of Vecna
      ],
      drawPile: [
        { setId: "1st", cardNumber: 51 }, // The Harpers (top)
        { setId: "1st", cardNumber: 48 }, // The Pereghost
        { setId: "1st", cardNumber: 58 }, // Armies of Bloodstone
      ],
    },
  },

  // ── Turn trigger: The Scarlet Brotherhood (start — eliminate champion) ───
  // The Scarlet Brotherhood (#135, Realm, GH) fires at start of turn.
  // Text: "Player can eliminate one champion from any pool. This realm is then razed."
  // Use "Other effects": right-click a champion in p2's pool to discard it,
  // then right-click The Scarlet Brotherhood realm to raze it. Done.
  "trigger-start-scarlet-brotherhood": {
    name: "Turn trigger — The Scarlet Brotherhood (start, eliminate champion)",
    description:
      "The Scarlet Brotherhood (Realm, GH) fires at start of p1's turn. " +
      "Select 'Other effects' → Done, then right-click a champion in p2's pool to eliminate it, " +
      "then right-click the Scarlet Brotherhood realm to raze it.",
    phase: "START_OF_TURN",
    p1: {
      formation: {
        A: { realm: { setId: "1st", cardNumber: 111 } }, // Free City of Greyhawk
        B: { realm: { setId: "1st", cardNumber: 135 } }, // The Scarlet Brotherhood
      },
    },
    p2: {
      formation: { A: { realm: { setId: "1st", cardNumber: 5 } } }, // Cormyr
      pool: [
        { card: { setId: "1st", cardNumber: 42 } }, // King Azoun IV, lv 7
        { card: { setId: "1st", cardNumber: 44 } }, // Elminster the Mage, lv 9
      ],
    },
  },

  // ── Turn trigger: Cup of Al'Akbar (end — discard 3, return 1 from discard)
  // Cup of Al'Akbar (#160, Artifact, GH) fires at end of turn.
  // Text: "If the player discards three cards from his hand, can return one card from
  //         discard pile to hand."
  // Flow: PASS → trigger fires → "Other effects" → Done (still in Phase 5) →
  //   discard 3 from hand → right-click discard pile card → return to hand → PASS.
  "trigger-end-cup-of-alakbar": {
    name: "Turn trigger — Cup of Al'Akbar (end, discard 3 → return 1 from discard)",
    description:
      "Cup of Al'Akbar (Artifact, GH) on Mordenkainen fires at end of p1's turn. " +
      "PASS → trigger fires → Other effects → Done (still in Phase 5) → " +
      "discard 3 cards from hand → right-click discard pile → return target card to hand → PASS.",
    phase: "PHASE_FIVE",
    p1: {
      formation: { A: { realm: { setId: "1st", cardNumber: 111 } } }, // Free City of Greyhawk
      pool: [
        {
          card: { setId: "1st", cardNumber: 162 }, // Mordenkainen, GH Wizard lv 7
          attachments: [{ setId: "1st", cardNumber: 160 }], // Cup of Al'Akbar
        },
      ],
      hand: [
        { setId: "1st", cardNumber: 54 },  // War Party
        { setId: "1st", cardNumber: 58 },  // Armies of Bloodstone
        { setId: "1st", cardNumber: 59 },  // The Iron Legion
        { setId: "1st", cardNumber: 61 },  // Myrmidons
      ],
      discardPile: [
        { setId: "1st", cardNumber: 44 }, // Elminster (retrievable)
        { setId: "1st", cardNumber: 96 }, // Horrors of the Abyss
        { setId: "1st", cardNumber: 342 }, // Shield spell
      ],
    },
    p2: {
      formation: { A: { realm: { setId: "1st", cardNumber: 5 } } }, // Cormyr
      pool: [{ card: { setId: "1st", cardNumber: 42 } }], // King Azoun IV
    },
  },
}
