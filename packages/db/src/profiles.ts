import { drizzle } from "drizzle-orm/postgres-js"
import { eq } from "drizzle-orm"
import { sql } from "./connection.ts"
import { profiles } from "./schema.ts"
import type { Profile } from "./schema.ts"

const db = drizzle(sql)

export async function getProfile(userId: string): Promise<Profile | null> {
  const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId))
  return row ?? null
}

export async function upsertNickname(userId: string, nickname: string): Promise<Profile> {
  const [row] = await db
    .insert(profiles)
    .values({ userId, nickname })
    .onConflictDoUpdate({ target: profiles.userId, set: { nickname, updatedAt: new Date() } })
    .returning()
  if (!row) throw new Error("Failed to upsert profile")
  return row
}
