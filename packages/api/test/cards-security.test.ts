/**
 * Security tests for the /cards route — path traversal, input validation.
 */

import { describe, it, expect } from "bun:test"
import { Hono } from "hono"
import { cardsRouter } from "../src/routes/cards.ts"
import path from "path"

// Mount under /cards like the real app
const app = new Hono()
app.route("/cards", cardsRouter)

// ─── Path traversal via setId ────────────────────────────────────────────────

describe("path traversal on /cards/:setId/:filename", () => {
  it("rejects non-.jpg extension", async () => {
    const res = await app.request("/cards/1st/001.png")
    expect(res.status).toBe(404)
  })

  it("rejects .jpg.exe double extension", async () => {
    const res = await app.request("/cards/1st/001.jpg.exe")
    expect(res.status).toBe(404)
  })

  it("returns 404 for traversal in setId (../..)", async () => {
    const res = await app.request("/cards/..%2F..%2Fetc/passwd.jpg")
    // Even if path.join resolves traversal, file won't exist → 404
    expect(res.status).toBe(404)
  })

  it("returns 404 for traversal in filename", async () => {
    const res = await app.request("/cards/1st/..%2F..%2F..%2Fetc%2Fpasswd.jpg")
    expect(res.status).toBe(404)
  })

  it("returns 404 for null bytes in setId", async () => {
    const res = await app.request("/cards/1st%00malicious/001.jpg")
    expect(res.status).toBe(404)
  })

  it("returns 404 for very long setId", async () => {
    const longSetId = "a".repeat(500)
    const res = await app.request(`/cards/${longSetId}/001.jpg`)
    expect(res.status).toBe(404)
  })

  it("returns 404 for cardback with traversal", async () => {
    const res = await app.request("/cards/..%2Fcardback.jpg")
    // This hits /:setId/:filename, not /cardback.jpg — no filename → 404
    expect(res.status).toBe(404)
  })
})

// ─── Path.join normalization verification ────────────────────────────────────

describe("path.join traversal normalization", () => {
  it("path.join resolves ../ in setId — breaking out of cards/", () => {
    const assetsDir = "/app/data/assets"
    // path.join(base, "cards", "../../etc", "passwd.jpg") resolves the ../..
    // from "cards" level: cards → assets → data, then into etc
    const resolved = path.join(assetsDir, "cards", "../../etc", "passwd.jpg")
    expect(resolved).toBe("/app/data/etc/passwd.jpg")
    // Escapes the intended cards directory
    expect(resolved.startsWith(path.join(assetsDir, "cards"))).toBe(false)
  })

  it("path.join resolves ../ in filename — breaking out of assets/", () => {
    const assetsDir = "/app/data/assets"
    // "1st" + "../../../etc/passwd.jpg" goes: 1st→cards→assets→data, then etc
    const resolved = path.join(assetsDir, "cards", "1st", "../../../etc/passwd.jpg")
    expect(resolved).toBe("/app/data/etc/passwd.jpg")
    expect(resolved.startsWith(path.join(assetsDir, "cards"))).toBe(false)
  })
})
