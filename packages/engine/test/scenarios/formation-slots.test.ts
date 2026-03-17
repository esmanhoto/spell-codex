import { describe, test, expect } from "bun:test"
import { getLegalRealmSlots } from "../../src/legal-moves.ts"
import type { Formation } from "../../src/types.ts"
import { inst, makeRealm } from "../scenario-builders.ts"

function makeSlot(id: string) {
  return {
    realm: inst(id, makeRealm({ cardNumber: parseInt(id, 36) })),
    isRazed: false,
    holdings: [],
  }
}

// ─── Size 6 formation slots (already partially covered) ─────────────────────

describe("getLegalRealmSlots: size 6", () => {
  test("empty formation: only A legal", () => {
    const f: Formation = { size: 6, slots: {} }
    expect(getLegalRealmSlots(f)).toEqual(["A"])
  })

  test("A filled: B and C legal", () => {
    const f: Formation = { size: 6, slots: { A: makeSlot("a") } }
    expect(getLegalRealmSlots(f)).toEqual(["B", "C"])
  })

  test("A+B filled: C legal but not D/E/F", () => {
    const f: Formation = { size: 6, slots: { A: makeSlot("a"), B: makeSlot("b") } }
    expect(getLegalRealmSlots(f)).toEqual(["C"])
  })

  test("A+B+C filled: D, E, F legal", () => {
    const f: Formation = {
      size: 6,
      slots: { A: makeSlot("a"), B: makeSlot("b"), C: makeSlot("c") },
    }
    expect(getLegalRealmSlots(f)).toEqual(["D", "E", "F"])
  })

  test("full size 6: no legal slots", () => {
    const f: Formation = {
      size: 6,
      slots: {
        A: makeSlot("a"),
        B: makeSlot("b"),
        C: makeSlot("c"),
        D: makeSlot("d"),
        E: makeSlot("e"),
        F: makeSlot("f"),
      },
    }
    expect(getLegalRealmSlots(f)).toEqual([])
  })
})

// ─── Size 8 formation slots ─────────────────────────────────────────────────

describe("getLegalRealmSlots: size 8", () => {
  test("D+E+F filled: G and H become legal", () => {
    const f: Formation = {
      size: 8,
      slots: {
        A: makeSlot("a"),
        B: makeSlot("b"),
        C: makeSlot("c"),
        D: makeSlot("d"),
        E: makeSlot("e"),
        F: makeSlot("f"),
      },
    }
    expect(getLegalRealmSlots(f)).toEqual(["G", "H"])
  })

  test("D+E filled but not F: G and H NOT legal", () => {
    const f: Formation = {
      size: 8,
      slots: {
        A: makeSlot("a"),
        B: makeSlot("b"),
        C: makeSlot("c"),
        D: makeSlot("d"),
        E: makeSlot("e"),
      },
    }
    const legal = getLegalRealmSlots(f)
    expect(legal).toContain("F")
    expect(legal).not.toContain("G")
    expect(legal).not.toContain("H")
  })

  test("full size 8: no legal slots", () => {
    const f: Formation = {
      size: 8,
      slots: {
        A: makeSlot("a"),
        B: makeSlot("b"),
        C: makeSlot("c"),
        D: makeSlot("d"),
        E: makeSlot("e"),
        F: makeSlot("f"),
        G: makeSlot("g"),
        H: makeSlot("h"),
      },
    }
    expect(getLegalRealmSlots(f)).toEqual([])
  })

  test("size 6 with D+E+F: G and H NOT legal (size too small)", () => {
    const f: Formation = {
      size: 6,
      slots: {
        A: makeSlot("a"),
        B: makeSlot("b"),
        C: makeSlot("c"),
        D: makeSlot("d"),
        E: makeSlot("e"),
        F: makeSlot("f"),
      },
    }
    expect(getLegalRealmSlots(f)).toEqual([])
  })
})

// ─── Size 10 formation slots ────────────────────────────────────────────────

describe("getLegalRealmSlots: size 10", () => {
  test("G+H filled: I and J become legal", () => {
    const f: Formation = {
      size: 10,
      slots: {
        A: makeSlot("a"),
        B: makeSlot("b"),
        C: makeSlot("c"),
        D: makeSlot("d"),
        E: makeSlot("e"),
        F: makeSlot("f"),
        G: makeSlot("g"),
        H: makeSlot("h"),
      },
    }
    expect(getLegalRealmSlots(f)).toEqual(["I", "J"])
  })

  test("G filled but not H: I and J NOT legal", () => {
    const f: Formation = {
      size: 10,
      slots: {
        A: makeSlot("a"),
        B: makeSlot("b"),
        C: makeSlot("c"),
        D: makeSlot("d"),
        E: makeSlot("e"),
        F: makeSlot("f"),
        G: makeSlot("g"),
      },
    }
    const legal = getLegalRealmSlots(f)
    expect(legal).toContain("H")
    expect(legal).not.toContain("I")
    expect(legal).not.toContain("J")
  })

  test("full size 10: no legal slots", () => {
    const f: Formation = {
      size: 10,
      slots: {
        A: makeSlot("a"),
        B: makeSlot("b"),
        C: makeSlot("c"),
        D: makeSlot("d"),
        E: makeSlot("e"),
        F: makeSlot("f"),
        G: makeSlot("g"),
        H: makeSlot("h"),
        I: makeSlot("i"),
        J: makeSlot("j"),
      },
    }
    expect(getLegalRealmSlots(f)).toEqual([])
  })

  test("size 8 with G+H: I and J NOT legal (size too small)", () => {
    const f: Formation = {
      size: 8,
      slots: {
        A: makeSlot("a"),
        B: makeSlot("b"),
        C: makeSlot("c"),
        D: makeSlot("d"),
        E: makeSlot("e"),
        F: makeSlot("f"),
        G: makeSlot("g"),
        H: makeSlot("h"),
      },
    }
    expect(getLegalRealmSlots(f)).toEqual([])
  })
})
