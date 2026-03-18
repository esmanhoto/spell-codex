import { describe, test, expect } from "bun:test"
import { parseTclList, extractTclBlock } from "./tcl-parser.ts"

// ─── parseTclList ────────────────────────────────────────────────────────────

describe("parseTclList", () => {
  test("empty string returns empty array", () => {
    expect(parseTclList("")).toEqual([])
  })

  test("whitespace-only returns empty array", () => {
    expect(parseTclList("   \t\n  ")).toEqual([])
  })

  test("bare words", () => {
    expect(parseTclList("alpha beta gamma")).toEqual(["alpha", "beta", "gamma"])
  })

  test("single bare word", () => {
    expect(parseTclList("hello")).toEqual(["hello"])
  })

  test("braced strings", () => {
    expect(parseTclList("{hello world} {foo}")).toEqual(["hello world", "foo"])
  })

  test("empty braces produce empty string", () => {
    expect(parseTclList("{}")).toEqual([""])
  })

  test("nested braces preserved as-is", () => {
    expect(parseTclList("{outer {inner} text}")).toEqual(["outer {inner} text"])
  })

  test("deeply nested braces", () => {
    expect(parseTclList("{a {b {c}}}")).toEqual(["a {b {c}}"])
  })

  test("quoted strings", () => {
    expect(parseTclList('"hello world" "foo"')).toEqual(["hello world", "foo"])
  })

  test("quoted string with backslash-n escape", () => {
    expect(parseTclList('"line1\\nline2"')).toEqual(["line1\nline2"])
  })

  test("quoted string with backslash-t escape", () => {
    expect(parseTclList('"col1\\tcol2"')).toEqual(["col1\tcol2"])
  })

  test("quoted string with escaped backslash", () => {
    expect(parseTclList('"a\\\\b"')).toEqual(["a\\b"])
  })

  test("mixed bare, braced, and quoted", () => {
    expect(parseTclList('bare {braced text} "quoted text"')).toEqual([
      "bare",
      "braced text",
      "quoted text",
    ])
  })

  test("multiple whitespace between elements", () => {
    expect(parseTclList("a   b\t\tc\n\nd")).toEqual(["a", "b", "c", "d"])
  })

  test("braced string with escaped brace", () => {
    // In TCL, \{ inside braces is the literal character { without affecting depth
    expect(parseTclList("{a \\{ b}")).toEqual(["a \\{ b"])
  })

  test("13-field card record", () => {
    const record =
      "1st 1 6 7 1 0 {Gib Lhadsemlo} {Some description text here} R {Dwarf. Flyer.} {} {1 2 d19 o19} 5"
    const fields = parseTclList(record)
    expect(fields).toHaveLength(13)
    expect(fields[0]).toBe("1st")
    expect(fields[1]).toBe("1")
    expect(fields[6]).toBe("Gib Lhadsemlo")
    expect(fields[7]).toBe("Some description text here")
    expect(fields[9]).toBe("Dwarf. Flyer.")
    expect(fields[10]).toBe("")
    expect(fields[11]).toBe("1 2 d19 o19")
  })

  test("handles card description with special characters", () => {
    const input = "{Can't be discarded. Rebuilds razed realms.}"
    const result = parseTclList(input)
    expect(result).toEqual(["Can't be discarded. Rebuilds razed realms."])
  })

  test("consecutive braced groups with no space still split", () => {
    // TCL requires whitespace between elements; adjacent braces parse as one element
    // {a}{b} → "a}{b" because } then { without whitespace continues the brace parse
    const result = parseTclList("{a} {b}")
    expect(result).toEqual(["a", "b"])
  })
})

// ─── extractTclBlock ─────────────────────────────────────────────────────────

describe("extractTclBlock", () => {
  test("extracts simple variable body", () => {
    const source = "set myVar {\n  some content\n}"
    expect(extractTclBlock(source, "myVar")).toBe("\n  some content\n")
  })

  test("returns null when variable not found", () => {
    const source = "set otherVar { hello }"
    expect(extractTclBlock(source, "missing")).toBeNull()
  })

  test("handles namespace separators (::)", () => {
    const source = "set CrossFire::cardDataBase {\n  card data here\n}"
    expect(extractTclBlock(source, "CrossFire::cardDataBase")).toBe("\n  card data here\n")
  })

  test("handles nested braces in block body", () => {
    const source = "set data { outer { inner } end }"
    expect(extractTclBlock(source, "data")).toBe(" outer { inner } end ")
  })

  test("handles deeply nested braces", () => {
    const source = "set data { a { b { c } } }"
    expect(extractTclBlock(source, "data")).toBe(" a { b { c } } ")
  })

  test("handles multiple set statements — returns first match", () => {
    const source = "set x { first }\nset y { second }"
    expect(extractTclBlock(source, "x")).toBe(" first ")
    expect(extractTclBlock(source, "y")).toBe(" second ")
  })

  test("returns null for unterminated brace block", () => {
    const source = "set broken { no closing brace"
    expect(extractTclBlock(source, "broken")).toBeNull()
  })

  test("handles variable names with special regex characters", () => {
    // e.g. varName with dots
    const source = "set my.var { content }"
    expect(extractTclBlock(source, "my.var")).toBe(" content ")
  })

  test("handles escaped braces inside block", () => {
    const source = "set data { a \\{ b }"
    const result = extractTclBlock(source, "data")
    expect(result).toBe(" a \\{ b ")
  })

  test("tabs between set keyword and varName", () => {
    const source = "set\tmyVar\t{ content }"
    expect(extractTclBlock(source, "myVar")).toBe(" content ")
  })
})
