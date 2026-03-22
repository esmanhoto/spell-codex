import { describe, it, expect, beforeEach } from "bun:test"
import {
  classifyWarningCode,
  readSuppressedWarnings,
  persistSuppressedWarnings,
  type WarningCode,
} from "./warnings.ts"

// ─── classifyWarningCode ─────────────────────────────────────────────────────

describe("classifyWarningCode", () => {
  describe("from string message", () => {
    it("Rule of Cosmos → duplicate_in_game", () => {
      expect(classifyWarningCode("Rule of Cosmos violation")).toBe("duplicate_in_game")
    })

    it("duplicate in-play cosmos → duplicate_in_game", () => {
      expect(classifyWarningCode("duplicate in-play cosmos detected")).toBe("duplicate_in_game")
    })

    it("world mismatch → world_mismatch_attachment", () => {
      expect(classifyWarningCode("world mismatch on attachment")).toBe("world_mismatch_attachment")
    })

    it("holding + realm + world → world_mismatch_attachment", () => {
      expect(classifyWarningCode("holding cannot attach to realm — wrong world")).toBe(
        "world_mismatch_attachment",
      )
    })

    it("magical item + champion + world → world_mismatch_attachment", () => {
      expect(classifyWarningCode("magical item on champion from different world")).toBe(
        "world_mismatch_attachment",
      )
    })

    it("structural → structural_error", () => {
      expect(classifyWarningCode("structural issue found")).toBe("structural_error")
    })

    it("invalid → structural_error", () => {
      expect(classifyWarningCode("invalid card state")).toBe("structural_error")
    })

    it("card instance → structural_error", () => {
      expect(classifyWarningCode("card instance not found")).toBe("structural_error")
    })

    it("cannot switch to semi_auto → structural_error", () => {
      expect(classifyWarningCode("cannot switch to semi_auto mode")).toBe("structural_error")
    })

    it("unknown message → generic_warning", () => {
      expect(classifyWarningCode("something unexpected happened")).toBe("generic_warning")
    })

    it("case insensitive matching", () => {
      expect(classifyWarningCode("RULE OF COSMOS violated")).toBe("duplicate_in_game")
      expect(classifyWarningCode("WORLD MISMATCH detected")).toBe("world_mismatch_attachment")
    })
  })

  describe("from object with code", () => {
    it("COSMOS_VIOLATION → duplicate_in_game", () => {
      expect(classifyWarningCode({ code: "COSMOS_VIOLATION" })).toBe("duplicate_in_game")
    })

    it("COSMOS_DUPLICATE_IN_PLAY → duplicate_in_game", () => {
      expect(classifyWarningCode({ code: "COSMOS_DUPLICATE_IN_PLAY" })).toBe("duplicate_in_game")
    })

    it("WORLD_MISMATCH_HOLDING → world_mismatch_attachment", () => {
      expect(classifyWarningCode({ code: "WORLD_MISMATCH_HOLDING" })).toBe("world_mismatch_attachment")
    })

    it("WORLD_MISMATCH_MAGICAL_ITEM → world_mismatch_attachment", () => {
      expect(classifyWarningCode({ code: "WORLD_MISMATCH_MAGICAL_ITEM" })).toBe(
        "world_mismatch_attachment",
      )
    })

    it("MANUAL_STATE_INVALID → structural_error", () => {
      expect(classifyWarningCode({ code: "MANUAL_STATE_INVALID" })).toBe("structural_error")
    })

    it("STRUCTURAL_ prefix → structural_error", () => {
      expect(classifyWarningCode({ code: "STRUCTURAL_SOMETHING" })).toBe("structural_error")
    })

    it("INVALID_TARGET → structural_error", () => {
      expect(classifyWarningCode({ code: "INVALID_TARGET" })).toBe("structural_error")
    })

    it("TARGET_NOT_FOUND → structural_error", () => {
      expect(classifyWarningCode({ code: "TARGET_NOT_FOUND" })).toBe("structural_error")
    })

    it("unknown code falls back to message classification", () => {
      expect(
        classifyWarningCode({ code: "UNKNOWN_CODE", message: "rule of cosmos issue" }),
      ).toBe("duplicate_in_game")
    })

    it("unknown code + no message → generic_warning", () => {
      expect(classifyWarningCode({ code: "UNKNOWN_CODE" })).toBe("generic_warning")
    })

    it("no code + no message → generic_warning", () => {
      expect(classifyWarningCode({})).toBe("generic_warning")
    })

    it("code takes precedence over message", () => {
      expect(
        classifyWarningCode({ code: "COSMOS_VIOLATION", message: "structural issue" }),
      ).toBe("duplicate_in_game")
    })
  })
})

// ─── localStorage persistence ────────────────────────────────────────────────

describe("readSuppressedWarnings / persistSuppressedWarnings", () => {
  beforeEach(() => {
    // reset localStorage for each test
    if (typeof globalThis.localStorage !== "undefined") {
      globalThis.localStorage.clear()
    }
  })

  it("returns empty set when nothing stored", () => {
    const result = readSuppressedWarnings()
    expect(result.size).toBe(0)
  })

  it("round-trips through persist + read", () => {
    if (typeof globalThis.localStorage === "undefined") return // skip in non-DOM

    const codes = new Set<WarningCode>(["duplicate_in_game", "structural_error"])
    persistSuppressedWarnings(codes)
    const result = readSuppressedWarnings()
    expect(result.has("duplicate_in_game")).toBe(true)
    expect(result.has("structural_error")).toBe(true)
    expect(result.has("generic_warning")).toBe(false)
  })

  it("handles corrupt localStorage gracefully", () => {
    if (typeof globalThis.localStorage === "undefined") return

    globalThis.localStorage.setItem("spell.warning.suppressed", "not-json!!!")
    const result = readSuppressedWarnings()
    expect(result.size).toBe(0)
  })
})
