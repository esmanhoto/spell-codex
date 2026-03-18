import { describe, test, expect } from "bun:test"
import { getLegalRealmSlots } from "../../src/legal-moves.ts"
import type { Formation, FormationSlot } from "../../src/types.ts"
import { inst, makeRealm } from "../scenario-builders.ts"

function makeSlot(id: string) {
  return {
    realm: inst(id, makeRealm({ cardNumber: parseInt(id, 36) })),
    isRazed: false,
    holdings: [],
  }
}

function formation(size: 6 | 8 | 10, filled: string[]): Formation {
  return {
    size,
    slots: Object.fromEntries(filled.map((id) => [id, makeSlot(id.toLowerCase())])),
  }
}

describe("getLegalRealmSlots", () => {
  const cases: Array<{ size: 6 | 8 | 10; filled: string[]; expected: FormationSlot[]; label: string }> = [
    // Size 6
    { size: 6, filled: [], expected: ["A"], label: "size 6: empty → only A" },
    { size: 6, filled: ["A"], expected: ["B", "C"], label: "size 6: A → B,C" },
    { size: 6, filled: ["A", "B"], expected: ["C"], label: "size 6: A+B → C" },
    { size: 6, filled: ["A", "B", "C"], expected: ["D", "E", "F"], label: "size 6: A+B+C → D,E,F" },
    { size: 6, filled: ["A", "B", "C", "D", "E", "F"], expected: [], label: "size 6: full → none" },
    // Size 8
    { size: 8, filled: ["A", "B", "C", "D", "E", "F"], expected: ["G", "H"], label: "size 8: D+E+F filled → G,H" },
    { size: 8, filled: ["A", "B", "C", "D", "E", "F", "G", "H"], expected: [], label: "size 8: full → none" },
    // Size 10
    { size: 10, filled: ["A", "B", "C", "D", "E", "F", "G", "H"], expected: ["I", "J"], label: "size 10: G+H filled → I,J" },
    { size: 10, filled: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], expected: [], label: "size 10: full → none" },
  ]

  for (const { size, filled, expected, label } of cases) {
    test(label, () => {
      expect(getLegalRealmSlots(formation(size, filled))).toEqual(expected)
    })
  }

  test("size 8: D+E filled but not F → F legal, G/H not", () => {
    const legal = getLegalRealmSlots(formation(8, ["A", "B", "C", "D", "E"]))
    expect(legal).toContain("F")
    expect(legal).not.toContain("G")
    expect(legal).not.toContain("H")
  })

  test("size 10: G filled but not H → H legal, I/J not", () => {
    const legal = getLegalRealmSlots(formation(10, ["A", "B", "C", "D", "E", "F", "G"]))
    expect(legal).toContain("H")
    expect(legal).not.toContain("I")
    expect(legal).not.toContain("J")
  })

  test("size 6 with D+E+F: G/H not legal (size too small)", () => {
    expect(getLegalRealmSlots(formation(6, ["A", "B", "C", "D", "E", "F"]))).toEqual([])
  })

  test("size 8 with G+H: I/J not legal (size too small)", () => {
    expect(getLegalRealmSlots(formation(8, ["A", "B", "C", "D", "E", "F", "G", "H"]))).toEqual([])
  })
})
