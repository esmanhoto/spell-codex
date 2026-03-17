/**
 * Integration tests for packages/db/src/profiles.ts
 * Requires a running Postgres instance (docker-compose up -d).
 */

import { describe, it, expect, afterAll } from "bun:test"
import { db } from "../src/connection.ts"
import { profiles } from "../src/schema.ts"
import { inArray } from "drizzle-orm"
import { getProfile, upsertNickname } from "../src/profiles.ts"

// ─── Fixtures ────────────────────────────────────────────────────────────────

const createdUserIds: string[] = []

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await db.delete(profiles).where(inArray(profiles.userId, createdUserIds))
  }
  // Connection cleanup handled by process exit
})

// ─── getProfile ──────────────────────────────────────────────────────────────

describe("getProfile", () => {
  it("returns null for a nonexistent user", async () => {
    const result = await getProfile(crypto.randomUUID())
    expect(result).toBeNull()
  })

  it("returns the profile after upsert", async () => {
    const userId = crypto.randomUUID()
    createdUserIds.push(userId)
    await upsertNickname(userId, "Gandalf")

    const profile = await getProfile(userId)
    expect(profile).not.toBeNull()
    expect(profile!.userId).toBe(userId)
    expect(profile!.nickname).toBe("Gandalf")
  })
})

// ─── upsertNickname ──────────────────────────────────────────────────────────

describe("upsertNickname", () => {
  it("creates a new profile if none exists", async () => {
    const userId = crypto.randomUUID()
    createdUserIds.push(userId)

    const profile = await upsertNickname(userId, "Frodo")
    expect(profile.userId).toBe(userId)
    expect(profile.nickname).toBe("Frodo")
    expect(profile.updatedAt).toBeInstanceOf(Date)
  })

  it("updates nickname on conflict", async () => {
    const userId = crypto.randomUUID()
    createdUserIds.push(userId)

    await upsertNickname(userId, "Aragorn")
    const updated = await upsertNickname(userId, "Strider")

    expect(updated.nickname).toBe("Strider")

    const fetched = await getProfile(userId)
    expect(fetched!.nickname).toBe("Strider")
  })

  it("updates the updatedAt timestamp on conflict", async () => {
    const userId = crypto.randomUUID()
    createdUserIds.push(userId)

    const first = await upsertNickname(userId, "Legolas")
    // Small delay to ensure timestamp differs
    await Bun.sleep(10)
    const second = await upsertNickname(userId, "Legolas the Elf")

    expect(second.updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime())
  })
})
