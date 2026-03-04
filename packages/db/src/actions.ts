import { drizzle } from "drizzle-orm/postgres-js"
import { eq, asc } from "drizzle-orm"
import type { Move } from "@spell/engine"
import { sql } from "./connection.ts"
import { gameActions } from "./schema.ts"
import type { GameAction } from "./schema.ts"

const db = drizzle(sql)

// ─── Save ─────────────────────────────────────────────────────────────────────

export interface SaveActionInput {
  gameId: string
  sequence: number
  playerId: string
  move: Move
  stateHash: string
}

export async function saveAction(input: SaveActionInput): Promise<GameAction> {
  const [row] = await db
    .insert(gameActions)
    .values({
      gameId: input.gameId,
      sequence: input.sequence,
      playerId: input.playerId,
      move: input.move,
      stateHash: input.stateHash,
    })
    .returning()

  if (!row) throw new Error("Failed to insert game_action row")
  return row
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/** Returns all actions for a game, ordered by sequence ascending. */
export async function listActions(gameId: string): Promise<GameAction[]> {
  return db
    .select()
    .from(gameActions)
    .where(eq(gameActions.gameId, gameId))
    .orderBy(asc(gameActions.sequence))
}

/** Returns the highest sequence number used so far (or -1 if no actions). */
export async function lastSequence(gameId: string): Promise<number> {
  const rows = await db
    .select({ seq: gameActions.sequence })
    .from(gameActions)
    .where(eq(gameActions.gameId, gameId))
    .orderBy(asc(gameActions.sequence))

  return rows.at(-1)?.seq ?? -1
}
