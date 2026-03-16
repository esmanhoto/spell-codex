/**
 * Tags cards with { "type": "turn_trigger", "timing": "start" }.
 *
 * Matches any card whose description indicates an ability that fires at the
 * start (or beginning) of the owning player's turn. The engine will present
 * generic resolution tools (peek draw pile, peek hand, discard from hand, done)
 * and the player decides which tools apply to their card's text.
 *
 * Usage: bun run src/tags/tag-turn-trigger-start.ts [file...]
 *   Defaults to cards/1st.json
 *
 * Matching strategy:
 *   - "at the start of the player's turn"
 *   - "at the beginning of his/its owner's/the player's turn"
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

const EFFECT: TurnTriggerEffect = { type: "turn_trigger", timing: "start" }
const EFFECT_JSON = JSON.stringify(EFFECT)

const START_PATTERN = /\b(at the (start|beginning) of (the player'?s|his|its owner'?s) turn)\b/i

// Rule cards say "Played at the beginning of the player's turn, this card is not discarded."
// Those are chosen actions, not triggered abilities — exclude them.
const EXCLUDE_PLAYED_AT = /\bplayed at the (start|beginning) of\b/i

function shouldTag(desc: string): boolean {
  if (EXCLUDE_PLAYED_AT.test(desc)) return false
  return START_PATTERN.test(desc)
}

function alreadyTagged(effects: EffectTag[]): boolean {
  return effects.some((e) => e.type === "turn_trigger" && e.timing === "start")
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

console.log(`Scanning for "turn_trigger / start" effect...\n`)
let total = 0
for (const f of files) {
  console.log(basename(f))
  total += processFile(f)
}
console.log(`\nDone. ${total} card(s) tagged total.`)
