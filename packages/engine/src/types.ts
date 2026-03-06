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
  /**
   * Normalized spell direction parsed in data extraction.
   * null for non-spells or unknown.
   */
  spellNature?: "offensive" | "defensive" | null
  /**
   * Normalized cast windows parsed in data extraction.
   * Empty/missing means "unknown" (engine falls back to text parse/default).
   */
  castPhases?: Array<3 | 4 | 5>
  /** Reserved for future card automation; ignored by current engine runtime. */
  effects: unknown[]
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
  /** False = only owner can see holding details; true = all players can see */
  holdingRevealedToAll?: boolean
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
  /**
   * Cards in play as lasting effects (spells resolved with "in_play" destination,
   * not yet attached to a specific champion or realm).
   */
  lastingEffects: CardInstance[]
}

// ─── Resolution System ────────────────────────────────────────────────────────

/**
 * Where RESOLVE_MOVE_CARD places a card.
 * "void" semantically removes from the game (mapped to abyss in engine).
 */
export type ZoneDestination =
  | { zone: "discard"; playerId: PlayerId }
  | { zone: "abyss"; playerId: PlayerId }
  | { zone: "void"; playerId: PlayerId }
  | { zone: "hand"; playerId: PlayerId }
  | { zone: "limbo"; playerId: PlayerId; returnsOnTurn: number }
  | { zone: "lasting_effects"; playerId: PlayerId }
  | { zone: "pool"; playerId: PlayerId }

/** Specifies a location to attach the resolved card in an "in_play" destination */
export interface AttachTarget {
  owner: PlayerId
  zone: "pool" | "formation"
  targetInstanceId?: CardInstanceId
  targetRealmSlot?: FormationSlot
}

/**
 * Active when a spell/event card effect is being resolved.
 * The resolving player performs RESOLVE_* actions then calls RESOLVE_DONE.
 */
export interface ResolutionContext {
  /** The card whose effect is being resolved */
  cardInstanceId: CardInstanceId
  /** Held during resolution — not yet placed in any zone */
  pendingCard: CardInstance
  /** Player who played the card */
  initiatingPlayer: PlayerId
  /** Player currently performing the resolution (may differ from initiating in future) */
  resolvingPlayer: PlayerId
  /** Where the card will end up after RESOLVE_DONE */
  cardDestination: "discard" | "abyss" | "void" | "in_play"
  /** If in_play, where it attaches (optional) */
  attachTarget?: AttachTarget
}

// ─── Combat ───────────────────────────────────────────────────────────────────

export type CombatRoundPhase =
  | "AWAITING_ATTACKER" // attacker picks champion (or ends attack)
  | "AWAITING_DEFENDER" // defender picks champion (or concedes)
  | "CARD_PLAY" // losing player plays cards
  | "RESOLVING" // engine resolves outcome

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
  /**
   * Manual combat level override — null means use the auto-computed value.
   * Set via SET_COMBAT_LEVEL when a card effect changes the total.
   */
  attackerManualLevel: number | null
  defenderManualLevel: number | null
}

// ─── Phases ───────────────────────────────────────────────────────────────────

export enum Phase {
  StartOfTurn = "START_OF_TURN",
  Draw = "DRAW",
  PlayRealm = "PLAY_REALM",
  Pool = "POOL",
  Combat = "COMBAT",
  PhaseFive = "PHASE_FIVE",
  EndTurn = "END_TURN",
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
   * Active when a spell/event effect is being resolved.
   * Only the resolving player may act (RESOLVE_* moves only).
   */
  resolutionContext: ResolutionContext | null
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
  | { type: "PLAY_RULE_CARD"; cardInstanceId: CardInstanceId }

  // Phase 2 — realm and holding
  | { type: "PLAY_REALM"; cardInstanceId: CardInstanceId; slot: FormationSlot }
  | { type: "REBUILD_REALM"; slot: FormationSlot } // costs 3 cards from hand
  | { type: "PLAY_HOLDING"; cardInstanceId: CardInstanceId; realmSlot: FormationSlot }
  | { type: "TOGGLE_HOLDING_REVEAL"; realmSlot: FormationSlot }

  // Phase 3 — pool
  | { type: "PLACE_CHAMPION"; cardInstanceId: CardInstanceId }
  | { type: "ATTACH_ITEM"; cardInstanceId: CardInstanceId; championId: CardInstanceId }
  | {
      type: "PLAY_PHASE3_CARD"
      cardInstanceId: CardInstanceId
      casterInstanceId?: CardInstanceId
      targetCardInstanceId?: CardInstanceId
      targetOwner?: "self" | "opponent"
    } // spells, psionics, etc.

  // Phase 4 — combat
  | {
      type: "DECLARE_ATTACK"
      championId: CardInstanceId
      targetRealmSlot: FormationSlot
      targetPlayerId: PlayerId
    }
  | { type: "DECLARE_DEFENSE"; championId: CardInstanceId }
  | { type: "DECLINE_DEFENSE" } // concede realm
  | { type: "PLAY_COMBAT_CARD"; cardInstanceId: CardInstanceId } // losing player plays a card
  | { type: "STOP_PLAYING" } // done playing combat cards
  | { type: "CONTINUE_ATTACK"; championId: CardInstanceId } // new round vs same realm
  | { type: "END_ATTACK" } // attacker stops voluntarily

  // Phase 5 — end phase
  | { type: "PLAY_PHASE5_CARD"; cardInstanceId: CardInstanceId }
  | { type: "DISCARD_CARD"; cardInstanceId: CardInstanceId } // discard to meet hand limit

  // Any phase
  | { type: "PLAY_EVENT"; cardInstanceId: CardInstanceId }
  | { type: "PASS" }
  /** Skip remaining phases and end the turn (only when hand ≤ maxEnd) */
  | { type: "END_TURN" }

  // Combat moves — only legal during CARD_PLAY combat phase
  /** Override the auto-computed combat level for a participant */
  | { type: "SET_COMBAT_LEVEL"; playerId: PlayerId; level: number }
  /** Move a card from attacker's combat cards to defender's (or vice versa) */
  | { type: "SWITCH_COMBAT_SIDE"; cardInstanceId: CardInstanceId }

  // Resolution moves — only legal when resolutionContext is active
  /** Move any in-play or in-zone card to a destination */
  | { type: "RESOLVE_MOVE_CARD"; cardInstanceId: CardInstanceId; destination: ZoneDestination }
  /** Attach a card (from play or zones) to a pool champion */
  | {
      type: "RESOLVE_ATTACH_CARD"
      cardInstanceId: CardInstanceId
      targetInstanceId: CardInstanceId
    }
  /** Raze any unrazed realm */
  | { type: "RESOLVE_RAZE_REALM"; playerId: PlayerId; slot: FormationSlot }
  /** Draw N cards for any player */
  | { type: "RESOLVE_DRAW_CARDS"; playerId: PlayerId; count: number }
  /** Return a champion from any discard pile to their owner's pool */
  | { type: "RESOLVE_RETURN_TO_POOL"; cardInstanceId: CardInstanceId }
  /** Change where the resolving card ends up after RESOLVE_DONE */
  | {
      type: "RESOLVE_SET_CARD_DESTINATION"
      destination: "discard" | "abyss" | "void" | "in_play"
      attachTarget?: AttachTarget
    }
  /** Finish resolution — places the resolved card in its destination */
  | { type: "RESOLVE_DONE" }

// ─── Engine Result ────────────────────────────────────────────────────────────

export interface EngineResult {
  newState: GameState
  events: GameEvent[]
  legalMoves: Move[]
}

// ─── Game Events ──────────────────────────────────────────────────────────────

export type GameEvent =
  | { type: "GAME_STARTED"; players: PlayerId[] }
  | { type: "TURN_STARTED"; playerId: PlayerId; turn: number }
  | { type: "PHASE_CHANGED"; phase: Phase }
  | { type: "CARDS_DRAWN"; playerId: PlayerId; count: number }
  | { type: "REALM_PLAYED"; playerId: PlayerId; instanceId: CardInstanceId; slot: FormationSlot }
  | {
      type: "REALM_REBUILT"
      playerId: PlayerId
      slot: FormationSlot
      discardedIds: CardInstanceId[]
    }
  | { type: "REALM_RAZED"; playerId: PlayerId; slot: FormationSlot }
  | { type: "HOLDING_PLAYED"; playerId: PlayerId; instanceId: CardInstanceId; slot: FormationSlot }
  | {
      type: "HOLDING_REVEAL_TOGGLED"
      playerId: PlayerId
      slot: FormationSlot
      revealedToAll: boolean
    }
  | { type: "CHAMPION_PLACED"; playerId: PlayerId; instanceId: CardInstanceId }
  | {
      type: "ITEM_ATTACHED"
      playerId: PlayerId
      itemId: CardInstanceId
      championId: CardInstanceId
    }
  | { type: "CHAMPION_DISCARDED"; playerId: PlayerId; instanceId: CardInstanceId }
  | {
      type: "CHAMPION_TO_LIMBO"
      playerId: PlayerId
      instanceId: CardInstanceId
      returnsOnTurn: number
    }
  | { type: "CHAMPION_FROM_LIMBO"; playerId: PlayerId; instanceId: CardInstanceId }
  | { type: "CHAMPION_RETURNED_TO_POOL"; playerId: PlayerId; instanceId: CardInstanceId }
  | { type: "CARDS_DISCARDED"; playerId: PlayerId; instanceIds: CardInstanceId[] }
  | { type: "CARD_TO_ABYSS"; playerId: PlayerId; instanceId: CardInstanceId }
  | {
      type: "ATTACK_DECLARED"
      attackingPlayer: PlayerId
      defendingPlayer: PlayerId
      slot: FormationSlot
      championId: CardInstanceId
    }
  | { type: "DEFENSE_DECLARED"; playerId: PlayerId; championId: CardInstanceId }
  | { type: "DEFENSE_DECLINED"; playerId: PlayerId }
  | { type: "COMBAT_CARD_PLAYED"; playerId: PlayerId; instanceId: CardInstanceId }
  | {
      type: "COMBAT_RESOLVED"
      outcome: CombatRoundOutcome
      attackerLevel: number
      defenderLevel: number
    }
  | { type: "SPOILS_EARNED"; playerId: PlayerId }
  | { type: "POOL_CLEARED"; playerId: PlayerId }
  | {
      type: "COMBAT_CARD_SWITCHED"
      playerId: PlayerId
      instanceId: CardInstanceId
      from: "attacker_combat" | "defender_combat"
      to: "attacker_combat" | "defender_combat"
    }
  | { type: "COMBAT_LEVEL_SET"; playerId: PlayerId; level: number }
  | {
      type: "PHASE3_SPELL_CAST"
      playerId: PlayerId
      instanceId: CardInstanceId
      setId: string
      cardNumber: number
      cardName: string
      cardTypeId: number
      casterInstanceId?: CardInstanceId
      targetCardInstanceId?: CardInstanceId
      targetOwner?: "self" | "opponent"
    }
  | {
      type: "CARD_ZONE_MOVED"
      playerId: PlayerId
      instanceId: CardInstanceId
      fromZone: string
      toZone: string
    }
  | {
      type: "RESOLUTION_STARTED"
      playerId: PlayerId
      cardInstanceId: CardInstanceId
      cardName: string
    }
  | {
      type: "RESOLUTION_COMPLETED"
      playerId: PlayerId
      cardInstanceId: CardInstanceId
      destination: string
    }
  | { type: "TURN_ENDED"; playerId: PlayerId }
  | { type: "GAME_OVER"; winner: PlayerId }

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
