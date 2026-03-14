/**
 * Tags cards with { "type": "turn_trigger", "timing": "end" }.
 *
 * Matches any card whose description indicates an ability that fires at the
 * end of the owning player's turn.
 *
 * Usage: bun run src/tags/tag-turn-trigger-end.ts [file...]
 *   Defaults to cards/1st.json
 *
 * Matching strategy:
 *   - "at the end of his/the player's turn"
 *   - "end of his turn"
 *
 * Excludes:
 *   - "until the end of the player's next turn" (lasting effect duration, not a trigger)
 *   - "at the end of each player's turn" (global rule card effect, handled separately)
 *
 * Idempotent. Appends to existing effects[].
 */

import { readFileSync, writeFileSync } from "node:fs"
import { join, basename } from "node:path"
import type { EffectTag, TurnTriggerEffect } from "./types.ts"

interface CardEntry {
  setId: string
  cardNumber: number
  name: string
  description: string
  effects: EffectTag[]
  [key: string]: unknown
}

const EFFECT: TurnTriggerEffect = { type: "turn_trigger", timing: "end" }
const EFFECT_JSON = JSON.stringify(EFFECT)

// Matches "at the end of his turn" / "end of his turn" / "end of the player's turn"
const END_PATTERN = /\b(at the end of|end of) (his|the player'?s) turn\b/i

// Exclude duration phrasings and global rule phrasings
const EXCLUDE_UNTIL = /\buntil the end of\b/i
const EXCLUDE_EACH = /\bend of each player'?s turn\b/i

function shouldTag(desc: string): boolean {
  if (EXCLUDE_UNTIL.test(desc)) return false
  if (EXCLUDE_EACH.test(desc)) return false
  return END_PATTERN.test(desc)
}

function alreadyTagged(effects: EffectTag[]): boolean {
  return effects.some(e => e.type === "turn_trigger" && e.timing === "end")
}

function applyPatch(text: string, card: CardEntry): string {
  const nameEscaped = card.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

  if (card.effects.length === 0) {
    const pattern = new RegExp(`("name":\\s*"${nameEscaped}"[\\s\\S]*?"effects":\\s*)\\[\\]`)
    const patched = text.replace(pattern, `$1[${EFFECT_JSON}]`)
    if (patched === text) console.log(`  [!] Could not patch #${card.cardNumber} ${card.name}`)
    return patched
  }

  const pattern = new RegExp(
    `("name":\\s*"${nameEscaped}"[\\s\\S]*?"effects":\\s*\\[[\\s\\S]*?)(\\])`,
  )
  const patched = text.replace(pattern, `$1,${EFFECT_JSON}$2`)
  if (patched === text) console.log(`  [!] Could not patch #${card.cardNumber} ${card.name}`)
  return patched
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
    console.log(`  [+] #${card.cardNumber} ${card.name}: "${card.description.slice(0, 80)}..."`)
    text = applyPatch(text, card)
  }

  if (tagged > 0) {
    writeFileSync(filePath, text)
    console.log(`  → ${tagged} card(s) tagged in ${basename(filePath)}`)
  } else {
    console.log(`  → no new cards to tag in ${basename(filePath)}`)
  }

  return tagged
}

const args = process.argv.slice(2)
const files = args.length > 0 ? args : [join(import.meta.dir, "..", "..", "cards", "1st.json")]

console.log(`Scanning for "turn_trigger / end" effect...\n`)
let total = 0
for (const f of files) {
  console.log(basename(f))
  total += processFile(f)
}
console.log(`\nDone. ${total} card(s) tagged total.`)
