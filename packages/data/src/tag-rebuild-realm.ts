/**
 * Scans card JSON files and adds "rebuild_realm" to the effects array
 * for cards whose description indicates they can rebuild a razed realm.
 *
 * Usage: bun run src/tag-rebuild-realm.ts [file...]
 *   If no files given, defaults to cards/1st.json
 *
 * Matching rules:
 *   - Description contains "rebuild" AND ("razed" OR "realm")
 *   - Excludes cards that only PREVENT rebuilding (e.g. "cannot...rebuild")
 *   - Includes: "rebuild one razed realm", "rebuild it instantly",
 *     "rebuilt by a champion", "restores one razed realm"
 */

import { readFileSync, writeFileSync } from "node:fs"
import { join, basename } from "node:path"

interface CardEntry {
  setId: string
  cardNumber: number
  name: string
  description: string
  typeId: number
  effects: string[]
  [key: string]: unknown
}

const EFFECT = "rebuild_realm"

const REBUILD_PATTERN = /\brebuil[dt]\b/i
const REALM_OR_RAZED = /\b(razed|realm)\b/i
const RESTORE_RAZED = /\brestore[sd]?\b.*\brazed\b/i
const NEGATION_PATTERN = /\b(cannot|can't|no\s+player\s+can|prevent)\b.*\brebuild\b/i
// Trigger-only: "when this realm is rebuilt" — card reacts to rebuild, doesn't cause it
const TRIGGER_PATTERN = /\b(when|if)\b.*\brebuilt\b/i

function shouldTag(desc: string): boolean {
  const lower = desc.toLowerCase()

  // Exclude negation patterns — cards that prevent rebuilding
  if (NEGATION_PATTERN.test(lower)) return false

  // Exclude trigger-only — cards that react to being rebuilt, not cause rebuilds
  if (TRIGGER_PATTERN.test(lower) && !REALM_OR_RAZED.test(lower.replace(/\b(when|if)\b.*?\brebuilt\b/, ""))) {
    return false
  }

  // Match: description mentions rebuild + (razed or realm or "it" as pronoun)
  if (REBUILD_PATTERN.test(lower) && (REALM_OR_RAZED.test(lower) || /\brebuild it\b/i.test(lower))) return true

  // Match: "restores one razed realm" style wording
  if (RESTORE_RAZED.test(lower)) return true

  return false
}

function processFile(filePath: string): number {
  const raw = readFileSync(filePath, "utf-8")
  const cards: CardEntry[] = JSON.parse(raw)
  let text = raw
  let tagged = 0

  for (const card of cards) {
    if (!card.description) continue
    if (card.effects.includes(EFFECT)) continue

    if (shouldTag(card.description)) {
      tagged++
      console.log(
        `  [+] #${card.cardNumber} ${card.name} (type ${card.typeId}): "${card.description.slice(0, 80)}..."`,
      )
    }
  }

  if (tagged > 0) {
    // Targeted replacement: only change "effects": [] lines for matched cards.
    // We find each card's block by searching for its unique cardNumber + name combo,
    // then replace the effects line within that block.
    for (const card of cards) {
      if (!card.description || card.effects.includes(EFFECT) || !shouldTag(card.description)) continue

      // Match the "effects": [] line that follows this card's name line
      const nameEscaped = card.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const pattern = new RegExp(
        `("name":\\s*"${nameEscaped}"[\\s\\S]*?"effects":\\s*)\\[\\]`,
      )
      const replacement = `$1["${EFFECT}"]`
      const newText = text.replace(pattern, replacement)
      if (newText === text) {
        console.log(`  [!] Could not patch #${card.cardNumber} ${card.name} — effects may already be non-empty`)
      }
      text = newText
    }

    writeFileSync(filePath, text)
    console.log(`  → ${tagged} card(s) tagged in ${basename(filePath)}`)
  } else {
    console.log(`  → no new cards to tag in ${basename(filePath)}`)
  }

  return tagged
}

// ─── Main ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const files =
  args.length > 0 ? args : [join(import.meta.dir, "..", "cards", "1st.json")]

console.log(`Scanning for "${EFFECT}" effect...\n`)

let total = 0
for (const f of files) {
  console.log(basename(f))
  total += processFile(f)
}

console.log(`\nDone. ${total} card(s) tagged total.`)
