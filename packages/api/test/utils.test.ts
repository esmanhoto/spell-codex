import { describe, it, expect } from "bun:test"
import { formatEmailAsName } from "../src/utils.ts"

describe("formatEmailAsName", () => {
  it("capitalises dot-separated parts", () => {
    expect(formatEmailAsName("eduardo.esmanhoto@gmail.com")).toBe("Eduardo Esmanhoto")
  })

  it("capitalises underscore-separated parts", () => {
    expect(formatEmailAsName("john_doe@example.com")).toBe("John Doe")
  })

  it("capitalises hyphen-separated parts", () => {
    expect(formatEmailAsName("mary-jane@example.com")).toBe("Mary Jane")
  })

  it("handles plus-separated parts", () => {
    expect(formatEmailAsName("user+tag@example.com")).toBe("User Tag")
  })

  it("handles single word prefix", () => {
    expect(formatEmailAsName("alice@example.com")).toBe("Alice")
  })

  it("handles mixed separators", () => {
    expect(formatEmailAsName("first.last-name@example.com")).toBe("First Last Name")
  })

  it("uses full string if no @ present", () => {
    expect(formatEmailAsName("nodomain")).toBe("Nodomain")
  })

  it("filters empty segments from consecutive separators", () => {
    expect(formatEmailAsName("a..b@x.com")).toBe("A B")
  })
})
