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

// ─── Effect Tags ─────────────────────────────────────────────────────────────

/** A card that can rebuild a razed realm (holdings and events). */
export interface RebuildRealmEffect {
  type: "rebuild_realm"
}

/**
 * Signals that this card opens the trigger resolution panel at the specified
 * turn boundary. Players are responsible for reading their card text and
 * choosing the appropriate generic tools (peek, discard, etc.).
 * The engine provides tools — not rules enforcement.
 */
export interface TurnTriggerEffect {
  type: "turn_trigger"
  timing: "start" | "end"
}

/** A card that can be played from hand to negate/cancel an event. */
export interface CounterEventEffect {
  type: "counter_event"
}

/** A card that can be played from hand to negate/cancel a spell. */
export interface CounterSpellEffect {
  type: "counter_spell"
}

/** Union of all structured effect tags on CardData. */
export type EffectTag =
  | RebuildRealmEffect
  | TurnTriggerEffect
  | CounterEventEffect
  | CounterSpellEffect

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
  /** Structured effect tags driving engine automation. */
  effects: EffectTag[]
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
  /** Per-player hand size override — set by CHANGE_HAND_SIZE. undefined = use deckSize default. */
  maxHandSizeOverride?: number | undefined
}

// ─── Turn-Triggered Ability System ───────────────────────────────────────────

/**
 * Temporarily revealed cards during a peek trigger.
 * For draw_pile peeks: cards are removed from the draw pile and held here until resolved.
 * For hand peeks: cards are copied here for visibility only (originals stay in hand).
 */
export interface PeekContext {
  targetPlayerId: PlayerId
  cards: CardInstance[]
  /** Determines cleanup on RESOLVE_TRIGGER_DONE */
  source: "draw_pile" | "hand"
}

/**
 * A queued triggered ability waiting for player resolution.
 * Populated at turn boundaries by scanning the active player's cards for TurnTriggerEffects.
 */
export interface TriggerEntry {
  /** Unique ID for this trigger instance */
  id: string
  /** The card that generated this trigger */
  sourceCardInstanceId: CardInstanceId
  /** Player who owns the triggering card */
  owningPlayerId: PlayerId
  /** The effect driving this trigger */
  effect: TurnTriggerEffect
  /** Populated after RESOLVE_TRIGGER_PEEK — cleared on RESOLVE_TRIGGER_DONE */
  peekContext?: PeekContext
}

// ─── Resolution System ────────────────────────────────────────────────────────

/**
 * A declared effect that the resolving player wants to happen.
 * Informational only — the engine stores but does not execute these.
 * The opponent sees the declarations and manually performs them after acceptance.
 */
export type ResolutionDeclaration =
  | { action: "raze_realm"; playerId: PlayerId; slot: FormationSlot; realmName: string }
  | { action: "rebuild_realm"; playerId: PlayerId; slot: FormationSlot; realmName: string }
  | { action: "discard_card"; playerId: PlayerId; cardInstanceId: CardInstanceId; cardName: string }
  | { action: "draw_cards"; playerId: PlayerId; count: number }
  | { action: "return_to_pool"; playerId: PlayerId; cardInstanceId: CardInstanceId; cardName: string }
  | { action: "move_card"; cardInstanceId: CardInstanceId; cardName: string; destination: string }
  | { action: "other"; text: string }

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
  /** @deprecated Kept for replay compatibility — no longer set in new games. */
  counterWindowOpen?: boolean
  /** Declared effects the resolving player wants to happen (informational only). */
  declarations: ResolutionDeclaration[]
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
  /** Number of rounds won by the attacker this battle (2 = raze) */
  attackerWins: number
  /**
   * Manual combat level override — null means use the auto-computed value.
   * Set via SET_COMBAT_LEVEL when a card effect changes the total.
   */
  attackerManualLevel: number | null
  defenderManualLevel: number | null
  /** Players who have issued STOP_PLAYING — combat resolves when both stop */
  stoppedPlayers: PlayerId[]
  /** Champions borrowed from another player via cross-player moves — maps instanceId → original owner */
  borrowedChampions: Record<CardInstanceId, PlayerId>
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
  /**
   * Queued turn-triggered abilities awaiting resolution. Processed FIFO.
   * Only the owning player may act while non-empty; all other move types blocked.
   */
  pendingTriggers: TriggerEntry[]
  /**
   * True once end-of-turn triggers have been queued this turn.
   * Prevents re-queuing the same triggers on a second PASS after resolving.
   * Reset to false at the start of each turn.
   */
  endTriggersPopulated: boolean
  winner: PlayerId | null
  /** Full event log for determinism / replay */
  events: GameEvent[]
  /** Deck size (55/75/110) — determines hand sizes for all players */
  deckSize: 55 | 75 | 110
  /** True after DECLARE_ATTACK — only one attack allowed per turn */
  hasAttackedThisTurn: boolean
  /** True after PLAY_REALM or REBUILD_REALM — only one realm action allowed per Phase 2 */
  hasPlayedRealmThisTurn: boolean
  /** Player who earned a spoil of combat and may optionally draw 1 card */
  pendingSpoil: string | null
  /** Card drawn as spoil, awaiting player choice (play / keep / return to draw pile) */
  pendingSpoilCard: CardInstance | null
}

// ─── Moves ────────────────────────────────────────────────────────────────────

export type Move =
  // Phase 0 — start of turn
  | { type: "PLAY_RULE_CARD"; cardInstanceId: CardInstanceId }

  // Phase 2 — realm and holding
  | { type: "PLAY_REALM"; cardInstanceId: CardInstanceId; slot: FormationSlot }
  | {
      type: "REBUILD_REALM"
      slot: FormationSlot
      cardInstanceIds: [CardInstanceId, CardInstanceId, CardInstanceId]
    }
  | { type: "RAZE_OWN_REALM"; slot: FormationSlot }
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
  | { type: "DECLARE_DEFENSE"; championId: CardInstanceId; fromPlayerId?: PlayerId }
  | { type: "DECLINE_DEFENSE" } // concede realm
  | { type: "PLAY_COMBAT_CARD"; cardInstanceId: CardInstanceId } // losing player plays a card
  | { type: "STOP_PLAYING" } // done playing combat cards
  | { type: "CONTINUE_ATTACK"; championId: CardInstanceId; fromPlayerId?: PlayerId } // new round vs same realm
  | { type: "END_ATTACK" } // attacker stops voluntarily
  | { type: "INTERRUPT_COMBAT" } // end combat with no winner — all champions return intact

  // Phase 5 — end phase
  | { type: "PLAY_PHASE5_CARD"; cardInstanceId: CardInstanceId }
  | { type: "DISCARD_CARD"; cardInstanceId: CardInstanceId } // discard from hand, pool, combat, or formation

  // Any phase
  | { type: "PLAY_EVENT"; cardInstanceId: CardInstanceId }
  | { type: "PASS" }
  /**
   * Sent by a non-resolving player to acknowledge the counter window and allow
   * the resolving player to proceed. Legal only when resolutionContext.counterWindowOpen.
   */
  | { type: "PASS_COUNTER" }
  /**
   * Activate an in-play counter card (artifact attachment or champion ability in pool).
   * The card stays in the pool after use; the pending resolution is cancelled.
   * Legal only when resolutionContext.counterWindowOpen and the card is in the player's pool.
   */
  | { type: "USE_POOL_COUNTER"; cardInstanceId: CardInstanceId }
  /** Draw the 1-card spoil earned by winning combat (optional) */
  | { type: "CLAIM_SPOIL" }
  /** Keep the drawn spoil card in hand */
  | { type: "SPOIL_KEEP" }
  /** Return the drawn spoil card to the top of the draw pile */
  | { type: "SPOIL_RETURN" }
  /** Play the drawn spoil card immediately (bypasses phase restrictions) */
  | { type: "SPOIL_PLAY"; slot?: FormationSlot; championId?: CardInstanceId }
  /** Skip remaining phases and end the turn (only when hand ≤ maxEnd) */
  | { type: "END_TURN" }
  /** Draw N extra cards from own draw pile (manual tool for card effects) */
  | { type: "DRAW_EXTRA_CARDS"; count: number }
  /** Override this player's max hand size (manual tool for card effects) */
  | { type: "CHANGE_HAND_SIZE"; newSize: number }

  // Combat moves — only legal during CARD_PLAY combat phase
  /** Override the auto-computed combat level for a participant */
  | { type: "SET_COMBAT_LEVEL"; playerId: PlayerId; level: number }
  /** Move a card from attacker's combat cards to defender's (or vice versa) */
  | { type: "SWITCH_COMBAT_SIDE"; cardInstanceId: CardInstanceId }
  /** Return the main combat champion to its owner's pool (champion escapes combat) */
  | { type: "RETURN_COMBAT_CARD_TO_POOL"; cardInstanceId: CardInstanceId }
  /** Return a combat card (ally, spell, etc.) to its owner's hand */
  | { type: "RETURN_COMBAT_CARD_TO_HAND"; cardInstanceId: CardInstanceId }
  /** Atomically replace one side's combat champion with a new one */
  | {
      type: "SWAP_COMBAT_CHAMPION"
      side: "attacker" | "defender"
      newChampionId: CardInstanceId
      newChampionSource: "pool" | "hand" | "discard"
      oldChampionDestination: "pool" | "discard" | "abyss" | "hand"
    }
  /** Transition roundPhase back to AWAITING, forcing a re-pick after champion removal */
  | { type: "REQUIRE_NEW_CHAMPION"; side: "attacker" | "defender" }
  /** Remove a champion from championsUsedThisBattle, allowing reuse */
  | { type: "ALLOW_CHAMPION_REUSE"; cardInstanceId: CardInstanceId }

  /** Return a card from any player's discard pile to hand, deck, or pool */
  | {
      type: "RETURN_FROM_DISCARD"
      playerId: PlayerId
      cardInstanceId: CardInstanceId
      destination: "hand" | "deck" | "pool"
    }
  /** Shuffle entire discard pile into draw pile */
  | { type: "SHUFFLE_DISCARD_INTO_DRAW_PILE"; playerId: PlayerId }

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
  /** Rebuild a razed realm (no card cost — used by spell/event effects) */
  | { type: "RESOLVE_REBUILD_REALM"; playerId: PlayerId; slot: FormationSlot }
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
  /** Finish resolution — places the resolved card in its destination.
   *  Optional declarations are stored in the RESOLUTION_COMPLETED event for opponent notification. */
  | { type: "RESOLVE_DONE"; declarations?: ResolutionDeclaration[] }

  // Trigger resolution moves — only legal when pendingTriggers is non-empty.
  // These are generic tools; players choose what applies to their card's text.
  /** Reveal top N cards of a draw pile, or a player's full hand, into peekContext */
  | {
      type: "RESOLVE_TRIGGER_PEEK"
      targetPlayerId: PlayerId
      source: "draw_pile" | "hand"
      /** Number of cards to reveal from draw_pile. Ignored for hand. */
      count?: number
    }
  /** After a draw_pile peek: discard one of the revealed cards */
  | { type: "RESOLVE_TRIGGER_DISCARD_PEEKED"; cardInstanceId: CardInstanceId }
  /** Discard a randomly chosen card from a player's hand */
  | { type: "RESOLVE_TRIGGER_DISCARD_FROM_HAND"; targetPlayerId: PlayerId }
  /** Finish the current trigger — returns any held draw pile cards, clears peekContext */
  | { type: "RESOLVE_TRIGGER_DONE" }

  // Dev-only — bypasses all validation, adds a card directly to a player's hand.
  // Only submitted via the /dev/games/:id/give-card endpoint in AUTH_BYPASS mode.
  | { type: "DEV_GIVE_CARD"; playerId: PlayerId; instanceId: CardInstanceId; card: CardData }

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
      realmName: string
      discardedIds: CardInstanceId[]
    }
  | { type: "REALM_RAZED"; playerId: PlayerId; slot: FormationSlot; realmName: string }
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
  | {
      type: "CHAMPION_RETURNED_TO_POOL"
      playerId: PlayerId
      instanceId: CardInstanceId
      cardName: string
    }
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
  | { type: "SPOIL_CARD_DRAWN"; playerId: PlayerId; cardName: string }
  | { type: "SPOIL_CARD_PLAYED"; playerId: PlayerId; cardName: string }
  | { type: "SPOIL_CARD_KEPT"; playerId: PlayerId; cardName: string }
  | { type: "SPOIL_CARD_RETURNED"; playerId: PlayerId }
  | { type: "POOL_CLEARED"; playerId: PlayerId }
  | {
      type: "COMBAT_CARD_SWITCHED"
      playerId: PlayerId
      instanceId: CardInstanceId
      from: "attacker_combat" | "defender_combat"
      to: "attacker_combat" | "defender_combat"
    }
  | { type: "COMBAT_LEVEL_SET"; playerId: PlayerId; level: number }
  | { type: "COMBAT_INTERRUPTED"; playerId: PlayerId }
  | {
      type: "COMBAT_CHAMPION_RETURNED_TO_POOL"
      playerId: PlayerId
      instanceId: CardInstanceId
      cardName: string
    }
  | {
      type: "COMBAT_CARD_RETURNED_TO_HAND"
      playerId: PlayerId
      instanceId: CardInstanceId
      cardName: string
    }
  | {
      type: "RETURNED_FROM_DISCARD"
      playerId: PlayerId
      instanceId: CardInstanceId
      destination: "hand" | "deck" | "pool"
    }
  | {
      type: "DISCARD_SHUFFLED_INTO_DRAW"
      playerId: PlayerId
      count: number
    }
  | {
      type: "COMBAT_CHAMPION_SWAPPED"
      playerId: PlayerId
      side: "attacker" | "defender"
      oldChampionId: CardInstanceId | null
      oldChampionName: string | null
      newChampionId: CardInstanceId
      newChampionName: string
      source: "pool" | "hand" | "discard"
    }
  | {
      type: "COMBAT_CHAMPION_REQUIRED"
      playerId: PlayerId
      side: "attacker" | "defender"
    }
  | {
      type: "CHAMPION_REUSE_ALLOWED"
      playerId: PlayerId
      instanceId: CardInstanceId
      cardName: string
    }
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
      cardName: string
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
      type: "COUNTER_PLAYED"
      playerId: PlayerId
      cardInstanceId: CardInstanceId
      cardName: string
      setId: string
      cardNumber: number
      cancelledCardName: string
    }
  | {
      type: "RESOLUTION_COMPLETED"
      playerId: PlayerId
      cardInstanceId: CardInstanceId
      destination: string
      declarations?: ResolutionDeclaration[]
    }
  | { type: "EXTRA_CARDS_DRAWN"; playerId: PlayerId; count: number }
  | { type: "HAND_SIZE_CHANGED"; playerId: PlayerId; newSize: number }
  | { type: "TURN_ENDED"; playerId: PlayerId }
  | { type: "GAME_OVER"; winner: PlayerId }
  | {
      type: "TRIGGERS_QUEUED"
      playerId: PlayerId
      count: number
    }
  | {
      type: "TRIGGER_PEEK_OPENED"
      playerId: PlayerId
      targetPlayerId: PlayerId
      cardCount: number
      source: "draw_pile" | "hand"
    }
  | {
      type: "TRIGGER_CARD_DISCARDED"
      playerId: PlayerId
      targetPlayerId: PlayerId
      instanceId: CardInstanceId
      cardName: string
    }
  | {
      type: "TRIGGER_CHAMPION_ELIMINATED"
      playerId: PlayerId
      targetPlayerId: PlayerId
      instanceId: CardInstanceId
      cardName: string
    }
  | {
      type: "TRIGGER_RESOLVED"
      playerId: PlayerId
      sourceCardInstanceId: CardInstanceId
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
