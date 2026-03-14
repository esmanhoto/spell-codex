/**
 * Shared formatting utilities for effect tag insertion.
 * Produces readable multi-line JSON for inserted objects without
 * reformatting the surrounding file.
 */

/**
 * Formats an effect object for insertion into the effects array.
 * - Simple objects (≤ 2 keys, all primitives) stay on one line.
 * - Larger objects get each top-level key on its own line.
 *   Nested objects remain inline (one level deep).
 *
 * `arrayIndent` is the whitespace that precedes the `"effects"` key in the file
 * (e.g. "    " for 4-space indented card objects). Used to align the brackets.
 */
export function formatEffect(effect: Record<string, unknown>, arrayIndent: string): string {
  const entries = Object.entries(effect)
  const propIndent = arrayIndent + "    "

  // Small objects (≤ 2 top-level primitive keys) → one line
  const allPrimitive = entries.every(([, v]) => typeof v !== "object" || v === null)
  if (allPrimitive && entries.length <= 2) {
    return JSON.stringify(effect)
  }

  // Larger objects → multi-line with nested objects inline
  const lines = entries.map(([k, v]) => {
    const val =
      v !== null && typeof v === "object" && !Array.isArray(v)
        ? JSON.stringify(v)
        : JSON.stringify(v)
    return `${propIndent}"${k}": ${val}`
  })

  const objIndent = arrayIndent + "  "
  return `{\n${lines.join(",\n")}\n${objIndent}}`
}

/**
 * Builds the replacement string for an effects array, inserting `effectJson`
 * (already formatted) into an empty `[]` or appending to an existing array.
 *
 * Handles two cases:
 *   []                                    → [<effectJson>]  (one-line for small objects)
 *   [existing]                            → [existing,<effectJson>]
 */
export function buildEffectsReplacement(
  currentEffectsJson: string,
  effectJson: string,
): string {
  if (currentEffectsJson.trim() === "[]") {
    return `[${effectJson}]`
  }
  // Append before closing bracket
  return currentEffectsJson.replace(/\]$/, `,${effectJson}]`)
}
