# Project Vision

A web-based Spellfire engine that:

- Supports real-time play
- Supports async play (24h turn window)
- Is deterministic and replayable
- Allows AI bot players
- Uses TypeScript engine core
- Persists matches in Postgres
- Can scale if user base grows

---

# CrossFire Analysis — Key Learnings

> CrossFire is a 13-year-old TCL/Tk desktop app. We analyzed it fully.
> **Critical finding: CrossFire is a deck manager + online lobby, NOT a rules engine.**
> Players play on the honor system with chat. CrossFire handles: deck building/validation,
> card display, hand management, shuffling, and player communication.
> This confirms we are building the actual game engine from scratch.

## What CrossFire gives us

- **Precise card data schema** (13-field structure — see below)
- **Complete card database** — 25+ official sets, all sets in TCL files we can parse
- **3000+ card images** — JPGs named `{setID}/{cardNumber}.jpg`, ready to use
- **Deck format rules** — multi-dimensional validation model (type/rarity/world/set limits)
- **Card taxonomy** — 22 card types with exact IDs
- **World system** — cards belong to worlds (Forgotten Realms, Dragonlance, etc.)
- **Formation layouts** — 6/8/10 realm spatial arrangements
- **Sample decks** — 10 championship-quality reference decks

## What CrossFire does NOT give us

- Any rules enforcement (combat resolution, phase flow, card effects)
- Stack/interrupt implementation
- Card effect scripting system
- Turn state machine

---

# Architecture Decisions (Locked)

## Stack

- **Monorepo:** Bun workspaces (no build orchestration tool needed at this scale)
- **Runtime:** Bun (fast, native TypeScript)
- **Frontend:** React + Vite SPA (`packages/web`)
- **Backend:** Bun HTTP server — **Hono** (portable, runs on Bun/Node/Cloudflare)
- **Database:** Postgres via Supabase
- **ORM:** Drizzle (type-safe schema-as-code, similar role to SQLAlchemy in Python)
- **Engine:** Pure TypeScript package — no DB, no framework deps (see separation below)
- **Real-time:** WebSockets (later phase)

## Monorepo Structure

```
/packages
  /engine     # Spellfire rules engine (pure TS, zero deps)
  /data       # Card data as JSON (extracted from CrossFire TCL)
  /db         # Drizzle schema + persistence layer
  /api        # Hono HTTP server (Phase 4+)
  /web        # React + Vite SPA (Phase 5+)
```

## Engine / Server / DB Separation

```
┌─────────────────────────────────────────────────────────┐
│  ENGINE (pure TS, no deps)                              │
│                                                         │
│  applyMove(state, move) → { newState, events, legalMoves } │
│                                                         │
│  Input:  a state object + a move                        │
│  Output: a new state object + what happened             │
│  Knows nothing about: DB, users, time, HTTP             │
└─────────────────────────────────────────────────────────┘
              ↑ called by
┌─────────────────────────────────────────────────────────┐
│  SERVER (Bun + Hono/Elysia)                             │
│                                                         │
│  1. Receive move from player (HTTP / WebSocket)         │
│  2. Fetch action log from DB                            │
│  3. Replay log → reconstruct current state (via engine) │
│  4. Call engine.applyMove(state, move)                  │
│  5. If valid → persist new move to DB                   │
│  6. Return events + legalMoves to player                │
│  7. (Later) broadcast events to opponent via WebSocket  │
└─────────────────────────────────────────────────────────┘
              ↑ reads/writes
┌─────────────────────────────────────────────────────────┐
│  DATABASE (Postgres / Supabase)                         │
│                                                         │
│  Stores only:                                           │
│  - game_actions (the immutable move log, in sequence)   │
│  - games / game_players / users (metadata)              │
│                                                         │
│  Does NOT store current game state — always derived     │
│  by replaying the action log through the engine.        │
└─────────────────────────────────────────────────────────┘
```

**Why the engine has no DB access:**

- Testable without mocks — just pass in state objects
- Deterministic — no hidden reads, same input always gives same output
- Portable — runs on server, in browser, or in AI simulation loop
- Replayable for free — replaying the action log is all you need

This pattern is called **event sourcing**: the DB is the source of truth for what happened,
not for what the current state is. Current state is always computed on demand.

---

# Engine Strategy — Hybrid (Pareto)

> This is the core architectural decision. Read carefully.

## The Problem

Spellfire has ~465 cards in 1st Edition alone. Each has unique rules text. Implementing
every card effect before shipping is impractical and unnecessary.

Card effects cluster into tiers by coverage:

```
~60% of cards:  Pure stat cards — allies add levels, magic items add Def/Off bonuses,
                realms are just slots in the formation.
                → Fully handled by the level math system. Zero special code.

~20% of cards:  Common effect patterns — immune to spells, draw a card, extra realm,
                level bonus under condition, return to hand, etc.
                → ~10 reusable effect types cover all of these.

~15% of cards:  Named interactions — "destroys X type", "copies another card's level",
                "negates a specific spell".
                → Each needs a small handler, but they're simple.

~5% of cards:   Exotic effects — reverse combat, time-based triggers, conditional chains.
                → These are the truly hard ones.
```

## The Solution: Two-Tier Effect System

**Tier 1 — Engine Resolves Automatically**

The engine knows about these effect types and applies them with no player input:

- Level math (allies, magic items, spells — all stat-based effects)
- UsableBy constraints (who can carry/use a card)
- Spell timing windows (offensive vs defensive, the d/o system)
- ~10 common declarative effects (see Effect Types below)

These cover ~80% of all cards at launch.

**Tier 2 — Manual Fallback**

When a card with an unimplemented effect is played, the engine does not crash,
does not guess, and does not skip the effect. Instead:

1. Engine pushes a `PendingEffect` onto `state.pendingEffects` and emits `EFFECT_QUEUED`
2. Game pauses — only resolution moves are legal until the queue is empty
3. Both players see the card text displayed verbatim
4. The triggering player either:
   - Selects a target card (e.g. click "Remove Ally X from combat") → `RESOLVE_EFFECT`
   - Or clicks "No effect / Skip" → `SKIP_EFFECT`
5. Both moves are logged and replayed deterministically; game then resumes normally

**What the player can do:**

- `RESOLVE_EFFECT { targetId }` — removes the target card from active combat and discards it.
  Valid targets depend on `targetScope`:
  - `any_combat_card` — any card currently in combat (either side)
  - `opposing_combat_cards` — only the opponent's combat cards
  - `own_combat_cards` — only your own combat cards
  - `none` — no target; only SKIP_EFFECT is offered
- `SKIP_EFFECT` — waive the effect; no mechanical change; always available

**This is not honor system.** The engine still controls:

- Whose turn it is and phase sequencing
- Combat math and level comparison
- Legal move generation for all structural moves
- Which resolution targets are valid (based on `targetScope`)
- Deck validation

Manual resolution is scoped only to card-specific text effects that aren't yet implemented.
As more cards get Tier 1 specs, the fallback triggers less and less.

## Progressive Coverage

Effects are implemented over time, prioritized by:

1. **Frequency** — how often does this card appear in competitive decks?
2. **Impact** — does this effect determine game outcomes?
3. **Complexity** — can it be expressed as an existing effect type?

As more effects are implemented, the fallback is triggered less often.
The goal is never 100% — it's to push the fallback to the exotic fringe.

## AI Compatibility

The bot can only play cards whose effects are Tier 1 (auto-resolved). Cards with
pending manual effects are marked `requiresManualResolution: true` in game state.
The bot skips these when generating moves. This is a natural constraint — the AI
gets better automatically as more effects are implemented.

---

# Card Data Model (Precise)

> Derived directly from CrossFire DataBase/\*.tcl analysis.

## Card Schema

```ts
type CardRarity = "M" | "C" | "UC" | "R" | "VR" | "S" | "V"

// Level can be:
// - number (base champion level)
// - string like "+3" (ally bonus) or "+2/+1" (asymmetric: off/def)
// - null (non-champion, non-level cards: realms, spells, events, etc.)
type CardLevel = number | string | null

// World IDs — from CrossFire CommonV.tcl worldInfo (field 4 of every TCL card record)
//   0 = None / Generic    1 = Forgotten Realms    2 = Greyhawk
//   3 = Ravenloft         4 = Dark Sun             5 = DragonLance
//   6 = Birthright        7 = AD&D                 9 = No World
type WorldId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 9

type Card = {
  setId: string // "1st", "2nd", "FR", "DL", etc.
  cardNumber: number // 1-520 depending on set
  level: CardLevel // Champion/Ally level
  typeId: CardTypeId // 0-21 (see enum below)
  worldId: WorldId // World this card belongs to (see WorldId above)
  isAvatar: boolean // true = Avatar variant of a champion
  name: string
  description: string // Rules text (plain English) — always shown
  rarity: CardRarity
  attributes: string[] // ["Dwarf", "Undead", "Flyer", etc.] or []
  supportIds: SupportRef[] // What support this card can use/receive
  weight: number | null // For deck weight calculations
  effects: CardEffect[] // Tier 1 effects (declarative). Empty = Tier 2 fallback.
}
```

## Card Type IDs

```ts
enum CardTypeId {
  All = 0, // Meta: matches any type
  Ally = 1,
  Artifact = 2,
  BloodAbility = 3,
  ClericSpell = 4,
  Cleric = 5, // Champion subtype
  Event = 6,
  Hero = 7, // Champion subtype
  Holding = 8,
  MagicalItem = 9,
  Monster = 10, // Champion subtype
  PsionicPower = 11,
  Psionicist = 12, // Champion subtype
  Realm = 13,
  Regent = 14, // Champion subtype
  Rule = 15,
  Thief = 16, // Champion subtype
  ThiefAbility = 17,
  UnarmedCombat = 18,
  WizardSpell = 19,
  Wizard = 20, // Champion subtype
  Dungeon = 21,
  Champion = 22, // Meta
}

// Champion subtypes: 5, 7, 10, 12, 14, 16, 20
const CHAMPION_TYPE_IDS = [5, 7, 10, 12, 14, 16, 20]
```

## Support Reference System

Champions declare what support cards they can use via `supportIds`.
Realms declare what spell types can be used when attacking/defending them.

```ts
// supportIds entries:
//   number  → card type ID the champion can use (1 = Ally, 2 = Artifact, 9 = Magical Item, etc.)
//   string  → "d{typeId}" or "o{typeId}" for spells/abilities:
//             "d" = defensive direction (effect benefits your own side)
//             "o" = offensive direction (effect harms opponent's side)
//             e.g. "d19" = defensive Wizard Spell, "o4" = offensive Cleric Spell
type SupportRef = number | string
```

> **Key insight:** The `d`/`o` prefix describes **effect direction**, not who plays it or when.
> Both attacker and defender can play spells of either direction during combat.
> A champion with `supportIds: ["d19", "o19"]` can play Wizard Spells in either direction.
> A champion with only `supportIds: ["d4"]` can only play defensive Cleric Spells.

## Card Sets

```ts
type CardSetClass = "edition" | "booster" | "international" | "fan"

type CardSet = {
  id: string // "1st", "2nd", "FR", "DL", "AB", etc.
  name: string // "1st Edition", "Forgotten Realms", "The Abby"
  class: CardSetClass
  cardCount: number
}
```

## World System

Cards belong to worlds. Deck formats can restrict by world.

```
0  = None / Generic
7  = AD&D (generic D&D)
FR = Forgotten Realms
DL = Dragonlance
GH = Greyhawk
RL = Ravenloft
SP = Spelljammer
DR = Dark Sun
PO = Planescape
```

---

# Engine Design

## Core State Machine

```ts
type GameState = {
  id: string
  players: Record<PlayerId, PlayerState>
  currentTurn: number
  activePlayer: PlayerId
  phase: Phase
  combatState: CombatState | null
  pendingEffects: PendingEffect[] // Queue of Tier 2 effects awaiting player resolution
  winner: PlayerId | null
  events: GameEvent[] // Full event log for determinism/replay
}

type PlayerState = {
  id: PlayerId
  hand: CardInstance[]
  drawPile: CardInstance[]
  discardPile: CardInstance[] // Normal discard
  /**
   * Temporary removal. Champion returns at end of owner's next turn.
   * IMPORTANT: behaviour differs by context:
   *   - Sent to Limbo DURING combat   → all attachments go to discard pile
   *   - Sent to Limbo OUTSIDE combat  → retains all attachments
   * If an identical champion is brought into play, the Limbo champion is
   * discarded when it would otherwise return.
   * Champions in Limbo are NOT "in play" for Rule of the Cosmos.
   */
  limbo: LimboEntry[]
  abyss: CardInstance[] // Semi-permanent removal — some cards can retrieve
  formation: Formation // Realm layout
  dungeon: CardInstance | null
  pool: PoolEntry[] // Champions + their attached items/artifacts
}

type LimboEntry = {
  champion: CardInstance
  attachments: CardInstance[] // empty if sent to Limbo during combat
  returnsOnTurn: number // game turn number when champion returns
}

type PoolEntry = {
  champion: CardInstance
  attachments: CardInstance[] // artifacts + magical items attached in Phase 3
}

// Emitted when the engine hits a card with no Tier 1 effect spec
type ManualResolution = {
  cardInstanceId: string
  triggeringPlayerId: PlayerId
  cardDescription: string // Full card text shown to both players
  trigger: EffectTrigger // When in the phase this fired
  confirmedBy: PlayerId | null
  disputedBy: PlayerId | null
}
```

## Turn Phases

Based on official Spellfire rules (CrossFire doesn't enforce these — we do):

```ts
enum Phase {
  StartOfTurn = "START_OF_TURN", // Phase 0: rule cards, start-of-turn powers
  Draw = "DRAW", // Phase 1: draw cards
  PlayRealm = "PLAY_REALM", // Phase 2: play realm + holding
  Pool = "POOL", // Phase 3: place champions, use phase-3 spells
  Combat = "COMBAT", // Phase 4: attack one realm
  PhaseFive = "PHASE_FIVE", // Phase 5: phase-5 cards + discard to hand limit
  EndTurn = "END_TURN", // Phase 6: end turn
}
```

### Hand Sizes

| Deck Size | Starting Hand | Draw Per Turn | Max Hand at End of Turn |
| --------- | ------------- | ------------- | ----------------------- |
| 55-card   | 5             | 3             | 8                       |
| 75-card   | 6             | 4             | 10                      |
| 110-card  | 7             | 5             | 12                      |

### Phase Flow

```
PHASE 0 — START OF TURN
  └─ Play a rule card (optional)
  └─ Activate start-of-turn powers (dungeon card, specific card powers)

PHASE 1 — DRAW
  └─ Draw 3 cards (55-card game) / 4 / 5

PHASE 2 — REALM & HOLDING (optional)
  ├─ Play, rebuild, or replace ONE realm
  └─ Attach ONE holding to a same-world realm

PHASE 3 — POOL (optional)
  ├─ Place any number of champions into pool
  ├─ Attach artifacts (one per champion, same-world) and magical items (any number)
  └─ Use phase-3 spells, psionic powers, blood abilities, thief skills

PHASE 4 — COMBAT (optional)
  └─ Attack one realm (see Combat section)

PHASE 5 — END PHASE (mandatory)
  ├─ Use any phase-5 cards
  └─ Discard down to max hand size (events → Abyss, others → discard pile)

PHASE 6 — END TURN (mandatory)
  ├─ If a player now has ZERO realms (razed or unrazed): discard all their pool champions
  └─ Pass to left
```

## Move Types

```ts
type Move =
  // Phase 0
  | { type: "PLAY_RULE_CARD"; cardInstanceId: string }

  // Phase 2
  | { type: "PLAY_REALM"; cardInstanceId: string; slot: string }
  | { type: "REBUILD_REALM"; slot: string } // costs 3 cards from hand
  | { type: "PLAY_HOLDING"; cardInstanceId: string; realmSlot: string }

  // Phase 3
  | { type: "PLACE_CHAMPION"; cardInstanceId: string }
  | { type: "ATTACH_ITEM"; cardInstanceId: string; championId: string }
  | { type: "PLAY_PHASE3_CARD"; cardInstanceId: string } // spells, psionics, etc.

  // Phase 4 — combat
  | {
      type: "DECLARE_ATTACK"
      championId: string
      targetRealmSlot: string
      targetPlayerId: PlayerId
    }
  | { type: "DECLARE_DEFENSE"; championId: string }
  | { type: "DECLINE_DEFENSE" } // defender concedes, realm is razed
  | { type: "PLAY_COMBAT_CARD"; cardInstanceId: string } // Step F: losing player plays a card
  | { type: "STOP_PLAYING" } // losing player declines to play more
  | { type: "CONTINUE_ATTACK"; championId: string } // new round vs. same realm
  | { type: "END_ATTACK" } // attacker stops voluntarily

  // Phase 5
  | { type: "PLAY_PHASE5_CARD"; cardInstanceId: string }

  // Any phase
  | { type: "PLAY_EVENT"; cardInstanceId: string }
  | { type: "PASS" }

  // Manual fallback — used when engine queues a Tier 2 effect
  | { type: "RESOLVE_EFFECT"; targetId: string } // remove/target a card
  | { type: "SKIP_EFFECT" } // waive the effect

type EngineResult = {
  newState: GameState
  events: GameEvent[]
  legalMoves: Move[]
}

// Core engine functions
function applyMove(state: GameState, move: Move): EngineResult
function getLegalMoves(state: GameState, playerId: PlayerId): Move[]
```

## Card Effect Types (Tier 1)

The declarative effect vocabulary the engine understands and resolves automatically.
This is extended over time as more effects are promoted from Tier 2 to Tier 1.

```ts
type CardEffect =
  // ── Group A · Combat level modifications ─────────────────────────────────
  | { type: "LEVEL_BONUS"; value: number; condition?: EffectCondition }
  | { type: "LEVEL_BONUS_VS"; value: number; targetAttribute: string } // e.g. "+3 vs Undead"
  | { type: "LEVEL_BONUS_VS_TYPE"; value: number; typeId: number } // e.g. "+2 vs monsters (typeId 10)"

  // ── Group A · Spell access ────────────────────────────────────────────────
  | { type: "GRANT_SPELL_ACCESS"; spellTypeId: number; window: "offense" | "defense" | "both" }

  // ── Group A · Immunity ────────────────────────────────────────────────────
  // World bonus (+3 when champion.worldId === realm.worldId) is automatic — not a CardEffect.
  | { type: "IMMUNE_TO_SPELLS"; scope?: "offensive" | "defensive" | "both" }
  | { type: "IMMUNE_TO_ATTRIBUTE"; attribute: string }
  | { type: "IMMUNE_TO_ALL_MAGIC" }

  // ── Group A · Card draw / hand ────────────────────────────────────────────
  | { type: "DRAW_CARD"; count: number }
  | { type: "DISCARD_CARD"; target: "self" | "opponent"; count: number }

  // ── Group A · Combat bonus ────────────────────────────────────────────────
  // typeIds: which card types benefit; typeId 0 = all, 1 = Ally, [5,7,10,12,14,16,20] = champions
  | { type: "COMBAT_BONUS"; value: number; typeIds: number[] }

  // ── Group B · Passive / structural ───────────────────────────────────────
  | { type: "HAND_SIZE_BONUS"; count: number }
  | { type: "DRAW_PER_TURN"; count: number }
  | { type: "DRAW_ON_REALM_PLAY"; count: number }
  | {
      type: "REALM_GRANTS_SPELL_ACCESS"
      spellTypeId: number
      window: "offense" | "defense" | "both"
    }
  | { type: "NEGATE_ITEM_BONUS" }
  | { type: "RESTRICTED_ATTACKERS"; attribute?: string; typeId?: number }
  | { type: "REALM_SELF_DEFENDS"; level: number; typeId: number }

type EffectCondition =
  | { when: "attacking" }
  | { when: "defending" }
  | { when: "champion_type"; typeId: CardTypeId }
  | { when: "champion_attribute"; attribute: string }

type EffectTrigger =
  | "ON_PLAY"
  | "ON_COMBAT_START"
  | "ON_SUPPORT_PLAYED"
  | "ON_COMBAT_RESOLVE"
  | "ON_DISCARD"
  | "PASSIVE" // Always active while in play

// A card's effect spec — stored in packages/data, keyed by card ref
type CardEffectSpec = {
  cardRef: { setId: string; cardNumber: number }
  trigger: EffectTrigger
  effects: CardEffect[]
}
```

## Combat Resolution Model

Combat is a **battle** against one realm, potentially spanning **multiple rounds**.
Each round is attacker champion vs. defender champion.

```ts
type CombatState = {
  attackingPlayer: PlayerId
  defendingPlayer: PlayerId
  targetRealmSlot: string
  roundPhase: CombatRoundPhase
  attacker: CardInstance | null
  defender: CardInstance | null // null = undefended (realm will be razed)
  // Cards added during the round (come from hand during step F)
  attackerCards: CardInstance[]
  defenderCards: CardInstance[]
  championsUsedThisBattle: CardInstanceId[] // can't reuse in later rounds
}

type CombatRoundPhase =
  | "AWAITING_ATTACKER" // attacker picks champion (or ends attack)
  | "AWAITING_DEFENDER" // defender picks champion (or concedes realm)
  | "ACTIVATION" // attacker's cards activate, then defender's (engine-resolved)
  | "CARD_PLAY" // losing player plays cards one at a time
  | "RESOLVING" // compare final levels, determine winner

/**
 * Three possible outcomes at the end of a combat round:
 *
 *   ATTACKER_WINS  — attacker's level > defender's (or defender discarded by cardplay)
 *                    → defender discarded; realm may be razed if no other defenders
 *                    → if realm razed: attacker earns spoils
 *                    → attacker may send another champion for a new round
 *
 *   DEFENDER_WINS  — defender's level ≥ attacker's (ties go to defender)
 *                    → attacker champion discarded; battle ends
 *                    → defender earns spoils
 *
 *   WALL           — cardplay blocks the attacker from continuing WITHOUT defeating them
 *                    → attacker champion returns to pool (NOT discarded)
 *                    → no spoils for either side; battle ends
 *                    → if cardplay blocks defender: round ends, defender returns to pool,
 *                       attacker may send a new champion for another round
 */
type CombatRoundOutcome = "ATTACKER_WINS" | "DEFENDER_WINS" | "WALL"
```

### Combat Round Step-by-Step

```
1. AWAITING_ATTACKER — attacker picks a champion (from hand or pool)
   → champion may already have attached items from pool

2. AWAITING_DEFENDER — defender picks a champion (from hand or pool)
   → if DECLINE_DEFENSE: realm is razed, attacker gets spoils, battle ends

3. ACTIVATION — engine applies Order of Activation automatically:
   - Realm power → Holding power → Pre-battle cards
   - Attacker's champion power → Attacker's attached cards (in order)
   - Defender's champion power → Defender's attached cards (in order)
   - World bonus applied: +3 if champion's world matches target realm's world

4. CARD_PLAY — back-and-forth until done:
   - Compare adjusted levels
   - LOSING player may PLAY_COMBAT_CARD (ally, spell, magical item, etc.)
   - WINNING player may only play events or "play at any time" cards
   - Each card played triggers ACTIVATION for that card, then re-compare
   - Losing player plays STOP_PLAYING when done (or has no legal cards)

5. RESOLVING — final level comparison:
   - Higher adjusted level wins; TIE → defender wins
   - ATTACKER_WINS: defender champion + all attachments discarded
                    attacker champion + items/artifacts back to pool; allies/spells discarded
                    if realm is now undefended → realm razed → attacker earns spoils
                    attacker may send another champion (new round) or END_ATTACK
   - DEFENDER_WINS: attacker champion + all attachments discarded; battle ends
                    defender earns spoils (1 card drawn)
   - WALL outcome: attacker blocked by cardplay → attacker returns to pool (no discard)
                   no spoils for either side; battle ends
                   (if defender walled: defender returns to pool, attacker may send new champion)

Spoils card may be played immediately — even out-of-phase (e.g. a realm played during Phase 4).
```

> **Key rule:** Offensive/Defensive on spells describes the **effect direction**
> (offensive = affects opponent, defensive = affects yourself), NOT when they can be played.
> Either player can play either type during CARD_PLAY — but only the **losing** player
> may play cards freely. The winning player is limited to events and play-at-any-time cards.

```ts
// Pure function — deterministic, no side effects
function calculateCombatLevel(
  champion: CardInstance,
  combatCards: CardInstance[], // cards played during this round
  worldMatch: boolean, // champion's world === target realm's world
  effectSpecs: CardEffectSpec[],
): number {
  let level = champion.baseLevel

  // World bonus
  if (worldMatch) level += 3

  for (const card of combatCards) {
    if (card.typeId === CardTypeId.Ally) {
      level += parseAllyBonus(card.level)
    }
    if (card.typeId === CardTypeId.MagicalItem) {
      level += parseMagicalItemBonus(card.description)
    }
    // Tier 1 spell / ability effects
    const spec = effectSpecs.find((s) => matchesCard(s.cardRef, card))
    if (spec) {
      level += applyLevelEffects(spec.effects)
    }
    // No spec → Tier 2 fallback was triggered when the card was played
  }

  return level
}
```

## Card Playability Validation

```ts
// Can a champion use a given support card (ally, artifact, magical item, spell)?
// Checks the champion's supportIds list.
function canUse(champion: Card, card: Card): boolean {
  const typeId = card.typeId
  // Spells and abilities use the "d{typeId}"/"o{typeId}" ref system
  if (isSpellType(typeId)) {
    return champion.supportIds.includes(`d${typeId}`) || champion.supportIds.includes(`o${typeId}`)
  }
  // Non-spell cards (allies, artifacts, magical items) use bare type IDs
  return champion.supportIds.includes(typeId)
}

// Can a champion play a spell of the given direction at this realm?
// Checks champion supportIds; realm may also grant extra access via Tier 1 effects.
function canPlaySpell(champion: Card, spell: Card, direction: "offensive" | "defensive"): boolean {
  const ref = `${direction === "offensive" ? "o" : "d"}${spell.typeId}`
  return champion.supportIds.includes(ref)
}

// Does this card require manual resolution?
function requiresManualResolution(card: Card, effectSpecs: CardEffectSpec[]): boolean {
  // Pure stat cards are always Tier 1 — level math handles them automatically
  if (card.typeId === CardTypeId.Ally && isStatCard(card)) return false
  if (card.typeId === CardTypeId.MagicalItem && isStatCard(card)) return false
  // Otherwise check if we have a Tier 1 effect spec for it
  return !effectSpecs.some((s) => matchesCard(s.cardRef, card))
}
```

## Formation Model

The standard formation is a **pyramid** with its base toward the owning player:

```
        [A]           ← front (exposed)
      [B] [C]
    [D] [E] [F]       ← back row
```

Protection rules:

- A realm cannot be attacked if an **unrazed realm is in front of it**.
- A protects B and C.
- B protects D and E. C protects E and F. (E is doubly protected.)
- Razed realms offer no protection — realms behind them become exposed.
- Flyers can attack any realm regardless of position.
- Swimmers can attack any coastal realm regardless of position.
- Earthwalkers can attack any realm not explicitly restricted.

Placement order (enforced by `getLegalMoves`):

- Slot A must be filled (even if razed) before B or C can be placed.
- Both B and C must be filled before D, E, or F can be placed.
- If cardplay forces a realm out of an interior slot, that slot must be filled before
  any realm behind it can be played.

```ts
// Slot IDs for 6-realm (standard), 8-realm, 10-realm formations
type FormationSlot = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J"

// Which slots protect which — used for attack legality checks
const PROTECTS: Record<FormationSlot, FormationSlot[]> = {
  A: ["B", "C"],
  B: ["D", "E"],
  C: ["E", "F"],
  D: [],
  E: [],
  F: [],
  G: [],
  H: [],
  I: [],
  J: [],
}

type Formation = {
  size: 6 | 8 | 10
  slots: Partial<Record<FormationSlot, RealmSlot>>
}

type RealmSlot = {
  realm: CardInstance // the realm card
  isRazed: boolean
  holdings: CardInstance[] // attached holdings (discarded when realm is razed)
}
```

---

## Rule of the Cosmos

> "Only one of each named card (same name + same icon) can be in play across ALL players simultaneously."

This is a **global uniqueness constraint** enforced by `getLegalMoves` and `applyMove`:

- Applies to: champions, artifacts, realms, holdings.
- Does **not** apply to: allies, spells, events, magical items, or other non-unique types.
- A **razed realm** is still considered "in play" — it blocks opponents from playing the same realm.
- A champion in **Limbo** is NOT considered "in play" — the slot is free.
- A champion in the **pool** IS in play.

```ts
// Engine check — called before allowing any PLACE_CHAMPION / PLAY_REALM / ATTACH_ITEM move
function isUniqueCardInPlay(card: CardData, allPlayerStates: PlayerState[]): boolean {
  if (!isCosmosCard(card)) return true // non-unique types always allowed
  for (const player of allPlayerStates) {
    if (player.pool.some((e) => nameAndTypeMatch(e.champion.card, card))) return false
    if (formationHasCard(player.formation, card)) return false
    // Limbo is intentionally excluded — limbo champions are not "in play"
  }
  return true
}
```

---

# Deck Format Validation

```ts
type DeckFormat = {
  id: string
  name: string
  total: { min: number; max: number }
  championCount: { min: number; max: number }
  maxChampionLevels: number
  typeLimits: Record<CardTypeId, CardTypeLimit>
  rarityLimits: Record<CardRarity, RarityLimit>
  worldLimits?: Record<string, WorldLimit>
  setLimits?: Record<string, SetLimit>
  banned: CardRef[]
  allowed: CardRef[] // If non-empty, ONLY these cards are legal
}

type CardTypeLimit = { min: number; max: number; maxCopies: number }
type CardRef = { setId: string; cardNumber: number }
```

**Standard 55-Card Format:**

- Total: 55 cards
- Realms: 8–15
- Champions: 1–20
- Total champion levels: 0–90
- Artifacts: 0–10, Magical Items: 0–12
- Max 1 copy of any card

---

# Asset Pipeline

## Card Images

CrossFire ships 3000+ card JPGs organized as:

```
Graphics/Cards/{setId}/{cardNumber}.jpg
```

**Format decision: keep JPEGs as source, serve WebP.**

- PNG: larger than JPEG with no quality benefit for photographic content — skip
- WebP: ~30-40% smaller than JPEG at equivalent quality, universal browser support — use this
- Quality enhancement / AI upscaling: source scans are the best available, don't modify
- Never re-encode originals (JPEG→JPEG loses quality each generation)

**Pipeline:**

```
Source (repo, committed):
  packages/data/assets/cards/{setId}/{cardNumber}.jpg   ← originals, never modified

Generated (not committed, produced by script):
  packages/data/assets/cards/{setId}/{cardNumber}.webp  ← pipeline output

Served via: Supabase Storage / CDN
```

**Conversion script** (Bun + sharp):

```ts
sharp(inputJpeg).webp({ quality: 82 }).toFile(outputWebp)
// quality 82: visually indistinguishable from source, ~40% smaller
```

**MVP scope:** only process 1st Edition (~465 images) at launch. Full 3000+ conversion can wait.

## Icons

```
Graphics/Icons/{type}.gif          → card type icons (ally.gif, realm.gif, etc.)
Graphics/Icons/world{id}.gif       → world symbols
Graphics/Icons/Small/{name}.gif    → small UI variants
```

---

# Phase 1 — Data Extraction

## Tasks

1. **Write TCL → JSON parser** (Bun script)
   - Input: `CrossFire READONLY/DataBase/*.tcl`
   - Output: `packages/data/cards/{setId}.json`
   - Maps all 13 fields to TypeScript Card schema
   - Handles level variants: empty → null, integer, "+N", "+N/+M"
   - `effects: []` for all cards initially (populated in later step)

2. **Copy card images**
   - Script: copy `Graphics/Cards/**/*.jpg` → `packages/data/assets/cards/`
   - Preserve `{setId}/{cardNumber}.jpg` naming

3. **Extract deck formats**
   - Input: `CrossFire READONLY/Formats/**/*.cff`
   - Output: `packages/data/formats/*.json`
   - Maps to `DeckFormat` schema

4. **Extract sample decks**
   - Input: `CrossFire READONLY/Decks/**/*.cfd`
   - Output: `packages/data/decks/*.json`

5. **Catalog all sets + worlds**
   - Build `packages/data/sets.json` and `packages/data/worlds.json`

## Output Structure

```
packages/data/
  cards/
    1st.json      # Card[]
    2nd.json
    FR.json
    ...
  effects/
    1st.json      # CardEffectSpec[] — grows over time
    ...
  assets/
    cards/
      1st/001.jpg
      ...
  formats/
    55-card-standard.json
    ...
  decks/
    sample-gencon.json
    ...
  sets.json
  worlds.json
```

---

# Phase 2 — Engine Core

**Priority order within this phase:**

1. State machine skeleton (phases, turn flow, PASS moves)
2. Deck initialization (shuffle, deal hand)
3. Realm/holding/champion placement
4. Combat declaration + defense + concede
5. Level math (ally bonuses, magic item Def/Off, stat spell effects)
6. Spell timing window enforcement (d/o system via supportIds)
7. Support card validation (canUse / canPlaySpell)
8. World bonus (+3 when champion worldId === target realm worldId)
9. Manual fallback event emission
10. `getLegalMoves` implementation
11. 100% unit test coverage (pure functions, trivial to test)

---

# Phase 3 — Persistence (Event Sourcing)

## Database Schema (Drizzle + Postgres)

```ts
// games
{
  id: uuid
  status: "waiting" | "active" | "finished" | "abandoned"
  formatId: string
  createdAt: timestamp
  lastActionAt: timestamp
  turnDeadline: timestamp | null
  winnerId: string | null
}

// game_players
{
  gameId: uuid
  userId: uuid
  seatPosition: number
  deckSnapshot: jsonb // Immutable after game starts
}

// game_actions — the event log
{
  id: uuid
  gameId: uuid
  sequence: number // Monotonic — determines replay order
  playerId: uuid
  move: jsonb // Serialized Move (includes MANUAL moves)
  stateHash: string // Hash of resulting state (integrity check)
  createdAt: timestamp
}
```

Manual resolution moves are persisted exactly like structural moves.
On replay, they re-emit the same `ManualResolution` events in the same order.

## Reconstruction

```ts
async function reconstructGame(gameId: string): Promise<GameState> {
  const [players, actions] = await Promise.all([
    db.getPlayers(gameId),
    db.getActions(gameId), // ordered by sequence
  ])
  let state = initGame(players.map((p) => ({ id: p.userId, deck: p.deckSnapshot })))
  for (const action of actions) {
    const { newState } = applyMove(state, action.move)
    state = newState
  }
  return state
}
```

---

# Phase 4 — Async Game Mode

- Every move (including manual resolution) validated server-side
- `turnDeadline` tracked per turn (default 24h, configurable)
- Cron job: expired deadlines → auto-pass or auto-forfeit
- Notification (email or push) when it's your turn
- Manual resolution requests also notify the opponent

---

# Phase 5 — UI: Game Board

New workspace package `packages/web` (React + Vite SPA).

- **Game board:** formation grid, hand, pool, combat zone
- **Move picker:** engine returns `legalMoves[]` → UI presents them as buttons/drag targets; no rules logic in the frontend
- **Card rendering:** images from `packages/data/assets/cards/{setId}/{num}.jpg`
- **Deck builder:** format validation via `@spell/engine` deck rules
- **Async play flow:** poll for opponent's move → submit your move → repeat
- **Manual fallback UI:** when engine emits `ManualResolution`, show card text + Confirm / Dispute buttons
- **Auth:** Supabase Auth (email or OAuth)
- No WebSockets yet — HTTP polling is sufficient for async

---

# Phase 6 — Real-Time Mode

- Same engine + move system
- WebSocket layer broadcasts `GameEvent[]` after each move
- Manual fallback events appear as live prompts to both players
- No new engine logic required

---

# Phase 7 — AI Bot

`getLegalMoves` drives the bot. Cards marked `requiresManualResolution: true` are
excluded from bot move generation.

Why not let the human resolve the bot's Tier 2 effects? Because the human would
be deciding what a card that benefits the bot actually does — they'd resolve it in
their own favor. The "bot skips Tier 2 cards" constraint is the honest solution.
It also creates a natural incentive: the more effects you promote to Tier 1, the
stronger the bot becomes. No extra work needed.

- **Level 1:** random legal move
- **Level 2:** heuristic (maximize combat level, prefer weak realms, prefer attack when ahead)
- **Level 3:** MCTS — feasible because engine is deterministic and fast

Bot coverage improves automatically as Tier 1 effect coverage grows.

---

# Phase 8 — Progressive Effect Coverage

This phase is ongoing, not time-boxed. Effects are promoted from Tier 2 to Tier 1
continuously based on usage data and player feedback.

**Promotion process for a card effect:**

1. Observe which cards trigger manual fallback most often (usage metrics)
2. Read card text; identify which existing `CardEffect` type covers it (or add a new type)
3. Write `CardEffectSpec` entry in `packages/data/effects/{setId}.json`
4. Write unit test verifying the effect applies correctly in engine
5. Deploy — the fallback for that card is now gone

**Target milestones:**

- Launch: Tier 1 covers ~80% of 1st Edition cards
- 3 months post-launch: ~90% of 1st Edition, ~70% of expansions
- Long-term: fallback only for the exotic fringe (~5%)

---

# Effect System — Detailed Plan

> Based on full analysis of `CrossFire READONLY/DataBase/1st.tcl` (465 cards).
> **Status: planning — nothing implemented yet.**

---

## 1. Effect Taxonomy From 1st Edition

The 1st edition has 465 cards; ~431 (93%) have meaningful rules text.
Effects fall into four groups based on engine implementation difficulty.

---

### Group A — Already expressible with current `CardEffect` types

These effects can be populated directly into the `effects[]` array inside `cards/1st.json`
immediately once extraction is complete. No engine changes required.

| Pattern                    | `CardEffect` encoding                                    | Example cards                                                                   |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| +N (Off) ally/item         | `LEVEL_BONUS { value, condition: { when:"attacking" } }` | War Party, Dwarven Hammer                                                       |
| +N (Def) ally/item         | `LEVEL_BONUS { value, condition: { when:"defending" } }` | Shield of Destruction, Magical Barding                                          |
| +N always                  | `LEVEL_BONUS { value }`                                  | Banner of the One-Eyed God                                                      |
| +N vs attribute            | `LEVEL_BONUS_VS { value, targetAttribute }`              | Staff of Striking (+3 vs clerics), Magic Sword (+5 vs undead)                   |
| Draw N cards               | `DRAW_CARD { count }`                                    | Good Fortune, Temple of Elemental Evil                                          |
| Discard N cards            | `DISCARD_CARD { target, count }`                         | Transformation!                                                                 |
| Spell access for champion  | `GRANT_SPELL_ACCESS { spellTypeId, window }`             | Dracolich (wizard), Harpers (both)                                              |
| Immune to offensive spells | `IMMUNE_TO_SPELLS { scope:"offensive" }`                 | Elminster, Alias the Sell-Sword                                                 |
| Immune to attribute        | `IMMUNE_TO_ATTRIBUTE { attribute }`                      | Treants (vs wizard spells)                                                      |
| Immune to all magic        | `IMMUNE_TO_ALL_MAGIC`                                    | Gib Htimsen, Gib Evets                                                          |
| Defender/ally combat bonus | `COMBAT_BONUS { value, typeIds }`                        | Fortifications (all defenders: `typeIds:[0]`), Moonshae (allies: `typeIds:[1]`) |

**Note on attributes:** "Flyer.", "Undead.", "Dwarf.", race tags etc. are already stored in
`CardData.attributes[]` extracted from the TCL file. They do **not** need a `CardEffect`
entry — the engine queries them directly (e.g., `IMMUNE_TO_ATTRIBUTE { attribute:"Flyer." }`).

**Estimated coverage:** ~40% of 1st edition cards fully covered after populating these.

---

### Group B — New simple `CardEffect` types required

Small, deterministic additions to the TypeScript union. Each type needs:

- A new variant in `CardEffect`
- A handler in the appropriate engine phase function
- No complex state required

| New type                    | Fields                                                      | When applied                                                       | Example cards                                                                       |
| --------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `HAND_SIZE_BONUS`           | `count: number`                                             | Passive — scanned at start of each turn across all cards in play   | Myth Drannor (+1), The Great Kingdom (+2), Mud Palace (+2)                          |
| `DRAW_PER_TURN`             | `count: number`                                             | Start-of-turn draw — scanned across all cards in play              | Arkhold (+1/turn), Mulmaster (on spell played)                                      |
| `DRAW_ON_REALM_PLAY`        | `count: number`                                             | When this realm card is placed                                     | Haunted Hall of Eveningstar, Temple of Elemental Evil                               |
| `REALM_GRANTS_SPELL_ACCESS` | `spellTypeId: number; window: "offense"\|"defense"\|"both"` | Passive: any champion at this realm gains spell access             | Waterdeep (wizard, defense), Shadowdale (cleric+wizard, defense), Evermeet (wizard) |
| `LEVEL_BONUS_VS_TYPE`       | `value: number; typeId: number`                             | In combat                                                          | "+3 vs monsters" (typeId 10) — Bruenor, Vargas                                      |
| `NEGATE_ITEM_BONUS`         | _(none)_                                                    | In combat, negates opponent's magical item level bonuses           | Dwarven Hammer, Codex of Infinite Planes                                            |
| `RESTRICTED_ATTACKERS`      | `attribute?: string; typeId?: number`                       | Combat declaration — some attacker type cannot attack this realm   | Pirate Isles (Flyers), Arms of Nyrond (Monsters typeId:10)                          |
| `REALM_SELF_DEFENDS`        | `level: number; typeId: number`                             | If no champion defends, realm acts as champion of given level/type | Arabel (level 4 Monster), Zhentil Keep (level 5 Cleric)                             |

**Decision — passive effects outside combat:**
Passive effects like `HAND_SIZE_BONUS` and `DRAW_PER_TURN` are evaluated by a **dynamic
scan at phase boundaries** (start of turn and phase 5 hand-limit check). No dedicated
`PlayerState` fields are added.

The scan covers **every card currently in play for that player**:

- All formation slots (realms) and their attached holdings
- All pool champions and their attachments (magical items, artifacts)

This is necessary because champions and magical items can also carry passive bonuses
(not only realms). The scan is O(cards-in-play) — trivially fast in practice.
No state synchronization bugs when realms are razed or champions are discarded.

**Estimated additional coverage:** +18% → ~58% total.

---

### Group C — New complex `CardEffect` types

These need deeper engine integration: new state tracking, modified combat flow, or
interactions across multiple game objects. Implement one at a time with tests.

| New type                  | Fields                                                         | Description                                                                      | ~Cards | Example cards                                           |
| ------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------ | ------------------------------------------------------- |
| `DESTROY_ATTACHMENT`      | `scope: "opponent_item"\|"opponent_holding"\|"any_item"`       | Destroys one or more attached items/holdings from a champion or realm            | ~33    | Icewind Dale (discard magic item), Midnight, Crime Lord |
| `LEVEL_PENALTY`           | `value: number; condition?: EffectCondition`                   | Champion loses N levels during combat                                            | ~8     | Anauroch, Peasant Militia, Mind Flayer                  |
| `AURA_LEVEL_BONUS`        | `value: number`                                                | +N to ALL allied allies currently in combat                                      | ~15    | King Azoun IV, Charge! event                            |
| `MUST_DEFEAT_TWICE`       | _(none)_                                                       | Champion is not discarded on first defeat; second defeat in same battle discards | ~17    | Drizzt Do'Urden, Amarill, Lolth                         |
| `STEAL_ALLY`              | `count: number`                                                | Shift N opponent allies to your side during combat round                         | ~5     | Maligor the Red, Mind Flayer                            |
| `WALL_BARRIER`            | `crossCondition: "flyer_only"\|"min_level"; minLevel?: number` | Spell creates a wall; only flyers (or level ≥ N) can attack across it            | ~5     | Wall of Fire, Wall of Iron, Wall of Thorns              |
| `DESTROY_ALL_ATTRIBUTE`   | `attribute: string; scope: "global"\|"offensive"\|"defensive"` | Immediately destroy all cards bearing the attribute                              | ~5     | Wind Dancers (flyers), Holy Word (undead)               |
| `SURVIVE_DEFEAT_RETURN`   | `destination: "pool"\|"hand"`                                  | Instead of being discarded after combat loss, return to pool/hand                | ~3     | Labyrinth Map of Shuuc artifact                         |
| `LEVEL_DOUBLED_DEFENDING` | `condition?: EffectCondition`                                  | Double the defending champion's level if condition met                           | ~3     | Damara (doubles FR champion), South Ledopolus           |
| `LEVEL_BONUS_PER_ALLY`    | `value: number`                                                | +N for each friendly ally in combat                                              | ~3     | Aurum Gold Dragon                                       |
| `LEVEL_BONUS_AT_REALM`    | `realmCardNumber: number; setId: string; value: number`        | +N bonus when defending the named realm                                          | ~3     | Drow Matron (+3 at Menzoberranzan)                      |
| `IMMUNE_TO_MONSTERS`      | _(none)_                                                       | Champion cannot be attacked or harmed by monsters                                | ~2     | King of the Elves                                       |

**Estimated additional coverage:** +22% → ~80% total.

---

### Group D — Deferred (exotic, post-MVP)

These require either global state across turns, fundamentally new game flow, or are
rare enough that the manual fallback suffices for a long time.

| Mechanic                             | Cards                                                                                           | Complexity                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Rule cards (persistent global rules) | Age of Entropy, Barbarian's Decree, Abyssal Vortex                                              | Requires `activeRuleCard` state, affects all players every turn |
| Triggered on round win               | Shalbaal (steal hand card per win), Halcyon (return from discard per win), Rikus (attack again) | Mid-combat branching                                            |
| Triggered on defeat                  | Iuz (raze another realm), Smolder (destroy own holding), Myrmidons (reshuffle deck)             | Post-combat callbacks                                           |
| Replace champion                     | Rod of Shapechange (use champion from discard)                                                  | Combat-time substitution                                        |
| Psionic pre-battle                   | Agis, Chividal, Dlasva (destroy before battle)                                                  | New pre-combat phase                                            |
| Face-down cards                      | Cleric of Mask (hidden until battle)                                                            | New visibility model                                            |
| Event response window                | Negate, Calm, Deflect (opponent may counter events)                                             | New interrupt window                                            |

---

## 2. Data Extraction Pipeline

### Source

`CrossFire READONLY/DataBase/1st.tcl` — already parsed into `packages/data/cards/1st.json`.
The `description` field of each card record contains plain-English rules text.
The `attributes` field contains tags like `Flyer`, `Undead`, `Dwarf` etc.

### Approach: Chat-based LLM extraction with a versioned prompt file

**Two artefacts:**

```
packages/data/prompts/extract-effects.md   ← versioned prompt (human-editable)
packages/data/src/validate-effects.ts      ← Zod-based schema validator
```

**`extract-effects.md`** contains everything the LLM needs to produce correct output:

- Task instructions and output format rules
- The `CardEffect` TypeScript union (Groups A + B only; trimmed to types with ≥2 confirmed occurrences in the target set)
- 20+ worked few-shot examples covering all Group A + B patterns
- A list of Group C/D patterns to leave as `effects: []` rather than guess

**Workflow:**

1. Open a Claude chat session (claude.ai or similar)
2. Paste the contents of `prompts/extract-effects.md` as context
3. Attach / paste the target `cards/{setId}.json` (or a ~100-card slice of it)
4. The LLM fills in `effects[]` for each card and returns the modified JSON
5. Paste the result back into the file
6. Run `bun run src/validate-effects.ts` to confirm the output is schema-valid
7. Repeat for the next batch or next edition

When the prompt improves, edit the `.md` file and re-run with a new chat session — no code changes needed. The prompt version number in the header makes it easy to track which version produced which outputs.

**`validate-effects.ts`** does:

1. Read `cards/{setId}.json` (default: `cards/1st.json`)
2. For every card, validate that each entry in `effects[]` matches the Zod schema
3. Report invalid effects by card number + card name + path + error message
4. Exit with code 1 if any validation fails

**Why in-place editing of `cards/1st.json` (not a separate file):**
Effects are part of `CardData` and ship inside each player's `deckSnapshot` at game start.
A separate lookup file would require runtime joins. Inline is simpler and already supported
by the engine's `CardData.effects[]` field. Re-running `extract-cards.ts` would overwrite
effects, but that script only needs to run when the upstream TCL data changes (rare;
1st edition is a fixed historical set).

**Human review pass**: After LLM output, scan for cards that received `effects: []` despite
having non-trivial description text — those are candidates for Group C/D or for improving
the prompt. Cards with unsupported Group C/D effects stay as `effects: []` (Tier 2 fallback)
until the engine adds the required type.

**Accuracy expectation (Groups A + B only):**

- Group A effects: ~95% (simple, formulaic patterns)
- Group B effects: ~85% (slightly more phrasing variation)
- Group C/D effects: left as `[]` by design

### Target output (inline in `cards/1st.json`)

```jsonc
// cards/1st.json — card #1 after extraction
{
  "setId": "1st", "cardNumber": 1, "name": "Waterdeep",
  "typeId": 13, "description": "Any champion can use wizard spells when defending Waterdeep.",
  // ... other fields unchanged ...
  "effects": [
    { "type": "REALM_GRANTS_SPELL_ACCESS", "spellTypeId": 19, "window": "defense" }
  ]
}

// card #54 — War Party (+4 Off ally)
{
  "effects": [
    { "type": "LEVEL_BONUS", "value": 4, "condition": { "when": "attacking" } }
  ]
}

// card #28 — Haunted Hall of Eveningstar
{
  "effects": [
    { "type": "DRAW_ON_REALM_PLAY", "count": 1 }
  ]
}
```

---

## 3. Engine Wiring Plan

### Phase 1 — Wire existing Group A effects (no new types)

Most allies and magical items only need `effects` populated in their card data. The
engine already evaluates them in `calculateCombatLevel`. This alone will resolve ~40%
of current Tier 2 fallbacks with zero engine code changes.

### Phase 2 — Add Group B types and wire passive effects

1. Add new `CardEffect` union variants (TypeScript)
2. In `handlePlayRealm`: scan the new realm's `effects` for `DRAW_ON_REALM_PLAY` and apply
3. Add a helper `collectPassiveEffects(player: PlayerState): CardEffect[]` that gathers all
   effects from every card currently in play for that player:
   - Formation slots (realm cards)
   - Holdings on each realm slot
   - Pool champion cards
   - Attachments (magical items, artifacts) on each pool champion
4. In the draw phase handler: call `collectPassiveEffects` to sum `DRAW_PER_TURN` bonuses
   and apply extra draws; sum `HAND_SIZE_BONUS` to get the effective max hand size
5. In the phase 5 discard check: call `collectPassiveEffects` to get effective max hand size
6. In `getCombatDeclarationMoves`: call `collectPassiveEffects` for `RESTRICTED_ATTACKERS` and `REALM_SELF_DEFENDS`
7. In `calculateCombatLevel`: add handlers for `LEVEL_BONUS_VS_TYPE`, `IMMUNE_TO_ALL_MAGIC`, `NEGATE_ITEM_BONUS`, `COMBAT_BONUS`

### Phase 3 — Add Group C types

One sub-phase per type. Each gets:

- TypeScript union addition
- Engine handler
- At least 2 unit tests (effect active, effect inactive)

Priority order within Group C (highest card count first):

1. `DESTROY_ATTACHMENT` (~33 cards) — mid-combat item/holding removal
2. `MUST_DEFEAT_TWICE` (~17 cards) — combat state tracking
3. `AURA_LEVEL_BONUS` (~15 cards) — affects combat math
4. `LEVEL_PENALTY` (~8 cards) — combat math reduction
5. `WALL_BARRIER` (~5 cards) — affects attack legality
6. `STEAL_ALLY` (~5 cards) — mid-combat state change
7. `DESTROY_ALL_ATTRIBUTE` (~5 cards) — triggers on play
8. `SURVIVE_DEFEAT_RETURN` (~3 cards) — post-combat routing
9. `LEVEL_DOUBLED_DEFENDING` (~3 cards) — combat math
10. `LEVEL_BONUS_PER_ALLY` (~3 cards) — combat math
11. `LEVEL_BONUS_AT_REALM` (~3 cards) — combat math with realm lookup
12. `IMMUNE_TO_MONSTERS` (~2 cards) — combat immunity

---

## 4. Coverage Roadmap

| Milestone                                  | Work                                                            | Cumulative Tier 1 coverage |
| ------------------------------------------ | --------------------------------------------------------------- | -------------------------- |
| **Now**                                    | Pure-level allies/items (already handled)                       | ~17%                       |
| **After chat extraction + Group A wiring** | Populate `effects[]` via chat prompt, no engine changes         | ~40%                       |
| **After Group B engine work**              | Add 8 new types, wire passive effects                           | ~58%                       |
| **After Group C engine work**              | Add 12 complex types (incl. newly found destroy/defeat/penalty) | ~80%                       |
| **After Group D (post-MVP)**               | Rule cards, triggered effects                                   | ~90%+                      |

---

## 5. Decisions Made

| #   | Question                                                   | Decision                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Passive effect evaluation**                              | Dynamic scan of all cards in play at phase boundaries (`collectPassiveEffects`). Covers formation realms + holdings + pool champions + attachments. No dedicated `PlayerState` fields.                                                                                 |
| 2   | **Extraction approach**                                    | Chat-based LLM extraction: paste `prompts/extract-effects.md` + the cards JSON into a Claude chat session; get back the modified JSON; validate with `validate-effects.ts`. No API script.                                                                             |
| 3   | **Where effects live**                                     | Inline in `CardData.effects[]` inside `cards/1st.json`. Patched in-place via chat output. No separate effects lookup file at runtime.                                                                                                                                  |
| 4   | **Multi-set scope**                                        | 1st edition only for now. Same prompt file reused for each additional set when needed.                                                                                                                                                                                 |
| 5   | **Prompt scope**                                           | Types in `extract-effects.md` are trimmed to types with ≥2 confirmed occurrences in the target edition (verified against the actual card descriptions). Absent/singleton types are excluded from both the prompt and `engine/src/types.ts` until implemented.          |
| 6   | **`COMBAT_BONUS` replaces `HOLDING_BONUS`**                | The flat "defenders gain N levels" bonus applies to specific card type categories, not just "holdings". `typeIds: number[]` specifies which card types benefit; typeId 0 = all, 1 = Ally. Previously called `HOLDING_BONUS { value }`.                                 |
| 7   | **`RESTRICTED_ATTACKERS` replaces `MONSTERS_CANT_ATTACK`** | Generalized to cover any movement type (Flyer, Earthwalker) or card type restriction on who can attack a realm. Use `attribute` for movement types, `typeId` for card type IDs.                                                                                        |
| 8   | **`REALM_SELF_DEFENDS` promoted to Group B**               | Moved from Group C (complex) to Group B (simple passive). Encodes "realm can defend as a level N type-X champion if no champion defends." Realms with a non-null `level` field self-defend implicitly; this effect is only needed for holdings that grant the ability. |

---

# MVP Scope

**Target:** 2 human players, 1st Edition only, 55-card standard format, async play.

**In scope:**

- Full 1st Edition card data + images
- Complete turn phase flow with engine enforcement
- Combat with level math (allies, magic items, spells)
- Spell timing window enforcement (d/o system)
- UsableBy/support constraints
- Manual fallback for unimplemented effects (~20% of cards at launch)
- Deck builder with full 55-card format validation
- Async play with 24h turn windows
- Event sourcing + game reconstruction

**Out of scope for MVP:**

- Expansions beyond 1st Edition
- Real-time WebSocket mode
- AI bot
- Dungeons (complex edge case — deferred)
- Additional deck formats beyond 55-card standard

---

# Hosting

- **Database:** Supabase (Postgres + auth + card image storage)
- **Frontend:** Vercel
- **Backend:** Railway or Fly.io (Bun server)
- **Initial cost:** ~$0 (free tiers)

---

# Known Gaps (Deferred)

These are confirmed rules from RULES.md that are **not yet modelled** in the engine design.
They will be addressed when encountered during implementation or testing.

| Gap                            | Rule                                                                                                                                                 | Impact                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Ally movement restriction      | When a flyer attacks a protected realm, only flyer/swimmer/earthwalker allies can support them. "Flying is not automatically conferred to allies."   | `canUse` validation during combat needs to check attacker movement type vs realm position         |
| Spoils out-of-phase play       | A spoils card can be played immediately even out-of-phase (e.g. a realm played during Phase 4).                                                      | `applyMove` needs a `PLAY_SPOILS_CARD` move variant with relaxed phase checks                     |
| Phase 3 spell pool requirement | A champion in the pool must be available to use a Phase 3/5 spell — not just any card.                                                               | `getLegalMoves` needs to check pool for a qualifying champion before allowing Phase 3 spell moves |
| Event response window          | Both players may respond to an event (Negate, Calm, Deflect, Duplicate) before it resolves. For 2-player MVP this simplifies to one response window. | Requires `pendingEventResponse` state and a round-trip response move                              |

---

# Open Questions — Resolved

| Question                                       | Answer                                                                                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Full engine or honor system?                   | Hybrid (Option C). Engine enforces structure + Tier 1 effects. Tier 2 = manual fallback.                                           |
| Does CrossFire implement stack resolution?     | No. We implement it ourselves.                                                                                                     |
| How are interrupt windows modeled?             | Not a symmetric window. Losing player plays cards one at a time; winning player limited to events + play-at-any-time cards.        |
| What does offensive/defensive mean for spells? | Effect direction only (offensive = affects opponent, defensive = affects yourself). Both sides can play either type during combat. |
| Are card effects centralized or distributed?   | Centralized declarative specs in packages/data/effects/.                                                                           |
| Is there a scripting language?                 | No. Declarative effect types only. Exotic effects stay as manual fallback.                                                         |
| How is deck legality enforced?                 | Multi-dimensional: type/rarity/world/set limits + banned lists.                                                                    |
| How are expansions separated?                  | setId per card + per-set limits in DeckFormat.                                                                                     |
| How are simultaneous effects handled?          | Deferred. Handle as encountered in practice.                                                                                       |
| What is the combat resolution order?           | Attacker activates → Defender activates → losing player plays cards one at a time → compare levels → defender wins ties.           |
| What is the win condition?                     | 6 unrazed realms in formation (55/75-card). 10 for 110-card games.                                                                 |
| What are hand sizes?                           | 55-card: start 5, draw 3, max 8. 75-card: start 6, draw 4, max 10. 110-card: start 7, draw 5, max 12.                              |
| How does formation protection work?            | Pyramid: A protects B,C. B protects D,E. C protects E,F. Razed realms don't protect.                                               |
| What zones exist?                              | Hand, Draw Pile, Discard Pile, Limbo (temp removal), Abyss (semi-permanent), Void (permanent).                                     |
| What is the world bonus?                       | +3 to adjusted level when attacking or defending a realm from the same world. Tier 1 effect.                                       |
| How does multi-round combat work?              | Attacker can use a new champion each round against the same realm. Cannot switch realms.                                           |
| What are spoils of victory?                    | Attacker draws 1 card if realm razed. Defender draws 1 card if attacking champion discarded. Card may be played immediately.       |
| What happens when draw pile runs out?          | Reshuffle discard pile at **end of current turn** (not immediately). Cards that would have been drawn mid-turn are lost.           |

---

# Legal Note

Spellfire is TSR/WotC IP.

- Private use only
- No monetization
- No distributing copyrighted card art publicly

If ever public: text-only card display, or require users to own physical cards.

---

# Development Roadmap

## Step 1 — Data Extraction

- TCL → JSON parser (Bun script)
- All 25+ sets extracted to JSON
- 3000+ card images copied
- Deck formats extracted

## Step 2 — Engine Core

> **Before coding:** verify exact Spellfire rules on the following points:
> win condition, hand size, draw rule, champion pool mechanics,
> post-combat champion fate, undefended realm outcome, formation adjacency rules.
> These affect core state machine design and must be confirmed before implementation.

- Phase state machine
- Combat resolution + level math
- Spell timing window (d/o)
- UsableBy validation
- Manual fallback event system
- `getLegalMoves`
- 100% unit test coverage

## Step 3 — Effect Specs (1st Edition, Tier 1)

- Write `CardEffectSpec` for all 1st Edition cards
- Stat cards (allies, magic items): confirmed as no-spec needed — level math handles them
- Common effect cards: specify using existing `CardEffect` types
- Target: ~80% of 1st Edition covered at this step

## Step 4 — Async Backend

- Postgres schema + Drizzle migrations
- Move persistence API (structural + manual moves)
- Game reconstruction
- Supabase auth

## Step 5 — Web Client (React + Vite SPA)

- Game board (formation grid, hand, pool, combat zone)
- Move picker driven by `legalMoves[]` — no rules logic in frontend
- Card rendering from `packages/data/assets`
- Deck builder with format validation
- Manual fallback UI (card text prompt + confirm/dispute)
- Async play flow (HTTP polling)
- Auth via Supabase

## Step 6 — Real-Time Mode

- WebSocket layer on the existing HTTP API
- Live `GameEvent[]` broadcast after each move

## Step 7 — Polish + Expand

- Remaining 1st Edition effect coverage (→ 90%+)
- Add expansion sets
- AI bot (Level 1 → Level 2)

---

# Strategic Note

CrossFire ran for 13 years without implementing a single game rule.
We will be the first real Spellfire rules engine.

The hybrid approach means we ship a real engine fast, not a honor system.
The manual fallback is a feature, not a concession — it gives players agency
over edge cases while the engine handles everything it knows about.

Keep the engine pure, deterministic, and exhaustively tested.
Everything else — UI, async, AI, hosting — follows from that.
