import { pgTable, uuid, text, integer, jsonb, timestamp, index, unique } from "drizzle-orm/pg-core"

// ─── games ────────────────────────────────────────────────────────────────────

export const games = pgTable("games", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: text("status", {
    enum: ["waiting", "active", "finished", "abandoned"],
  })
    .notNull()
    .default("waiting"),
  formatId: text("format_id").notNull(),
  /** uint32 seed used for the deterministic shuffle — stored at game creation. */
  seed: integer("seed").notNull(),
  playMode: text("play_mode", {
    enum: ["full_manual", "semi_auto"],
  })
    .notNull()
    .default("full_manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastActionAt: timestamp("last_action_at", { withTimezone: true }).notNull().defaultNow(),
  /** Null until the first move is submitted. */
  turnDeadline: timestamp("turn_deadline", { withTimezone: true }),
  winnerId: uuid("winner_id"),
  /** Human-readable RPG-style slug for sharing, e.g. "cursed-dragon-spire". */
  slug: text("slug").unique(),
  /**
   * Dev-only: a full serialized GameState injected at game creation.
   * When set, reconstructState uses this as the starting point instead of
   * calling initGame(). Subsequent moves are replayed on top as usual.
   * Always null for regular (lobby-created) games.
   */
  stateSnapshot: jsonb("state_snapshot"),
})

// ─── game_players ─────────────────────────────────────────────────────────────

export const gamePlayers = pgTable(
  "game_players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    /** 0 = first to act, 1 = second, etc. */
    seatPosition: integer("seat_position").notNull(),
    /** Display name at the time the game was created/joined. */
    nickname: text("nickname").notNull().default(""),
    /**
     * Immutable snapshot of the player's deck at game start.
     * Stored as CardData[] — prevents deck changes mid-game.
     */
    deckSnapshot: jsonb("deck_snapshot").notNull(),
  },
  (t) => [
    index("game_players_game_id_idx").on(t.gameId),
    unique("game_players_game_user_unique").on(t.gameId, t.userId),
  ],
)

// ─── game_actions ─────────────────────────────────────────────────────────────
// The event log — the single source of truth for game state.

export const gameActions = pgTable(
  "game_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    /** Monotonic counter — replay in this order to reconstruct state. */
    sequence: integer("sequence").notNull(),
    /** The user who submitted this move. */
    playerId: uuid("player_id").notNull(),
    /** Serialized Move — includes MANUAL resolution moves. */
    move: jsonb("move").notNull(),
    /**
     * SHA-256 hex hash of the resulting GameState JSON.
     * Used to detect tampering and verify reconstruction integrity.
     */
    stateHash: text("state_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("game_actions_game_id_idx").on(t.gameId),
    unique("game_actions_game_sequence_unique").on(t.gameId, t.sequence),
  ],
)

// ─── profiles ─────────────────────────────────────────────────────────────────

export const profiles = pgTable("profiles", {
  userId: uuid("user_id").primaryKey(),
  nickname: text("nickname").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── Inferred types ───────────────────────────────────────────────────────────

export type Game = typeof games.$inferSelect
export type NewGame = typeof games.$inferInsert
export type GamePlayer = typeof gamePlayers.$inferSelect
export type GameAction = typeof gameActions.$inferSelect
export type NewGameAction = typeof gameActions.$inferInsert
export type Profile = typeof profiles.$inferSelect
