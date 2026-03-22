import { describe, it, expect } from "bun:test"
import { moveInvolves, labelMove, ANCHOR_FREE_TYPES } from "./move-helpers.ts"
import type { Move } from "../api.ts"

// ─── moveInvolves ────────────────────────────────────────────────────────────

describe("moveInvolves", () => {
  it("PLAY_REALM matches cardInstanceId", () => {
    const m: Move = { type: "PLAY_REALM", cardInstanceId: "r1", slot: "0" }
    expect(moveInvolves(m, "r1")).toBe(true)
    expect(moveInvolves(m, "other")).toBe(false)
  })

  it("PLACE_CHAMPION matches cardInstanceId", () => {
    const m: Move = { type: "PLACE_CHAMPION", cardInstanceId: "ch1" }
    expect(moveInvolves(m, "ch1")).toBe(true)
  })

  it("ATTACH_ITEM matches both cardInstanceId and championId", () => {
    const m: Move = { type: "ATTACH_ITEM", cardInstanceId: "item1", championId: "ch1" }
    expect(moveInvolves(m, "item1")).toBe(true)
    expect(moveInvolves(m, "ch1")).toBe(true)
    expect(moveInvolves(m, "other")).toBe(false)
  })

  it("DECLARE_ATTACK matches championId", () => {
    const m: Move = { type: "DECLARE_ATTACK", championId: "ch1", targetPlayerId: "p2", targetRealmSlot: "0" }
    expect(moveInvolves(m, "ch1")).toBe(true)
    expect(moveInvolves(m, "p2")).toBe(false)
  })

  it("DECLARE_DEFENSE matches championId", () => {
    const m: Move = { type: "DECLARE_DEFENSE", championId: "ch1" }
    expect(moveInvolves(m, "ch1")).toBe(true)
  })

  it("CONTINUE_ATTACK matches championId", () => {
    const m: Move = { type: "CONTINUE_ATTACK", championId: "ch1" }
    expect(moveInvolves(m, "ch1")).toBe(true)
  })

  it("SWAP_COMBAT_CHAMPION matches newChampionId", () => {
    const m = { type: "SWAP_COMBAT_CHAMPION", newChampionId: "ch2", side: "attacker", oldChampionDestination: "pool" } as unknown as Move
    expect(moveInvolves(m, "ch2")).toBe(true)
    expect(moveInvolves(m, "other")).toBe(false)
  })

  it("PLAY_COMBAT_CARD matches cardInstanceId", () => {
    const m: Move = { type: "PLAY_COMBAT_CARD", cardInstanceId: "sc1" }
    expect(moveInvolves(m, "sc1")).toBe(true)
  })

  it("DISCARD_CARD matches cardInstanceId", () => {
    const m: Move = { type: "DISCARD_CARD", cardInstanceId: "d1" }
    expect(moveInvolves(m, "d1")).toBe(true)
  })

  it("RETURN_COMBAT_CARD_TO_POOL matches cardInstanceId", () => {
    const m: Move = { type: "RETURN_COMBAT_CARD_TO_POOL", cardInstanceId: "rc1" }
    expect(moveInvolves(m, "rc1")).toBe(true)
  })

  it("RETURN_COMBAT_CARD_TO_HAND matches cardInstanceId", () => {
    const m: Move = { type: "RETURN_COMBAT_CARD_TO_HAND", cardInstanceId: "rc1" }
    expect(moveInvolves(m, "rc1")).toBe(true)
  })

  it("ALLOW_CHAMPION_REUSE matches cardInstanceId", () => {
    const m: Move = { type: "ALLOW_CHAMPION_REUSE", cardInstanceId: "ch1" } as unknown as Move
    expect(moveInvolves(m, "ch1")).toBe(true)
  })

  it("PASS never involves any card", () => {
    expect(moveInvolves({ type: "PASS" }, "anything")).toBe(false)
  })

  it("END_TURN never involves any card", () => {
    expect(moveInvolves({ type: "END_TURN" }, "anything")).toBe(false)
  })

  it("STOP_PLAYING never involves any card", () => {
    expect(moveInvolves({ type: "STOP_PLAYING" }, "anything")).toBe(false)
  })

  it("all cardInstanceId-based move types", () => {
    const types = [
      "PLAY_REALM", "PLAY_HOLDING", "PLACE_CHAMPION", "PLAY_PHASE3_CARD",
      "PLAY_PHASE5_CARD", "PLAY_RULE_CARD", "PLAY_EVENT", "PLAY_COMBAT_CARD",
      "DISCARD_CARD", "RETURN_COMBAT_CARD_TO_POOL", "RETURN_COMBAT_CARD_TO_HAND",
      "ALLOW_CHAMPION_REUSE",
    ] as const
    for (const type of types) {
      const m = { type, cardInstanceId: "x" } as unknown as Move
      expect(moveInvolves(m, "x")).toBe(true)
      expect(moveInvolves(m, "y")).toBe(false)
    }
  })
})

// ─── labelMove ───────────────────────────────────────────────────────────────

describe("labelMove", () => {
  const nameOf = (id: string) => `<${id}>`

  it("PASS → Draw cards", () => {
    expect(labelMove({ type: "PASS" }, nameOf)).toBe("Draw cards")
  })

  it("END_TURN → End Turn", () => {
    expect(labelMove({ type: "END_TURN" }, nameOf)).toBe("End Turn")
  })

  it("PLAY_REALM includes card name and slot", () => {
    const label = labelMove({ type: "PLAY_REALM", cardInstanceId: "r1", slot: "2" }, nameOf)
    expect(label).toContain("<r1>")
    expect(label).toContain("slot 2")
  })

  it("PLACE_CHAMPION includes card name", () => {
    expect(labelMove({ type: "PLACE_CHAMPION", cardInstanceId: "ch1" }, nameOf)).toContain("<ch1>")
  })

  it("ATTACH_ITEM includes both card and champion names", () => {
    const label = labelMove(
      { type: "ATTACH_ITEM", cardInstanceId: "item1", championId: "ch1" },
      nameOf,
    )
    expect(label).toContain("<item1>")
    expect(label).toContain("<ch1>")
  })

  it("DECLARE_ATTACK includes champion and slot", () => {
    const label = labelMove(
      { type: "DECLARE_ATTACK", championId: "ch1", targetPlayerId: "p2", targetRealmSlot: "1" },
      nameOf,
    )
    expect(label).toContain("<ch1>")
    expect(label).toContain("slot 1")
  })

  it("SET_COMBAT_LEVEL includes level number", () => {
    const label = labelMove({ type: "SET_COMBAT_LEVEL", playerId: "p1", level: 7 }, nameOf)
    expect(label).toContain("7")
  })

  it("RESOLVE_DRAW_CARDS includes count", () => {
    const label = labelMove({ type: "RESOLVE_DRAW_CARDS", playerId: "p1", count: 3 }, nameOf)
    expect(label).toContain("3")
  })

  it("RESOLVE_DONE → Done resolving", () => {
    expect(labelMove({ type: "RESOLVE_DONE" }, nameOf)).toBe("Done resolving")
  })

  it("unknown move type returns the type string", () => {
    const m = { type: "FUTURE_MOVE_TYPE" } as unknown as Move
    expect(labelMove(m, nameOf)).toBe("FUTURE_MOVE_TYPE")
  })

  it("covers all known move types without throwing", () => {
    const moves: Move[] = [
      { type: "PASS" },
      { type: "END_TURN" },
      { type: "PLAY_REALM", cardInstanceId: "x", slot: "0" },
      { type: "REBUILD_REALM", slot: "0", cardInstanceIds: ["a", "b", "c"] },
      { type: "PLAY_HOLDING", cardInstanceId: "x", realmSlot: "0" },
      { type: "PLACE_CHAMPION", cardInstanceId: "x" },
      { type: "ATTACH_ITEM", cardInstanceId: "x", championId: "y" },
      { type: "PLAY_PHASE3_CARD", cardInstanceId: "x" },
      { type: "PLAY_PHASE5_CARD", cardInstanceId: "x" },
      { type: "PLAY_RULE_CARD", cardInstanceId: "x" },
      { type: "PLAY_EVENT", cardInstanceId: "x" },
      { type: "DECLARE_ATTACK", championId: "x", targetPlayerId: "p2", targetRealmSlot: "0" },
      { type: "DECLARE_DEFENSE", championId: "x" },
      { type: "DECLINE_DEFENSE" },
      { type: "PLAY_COMBAT_CARD", cardInstanceId: "x" },
      { type: "STOP_PLAYING" },
      { type: "CONTINUE_ATTACK", championId: "x" },
      { type: "END_ATTACK" },
      { type: "INTERRUPT_COMBAT" },
      { type: "DISCARD_CARD", cardInstanceId: "x" },
      { type: "SET_COMBAT_LEVEL", playerId: "p1", level: 5 },
      { type: "SWITCH_COMBAT_SIDE", cardInstanceId: "x" },
      { type: "RETURN_COMBAT_CARD_TO_POOL", cardInstanceId: "x" },
      { type: "RETURN_COMBAT_CARD_TO_HAND", cardInstanceId: "x" },
      { type: "RESOLVE_DONE" },
      { type: "RESOLVE_SET_CARD_DESTINATION", destination: "discard" },
      { type: "RESOLVE_RAZE_REALM", playerId: "p1", slot: "0" },
      { type: "RESOLVE_REBUILD_REALM", playerId: "p1", slot: "0" },
      { type: "RESOLVE_DRAW_CARDS", playerId: "p1", count: 2 },
      { type: "RESOLVE_RETURN_TO_POOL", cardInstanceId: "x" },
      { type: "RESOLVE_MOVE_CARD", cardInstanceId: "x", destination: { zone: "hand", playerId: "p1" } },
      { type: "RESOLVE_ATTACH_CARD", cardInstanceId: "x", targetInstanceId: "y" },
    ]
    for (const m of moves) {
      const result = labelMove(m, nameOf)
      expect(typeof result).toBe("string")
      expect(result.length).toBeGreaterThan(0)
    }
  })
})

// ─── ANCHOR_FREE_TYPES ──────────────────────────────────────────────────────

describe("ANCHOR_FREE_TYPES", () => {
  it("contains expected move types that don't need a card target", () => {
    expect(ANCHOR_FREE_TYPES.has("PASS")).toBe(true)
    expect(ANCHOR_FREE_TYPES.has("END_TURN")).toBe(true)
    expect(ANCHOR_FREE_TYPES.has("STOP_PLAYING")).toBe(true)
    expect(ANCHOR_FREE_TYPES.has("DECLINE_DEFENSE")).toBe(true)
    expect(ANCHOR_FREE_TYPES.has("END_ATTACK")).toBe(true)
    expect(ANCHOR_FREE_TYPES.has("INTERRUPT_COMBAT")).toBe(true)
    expect(ANCHOR_FREE_TYPES.has("REBUILD_REALM")).toBe(true)
    expect(ANCHOR_FREE_TYPES.has("CONTINUE_ATTACK")).toBe(true)
  })

  it("does NOT contain card-targeted move types", () => {
    expect(ANCHOR_FREE_TYPES.has("PLAY_REALM")).toBe(false)
    expect(ANCHOR_FREE_TYPES.has("PLACE_CHAMPION")).toBe(false)
    expect(ANCHOR_FREE_TYPES.has("ATTACH_ITEM")).toBe(false)
    expect(ANCHOR_FREE_TYPES.has("DISCARD_CARD")).toBe(false)
    expect(ANCHOR_FREE_TYPES.has("DECLARE_ATTACK")).toBe(false)
  })
})
