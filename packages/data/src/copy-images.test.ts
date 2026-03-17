import { describe, test, expect } from "bun:test"
import path from "path"

/**
 * copy-images.ts strips leading zeros from image filenames:
 *   "001.jpg" → parseInt("001", 10) → 1 → "1.jpg"
 *
 * These tests verify the leading-zero stripping logic used in the pipeline
 * without touching the filesystem.
 */

function stripLeadingZeros(filename: string): string | null {
  const num = parseInt(path.basename(filename, ".jpg"), 10)
  if (isNaN(num)) return null
  return `${num}.jpg`
}

describe("image filename leading-zero stripping", () => {
  test("001.jpg → 1.jpg", () => {
    expect(stripLeadingZeros("001.jpg")).toBe("1.jpg")
  })

  test("010.jpg → 10.jpg", () => {
    expect(stripLeadingZeros("010.jpg")).toBe("10.jpg")
  })

  test("100.jpg → 100.jpg (no change)", () => {
    expect(stripLeadingZeros("100.jpg")).toBe("100.jpg")
  })

  test("0.jpg → 0.jpg", () => {
    expect(stripLeadingZeros("0.jpg")).toBe("0.jpg")
  })

  test("non-numeric filename returns null", () => {
    expect(stripLeadingZeros("cardback.jpg")).toBeNull()
  })

  test("empty basename returns null", () => {
    expect(stripLeadingZeros(".jpg")).toBeNull()
  })

  test("handles path with directory", () => {
    expect(stripLeadingZeros("some/path/007.jpg")).toBe("7.jpg")
  })

  test("large card numbers preserved", () => {
    expect(stripLeadingZeros("0500.jpg")).toBe("500.jpg")
  })
})
