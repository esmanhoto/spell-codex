import { describe, it, expect } from "bun:test"
import { formatEmailAsName } from "./display-name.ts"

describe("formatEmailAsName", () => {
  const cases: Array<[string, string]> = [
    ["eduardo.esmanhoto@gmail.com", "Eduardo Esmanhoto"],
    ["john_doe@example.com", "John Doe"],
    ["mary-jane@example.com", "Mary Jane"],
    ["user+tag@example.com", "User Tag"],
    ["alice@example.com", "Alice"],
    ["first.last-name@example.com", "First Last Name"],
    ["nodomain", "Nodomain"],
    ["a..b@x.com", "A B"],
  ]

  for (const [input, expected] of cases) {
    it(`"${input}" → "${expected}"`, () => {
      expect(formatEmailAsName(input)).toBe(expected)
    })
  }
})
