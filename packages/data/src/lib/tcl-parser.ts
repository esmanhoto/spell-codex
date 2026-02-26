/**
 * Parses a TCL list string into an array of string elements.
 *
 * Handles:
 *   {}         → ""            (empty braced group)
 *   {text}     → "text"        (braced string — no substitution, nested braces preserved as-is)
 *   word       → "word"        (bare word)
 *   "text"     → "text"        (quoted string with backslash escapes)
 */
export function parseTclList(input: string): string[] {
  const result: string[] = []
  let i = 0
  const n = input.length

  while (i < n) {
    // Skip whitespace
    while (i < n && isWhitespace(input[i])) i++
    if (i >= n) break

    if (input[i] === "{") {
      // Braced string — find the matching closing brace, counting depth
      let depth = 0
      const start = i + 1
      while (i < n) {
        if (input[i] === "\\") {
          i++ // skip escaped character
        } else if (input[i] === "{") {
          depth++
        } else if (input[i] === "}") {
          depth--
          if (depth === 0) break
        }
        i++
      }
      result.push(input.slice(start, i))
      i++ // skip closing }
    } else if (input[i] === '"') {
      // Quoted string with backslash escape handling
      i++ // skip opening "
      let str = ""
      while (i < n && input[i] !== '"') {
        if (input[i] === "\\") {
          i++
          const ch = input[i] ?? ""
          if (ch === "n") str += "\n"
          else if (ch === "t") str += "\t"
          else str += ch
        } else {
          str += input[i]
        }
        i++
      }
      i++ // skip closing "
      result.push(str)
    } else {
      // Bare word — read until whitespace
      const start = i
      while (i < n && !isWhitespace(input[i])) i++
      result.push(input.slice(start, i))
    }
  }

  return result
}

/**
 * Extracts the body of a TCL variable assignment:
 *   set varName { ...body... }
 *
 * Returns the content between the outer braces, or null if not found.
 * The varName can contain :: (TCL namespace separators).
 */
export function extractTclBlock(source: string, varName: string): string | null {
  // Escape special regex chars in the varName (:: → \:\:, etc.)
  const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(`set\\s+${escaped}\\s*\\{`)
  const match = pattern.exec(source)
  if (!match) return null

  // Start from the opening brace of the block
  let i = match.index + match[0].length - 1
  let depth = 0
  const start = i + 1

  while (i < source.length) {
    if (source[i] === "\\") {
      i++
    } else if (source[i] === "{") {
      depth++
    } else if (source[i] === "}") {
      depth--
      if (depth === 0) return source.slice(start, i)
    }
    i++
  }

  return null
}

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r"
}
