/**
 * Tests for GET /me and PATCH /me/nickname.
 */

import { describe, it, expect } from "bun:test"
import { app } from "../src/index.ts"

process.env["AUTH_BYPASS"] = "true"

const USER = "00000000-0000-0000-0000-000000000011"

function headers(userId: string) {
  return { "Content-Type": "application/json", "X-User-Id": userId }
}

// ─── GET /me ──────────────────────────────────────────────────────────────────

describe("GET /me", () => {
  it("returns userId and empty nickname for a new user", async () => {
    const id = "00000000-0000-0000-0000-000000001001"
    const res = await app.request("/me", { headers: { "X-User-Id": id } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { userId: string; nickname: string; email: unknown }
    expect(body.userId).toBe(id)
    expect(body.nickname).toBe("")
    expect(body.email).toBeNull() // no email in bypass mode
  })

  it("returns 401 without auth", async () => {
    const res = await app.request("/me")
    expect(res.status).toBe(401)
  })
})

// ─── PATCH /me/nickname ───────────────────────────────────────────────────────

describe("PATCH /me/nickname", () => {
  it("saves and returns the new nickname", async () => {
    const res = await app.request("/me/nickname", {
      method: "PATCH",
      headers: headers(USER),
      body: JSON.stringify({ nickname: "Gandalf" }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { userId: string; nickname: string }
    expect(body.userId).toBe(USER)
    expect(body.nickname).toBe("Gandalf")
  })

  it("persists: GET /me returns updated nickname", async () => {
    const user = "00000000-0000-0000-0000-000000001002"
    await app.request("/me/nickname", {
      method: "PATCH",
      headers: headers(user),
      body: JSON.stringify({ nickname: "Aragorn" }),
    })
    const res = await app.request("/me", { headers: { "X-User-Id": user } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { nickname: string }
    expect(body.nickname).toBe("Aragorn")
  })

  it("rejects empty nickname", async () => {
    const res = await app.request("/me/nickname", {
      method: "PATCH",
      headers: headers(USER),
      body: JSON.stringify({ nickname: "" }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects nickname longer than 30 chars", async () => {
    const res = await app.request("/me/nickname", {
      method: "PATCH",
      headers: headers(USER),
      body: JSON.stringify({ nickname: "a".repeat(31) }),
    })
    expect(res.status).toBe(400)
  })

  it("allows updating nickname (upsert)", async () => {
    const user = "00000000-0000-0000-0000-000000001003"
    await app.request("/me/nickname", {
      method: "PATCH",
      headers: headers(user),
      body: JSON.stringify({ nickname: "First" }),
    })
    const res = await app.request("/me/nickname", {
      method: "PATCH",
      headers: headers(user),
      body: JSON.stringify({ nickname: "Updated" }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { nickname: string }
    expect(body.nickname).toBe("Updated")
  })
})
