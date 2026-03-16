/**
 * Scans card JSON files and appends a { "type": "rebuild_realm" } effect object
 * to cards whose description indicates they can rebuild a razed realm.
 *
 * Usage: bun run src/tags/tag-rebuild-realm.ts [file...]
 *   If no files given, defaults to cards/1st.json
 *
 * Matching rules:
 *   - Description contains "rebuild" AND ("razed" OR "realm")
 *   - "restores one razed realm" style wording also matches
 *   - Excludes cards that only PREVENT rebuilding (e.g. "cannot...rebuild")
 *   - Excludes trigger-only phrasing ("when this realm is rebuilt")
 *
 * Idempotent: skips cards that already have an effect with type "rebuild_realm".
 * Safe to append: never overwrites other effects already on the card.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { join, basename } from "node:path"
import type { EffectTag } from "./types.ts"

interface CardEntry {
  setId: string
  cardNumber: number
  name: string
  description: string
  typeId: number
  effects: EffectTag[]
  [key: string]: unknown
}

const EFFECT_TYPE = "rebuild_realm"

const REBUILD_PATTERN = /\brebuil[dt]\b/i
const REALM_OR_RAZED = /\b(razed|realm)\b/i
const RESTORE_RAZED = /\brestore[sd]?\b.*\brazed\b/i
const NEGATION_PATTERN = /\b(cannot|can't|no\s+player\s+can|prevent)\b.*\brebuild\b/i
const TRIGGER_PATTERN = /\b(when|if)\b.*\brebuilt\b/i

function shouldTag(desc: string): boolean {
  const lower = desc.toLowerCase()

  if (NEGATION_PATTERN.test(lower)) return false

  if (
    TRIGGER_PATTERN.test(lower) &&
    !REALM_OR_RAZED.test(lower.replace(/\b(when|if)\b.*?\brebuilt\b/, ""))
  ) {
    return false
  }

  if (REBUILD_PATTERN.test(lower) && (REALM_OR_RAZED.test(lower) || /\brebuild it\b/i.test(lower)))
    return true

  if (RESTORE_RAZED.test(lower)) return true

  return false
}

function alreadyTagged(effects: EffectTag[]): boolean {
  return effects.some((e) => e.type === EFFECT_TYPE)
}

function processFile(filePath: string): number {
  const raw = readFileSync(filePath, "utf-8")
  const cards: CardEntry[] = JSON.parse(raw)
  let text = raw
  let tagged = 0

  for (const card of cards) {
    if (!card.description) continue
    if (alreadyTagged(card.effects)) continue
    if (!shouldTag(card.description)) continue

    tagged++
    console.log(
      `  [+] #${card.cardNumber} ${card.name} (type ${card.typeId}): "${card.description.slice(0, 80)}..."`,
    )

    // Append the new effect object to the existing effects array.
    // We do targeted text replacement to avoid reformatting the whole file.
    const nameEscaped = card.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

    if (card.effects.length === 0) {
      // Empty array: replace [] with [{"type":"rebuild_realm"}]
      const pattern = new RegExp(`("name":\\s*"${nameEscaped}"[\\s\\S]*?"effects":\\s*)\\[\\]`)
      const replacement = `$1[{"type":"${EFFECT_TYPE}"}]`
      const newText = text.replace(pattern, replacement)
      if (newText === text) {
        console.log(`  [!] Could not patch #${card.cardNumber} ${card.name}`)
      } else {
        text = newText
      }
    } else {
      // Non-empty array: append before closing bracket
      const pattern = new RegExp(
        `("name":\\s*"${nameEscaped}"[\\s\\S]*?"effects":\\s*\\[[\\s\\S]*?)(\\])`,
      )
      const replacement = `$1,{"type":"${EFFECT_TYPE}"}$2`
      const newText = text.replace(pattern, replacement)
      if (newText === text) {
        console.log(`  [!] Could not patch #${card.cardNumber} ${card.name}`)
      } else {
        text = newText
      }
    }
  }

  if (tagged > 0) {
    writeFileSync(filePath, text)
    console.log(`  → ${tagged} card(s) tagged in ${basename(filePath)}`)
  } else {
    console.log(`  → no new cards to tag in ${basename(filePath)}`)
  }

  return tagged
}

// ─── Main ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const files = args.length > 0 ? args : [join(import.meta.dir, "..", "..", "cards", "1st.json")]

console.log(`Scanning for "${EFFECT_TYPE}" effect...\n`)

let total = 0
for (const f of files) {
  console.log(basename(f))
  total += processFile(f)
}

console.log(`\nDone. ${total} card(s) tagged total.`)
