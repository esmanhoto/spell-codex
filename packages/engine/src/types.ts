// ─── Primitives ──────────────────────────────────────────────────────────────

export type PlayerId = string
export type CardInstanceId = string
export type FormationSlot = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J"

/**
 * Level values:
 *   number  → base champion level (e.g. 5)
 *   string  → bonus with explicit sign or slash (e.g. "+4", "+2/+1")
 *   null    → no level (non-champion cards)
 */
export type CardLevel = number | string | null

/**
 * Support reference in supportIds.
 *   number  → card type ID the champion can use (e.g. 1=Ally, 9=MagicalItem)
 *   string  → "d{typeId}" or "o{typeId}" for spells/abilities:
 *             "d" = defensive direction, "o" = offensive direction
 */
export type SupportRef = number | string

/**
 * World IDs — from CrossFire CommonV.tcl worldInfo (field 4 of every TCL card record).
 *   0 = None / Generic    1 = Forgotten Realms    2 = Greyhawk
 *   3 = Ravenloft         4 = Dark Sun             5 = DragonLance
 *   6 = Birthright        7 = AD&D                 9 = No World
 */
export type WorldId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 9

// ─── Card Data (static — from the card database) ─────────────────────────────

/**
 * Static card definition. The engine has zero dependency on packages/data —
 * callers hydrate this from whatever source they use.
 */
export interface CardData {
  setId: string
  cardNumber: number
  name: string
  typeId: number
  worldId: WorldId
  isAvatar: boolean
  level: CardLevel
  /** Rules text (plain English). Also used to parse magical item bonuses. */
  description: string
  attributes: string[]
  supportIds: SupportRef[]
  /** Tier 1 effect specs. Empty = Tier 2 fallback (manual resolution required). */
  effects: CardEffect[]
}

// ─── Card Instance (runtime — unique in-game object) ─────────────────────────

export interface CardInstance {
  instanceId: CardInstanceId
  card: CardData
}

// ─── Formation ───────────────────────────────────────────────────────────────

export interface RealmSlot {
  realm: CardInstance
  isRazed: boolean
  holdings: CardInstance[]
}

export interface Formation {
  size: 6 | 8 | 10
  slots: Partial<Record<FormationSlot, RealmSlot>>
}

// ─── Player State ─────────────────────────────────────────────────────────────

export interface LimboEntry {
  champion: CardInstance
  /**
   * Attachments retained only if sent to Limbo OUTSIDE combat.
   * If sent during combat, attachments go to discard pile and this is empty.
   */
  attachments: CardInstance[]
  /** Game turn number when this champion returns to pool */
  returnsOnTurn: number
}

export interface PoolEntry {
  champion: CardInstance
  /** Artifacts and magical items attached during Phase 3 */
  attachments: CardInstance[]
}

export interface PlayerState {
  id: PlayerId
  hand: CardInstance[]
  drawPile: CardInstance[]
  discardPile: CardInstance[]
  /**
   * Temporary removal zone. Champion returns at start of owner's pool phase
   * on the turn indicated by `returnsOnTurn`.
   * Champions in Limbo are NOT "in play" for Rule of the Cosmos.
   */
  limbo: LimboEntry[]
  /** Semi-permanent removal — some cards can retrieve from here */
  abyss: CardInstance[]
  formation: Formation
  dungeon: CardInstance | null
  pool: PoolEntry[]
}

// ─── Combat ───────────────────────────────────────────────────────────────────

export type CombatRoundPhase =
  | "AWAITING_ATTACKER"  // attacker picks champion (or ends attack)
  | "AWAITING_DEFENDER"  // defender picks champion (or concedes)
  | "CARD_PLAY"          // losing player plays cards
  | "RESOLVING"          // engine resolves outcome

/**
 * Three possible outcomes at the end of a combat round:
 *
 *   ATTACKER_WINS  — attacker's level > defender's
 *                    → defender discarded; realm razed if now undefended
 *                    → if razed: attacker earns spoils; may send another champion
 *
 *   DEFENDER_WINS  — defender's level ≥ attacker's (ties go to defender)
 *                    → attacker champion discarded; battle ends
 *                    → defender earns spoils (1 card drawn)
 *
 *   WALL           — cardplay blocks attacker from continuing
 *                    → attacker returns to pool (NOT discarded)
 *                    → no spoils; battle ends
 */
export type CombatRoundOutcome = "ATTACKER_WINS" | "DEFENDER_WINS" | "WALL"

export interface CombatState {
  attackingPlayer: PlayerId
  defendingPlayer: PlayerId
  targetRealmSlot: FormationSlot
  roundPhase: CombatRoundPhase
  attacker: CardInstance | null
  defender: CardInstance | null
  /** Cards played by attacker this round (allies, spells, items) */
  attackerCards: CardInstance[]
  /** Cards played by defender this round */
  defenderCards: CardInstance[]
  /** Champion instanceIds used in any round — cannot reuse in later rounds */
  championsUsedThisBattle: CardInstanceId[]
  /** Tier 1 effect specs relevant to this battle */
  effectSpecs: CardEffectSpec[]
}

// ─── Pending Effects (Tier 2 manual resolution queue) ────────────────────────

/**
 * Constrains what cards RESOLVE_EFFECT can target when resolving a pending effect.
 *   any_combat_card        — any card currently in combat (either side)
 *   opposing_combat_cards  — only cards on the opposing side in combat
 *   own_combat_cards       — only cards on your own side in combat
 *   none                   — no targetable component; use SKIP_EFFECT to acknowledge
 */
export type TargetScope =
  | "any_combat_card"
  | "opposing_combat_cards"
  | "own_combat_cards"
  | "none"

/**
 * An unresolved card effect that the engine could not handle automatically (Tier 2).
 * Pushed onto GameState.pendingEffects. The triggering player must resolve or skip it
 * before normal play resumes.
 */
export interface PendingEffect {
  cardInstanceId:     CardInstanceId
  cardName:           string
  /** Full card rules text shown verbatim to both players */
  cardDescription:    string
  /** Player who triggered this effect — they pick the resolution */
  triggeringPlayerId: PlayerId
  /** Constrains valid targets for RESOLVE_EFFECT */
  targetScope:        TargetScope
}

// ─── Phases ───────────────────────────────────────────────────────────────────

export enum Phase {
  StartOfTurn = "START_OF_TURN",
  Draw        = "DRAW",
  PlayRealm   = "PLAY_REALM",
  Pool        = "POOL",
  Combat      = "COMBAT",
  PhaseFive   = "PHASE_FIVE",
  EndTurn     = "END_TURN",
}

// ─── Game State ───────────────────────────────────────────────────────────────

export interface GameState {
  id: string
  players: Record<PlayerId, PlayerState>
  /** Monotonic turn counter — increments each time the active player changes */
  currentTurn: number
  activePlayer: PlayerId
  /** Player order — determines turn rotation and left/right direction */
  playerOrder: PlayerId[]
  phase: Phase
  combatState: CombatState | null
  /**
   * Queue of card effects the engine could not resolve automatically (Tier 2).
   * When non-empty, only RESOLVE_EFFECT / SKIP_EFFECT moves are legal.
   * First entry is the one currently awaiting resolution.
   */
  pendingEffects: PendingEffect[]
  winner: PlayerId | null
  /** Full event log for determinism / replay */
  events: GameEvent[]
  /** Deck size (55/75/110) — determines hand sizes for all players */
  deckSize: 55 | 75 | 110
  /** True after DECLARE_ATTACK — only one attack allowed per turn */
  hasAttackedThisTurn: boolean
  /** True after PLAY_REALM or REBUILD_REALM — only one realm action allowed per Phase 2 */
  hasPlayedRealmThisTurn: boolean
}

// ─── Moves ────────────────────────────────────────────────────────────────────

export type Move =
  // Phase 0 — start of turn
  | { type: "PLAY_RULE_CARD";    cardInstanceId: CardInstanceId }

  // Phase 2 — realm and holding
  | { type: "PLAY_REALM";        cardInstanceId: CardInstanceId; slot: FormationSlot }
  | { type: "REBUILD_REALM";     slot: FormationSlot }                              // costs 3 cards from hand
  | { type: "PLAY_HOLDING";      cardInstanceId: CardInstanceId; realmSlot: FormationSlot }

  // Phase 3 — pool
  | { type: "PLACE_CHAMPION";    cardInstanceId: CardInstanceId }
  | { type: "ATTACH_ITEM";       cardInstanceId: CardInstanceId; championId: CardInstanceId }
  | { type: "PLAY_PHASE3_CARD";  cardInstanceId: CardInstanceId }                  // spells, psionics, etc.

  // Phase 4 — combat
  | { type: "DECLARE_ATTACK";    championId: CardInstanceId; targetRealmSlot: FormationSlot; targetPlayerId: PlayerId }
  | { type: "DECLARE_DEFENSE";   championId: CardInstanceId }
  | { type: "DECLINE_DEFENSE" }                                                    // concede realm
  | { type: "PLAY_COMBAT_CARD";  cardInstanceId: CardInstanceId }                  // losing player plays a card
  | { type: "STOP_PLAYING" }                                                       // done playing combat cards
  | { type: "CONTINUE_ATTACK";   championId: CardInstanceId }                      // new round vs same realm
  | { type: "END_ATTACK" }                                                         // attacker stops voluntarily

  // Phase 5 — end phase
  | { type: "PLAY_PHASE5_CARD";  cardInstanceId: CardInstanceId }
  | { type: "DISCARD_CARD";      cardInstanceId: CardInstanceId }                  // discard to meet hand limit

  // Any phase
  | { type: "PLAY_EVENT";        cardInstanceId: CardInstanceId }
  | { type: "PASS" }

  // Manual fallback — when engine queues a Tier 2 effect
  /** Execute the pending effect by removing/targeting the given card */
  | { type: "RESOLVE_EFFECT";    targetId: CardInstanceId }
  /** Waive the pending effect — it has no mechanical consequence this time */
  | { type: "SKIP_EFFECT" }

// ─── Engine Result ────────────────────────────────────────────────────────────

export interface EngineResult {
  newState: GameState
  events: GameEvent[]
  legalMoves: Move[]
}

// ─── Game Events ──────────────────────────────────────────────────────────────

export type GameEvent =
  | { type: "GAME_STARTED";              players: PlayerId[] }
  | { type: "TURN_STARTED";              playerId: PlayerId; turn: number }
  | { type: "PHASE_CHANGED";             phase: Phase }
  | { type: "CARDS_DRAWN";               playerId: PlayerId; count: number }
  | { type: "REALM_PLAYED";              playerId: PlayerId; instanceId: CardInstanceId; slot: FormationSlot }
  | { type: "REALM_REBUILT";             playerId: PlayerId; slot: FormationSlot; discardedIds: CardInstanceId[] }
  | { type: "REALM_RAZED";               playerId: PlayerId; slot: FormationSlot }
  | { type: "HOLDING_PLAYED";            playerId: PlayerId; instanceId: CardInstanceId; slot: FormationSlot }
  | { type: "CHAMPION_PLACED";           playerId: PlayerId; instanceId: CardInstanceId }
  | { type: "ITEM_ATTACHED";             playerId: PlayerId; itemId: CardInstanceId; championId: CardInstanceId }
  | { type: "CHAMPION_DISCARDED";        playerId: PlayerId; instanceId: CardInstanceId }
  | { type: "CHAMPION_TO_LIMBO";         playerId: PlayerId; instanceId: CardInstanceId; returnsOnTurn: number }
  | { type: "CHAMPION_FROM_LIMBO";       playerId: PlayerId; instanceId: CardInstanceId }
  | { type: "CARDS_DISCARDED";           playerId: PlayerId; instanceIds: CardInstanceId[] }
  | { type: "CARD_TO_ABYSS";            playerId: PlayerId; instanceId: CardInstanceId }
  | { type: "ATTACK_DECLARED";           attackingPlayer: PlayerId; defendingPlayer: PlayerId; slot: FormationSlot; championId: CardInstanceId }
  | { type: "DEFENSE_DECLARED";          playerId: PlayerId; championId: CardInstanceId }
  | { type: "DEFENSE_DECLINED";          playerId: PlayerId }
  | { type: "COMBAT_CARD_PLAYED";        playerId: PlayerId; instanceId: CardInstanceId }
  | { type: "COMBAT_RESOLVED";           outcome: CombatRoundOutcome; attackerLevel: number; defenderLevel: number }
  | { type: "SPOILS_EARNED";             playerId: PlayerId }
  | { type: "POOL_CLEARED";              playerId: PlayerId }
  | { type: "EFFECT_QUEUED";   effect: PendingEffect }
  | { type: "EFFECT_RESOLVED"; cardInstanceId: CardInstanceId; targetId: CardInstanceId | null }
  | { type: "TURN_ENDED";               playerId: PlayerId }
  | { type: "GAME_OVER";                winner: PlayerId }

// ─── Card Effects (Tier 1) ────────────────────────────────────────────────────

export type CardEffect =
  // Combat stat modifications
  | { type: "LEVEL_BONUS";         value: number; condition?: EffectCondition }
  | { type: "LEVEL_BONUS_VS";      value: number; targetAttribute: string }
  | { type: "NEGATE_ALLY_BONUS" }
  | { type: "SET_LEVEL";           value: number }

  // Spell access
  | { type: "GRANT_SPELL_ACCESS";  spellTypeId: number; window: "offense" | "defense" | "both" }
  | { type: "REVOKE_SPELL_ACCESS"; spellTypeId: number }

  // Immunity — default scope is "offensive" per official rules
  | { type: "IMMUNE_TO_SPELLS";    scope?: "offensive" | "defensive" | "both" }
  | { type: "IMMUNE_TO_ATTRIBUTE"; attribute: string; scope?: "offensive" | "defensive" | "both" }
  | { type: "IMMUNE_TO_TYPE";      typeId: number; scope?: "offensive" | "defensive" | "both" }

  // Card draw / hand effects
  | { type: "DRAW_CARD";           count: number }
  | { type: "DISCARD_CARD";        target: "self" | "opponent"; count: number }
  | { type: "RETURN_TO_HAND";      target: "self" }

  // Realm effects
  | { type: "EXTRA_REALM_PLAY";    count: number }
  | { type: "REALM_UNTARGETABLE" }
  | { type: "HOLDING_BONUS";       value: number }

  // Card lifecycle
  | { type: "DISCARD_AFTER_USE" }
  | { type: "DISCARD_AFTER_COMBAT" }
  | { type: "PERMANENT" }

export type EffectCondition =
  | { when: "attacking" }
  | { when: "defending" }
  | { when: "champion_type";      typeId: number }
  | { when: "champion_attribute"; attribute: string }

export type EffectTrigger =
  | "ON_PLAY"
  | "ON_COMBAT_START"
  | "ON_SUPPORT_PLAYED"
  | "ON_COMBAT_RESOLVE"
  | "ON_DISCARD"
  | "PASSIVE"

export interface CardEffectSpec {
  cardRef: { setId: string; cardNumber: number }
  trigger: EffectTrigger
  effects: CardEffect[]
}

// ─── Game Config ──────────────────────────────────────────────────────────────

export interface PlayerConfig {
  id: PlayerId
  /** Fully hydrated card data for each card in the player's deck */
  deckCards: CardData[]
}

export interface GameConfig {
  gameId: string
  players: [PlayerConfig, PlayerConfig]
  /** Seed for deterministic shuffle */
  seed: number
  formationSize?: 6 | 8 | 10
}
