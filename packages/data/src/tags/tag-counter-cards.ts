/**
 * Scans card JSON files and appends counter effect objects to cards whose
 * description indicates they counter (cancel/negate) events or spells.
 *
 * Usage: bun run src/tags/tag-counter-cards.ts [file...]
 *   If no files given, defaults to cards/1st.json
 *
 * Tags applied:
 *   - { "type": "counter_event" } — Events/abilities that cancel/undo other events
 *   - { "type": "counter_spell" } — Spells/abilities that cancel/negate other spells
 *
 * Matching rules:
 *   counter_event (typeId=6 Events):
 *     - Description contains "undoes the harmful effect of an event"
 *     - OR description mentions magical calm + event
 *     - OR description contains "just-cast spell" (mass dispel)
 *
 *   counter_spell (typeId=4 or 19 Spells):
 *     - Description contains "cancels the effect of any spell"
 *     - OR description contains "negates any wall spell"
 *     - OR description contains "dispel" + "spell"
 *
 *   Known in-play counters (specific cardNumber overrides, any typeId):
 *     - #220 Rod of Dispel Magic (Artifact) → counter_spell
 *     - #427 Dori the Barbarian's Cape (Artifact) → counter_event
 *     - #450 Delsenora (Champion) → counter_event
 *     These are in-play abilities handled manually via chat; tagged here for completeness.
 *
 * Idempotent: skips cards that already have the matching effect type.
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

// typeId constants
const TYPE_EVENT = 6
const TYPE_CLERIC_SPELL = 4
const TYPE_WIZARD_SPELL = 19

// Known in-play counter cards that can't be detected purely by description pattern.
// These are artifacts/champions whose abilities happen while already in play.
// Map: cardNumber → effect type to apply
const KNOWN_COUNTER_CARDS: Map<number, "counter_event" | "counter_spell"> = new Map([
  [220, "counter_spell"], // Rod of Dispel Magic (Artifact) — cancels one magic spell when attacking/defending
  [427, "counter_event"], // Dori the Barbarian's Cape (Artifact) — cancels one helpful event per turn
  [450, "counter_event"], // Delsenora (Champion) — cancels one event card, then discarded
])

// counter_event patterns (for Events, typeId=6)
const UNDO_EVENT_PATTERN = /\bundoes\b.*\bevent\b/i
const CALM_EVENT_PATTERN = /\bmagical\s+calm\b.*\bevent\b/i
// Mass dispel of all spells including a just-cast spell counts as counter_event
const MASS_DISPEL_JUST_CAST_PATTERN = /\bjust-cast\s+spell\b/i

// counter_spell patterns (for Spells, typeId=4 or 19)
const CANCEL_SPELL_PATTERN = /\bcancels?\b.*\bspell\b/i
const NEGATE_WALL_PATTERN = /\bnegates?\b.*\bwall\s+spell\b/i
const DISPEL_SPELL_PATTERN = /\bdispel\b.*\bspell\b|\bspell[s]?\b.*\bdispel\b/i

function shouldTagAsCounterEvent(desc: string, typeId: number): boolean {
  if (typeId !== TYPE_EVENT) return false
  return (
    UNDO_EVENT_PATTERN.test(desc) ||
    CALM_EVENT_PATTERN.test(desc) ||
    MASS_DISPEL_JUST_CAST_PATTERN.test(desc)
  )
}

function shouldTagAsCounterSpell(desc: string, typeId: number): boolean {
  if (typeId !== TYPE_CLERIC_SPELL && typeId !== TYPE_WIZARD_SPELL) return false
  return (
    CANCEL_SPELL_PATTERN.test(desc) ||
    NEGATE_WALL_PATTERN.test(desc) ||
    DISPEL_SPELL_PATTERN.test(desc)
  )
}

function alreadyTagged(effects: EffectTag[], effectType: string): boolean {
  return effects.some((e) => e.type === effectType)
}

function applyTag(text: string, card: CardEntry, effectType: string): string {
  // Anchor by cardNumber to handle duplicate card names (e.g. two "Dispel Magic" cards)
  const cardNumAnchor = `"cardNumber":\\s*${card.cardNumber}[,\\s]`

  if (card.effects.length === 0) {
    // Empty array: replace [] with [{"type":"<effectType>"}]
    const pattern = new RegExp(`(${cardNumAnchor}[\\s\\S]*?"effects":\\s*)\\[\\]`)
    const replacement = `$1[{"type":"${effectType}"}]`
    const newText = text.replace(pattern, replacement)
    if (newText === text) {
      console.log(`  [!] Could not patch #${card.cardNumber} ${card.name}`)
      return text
    }
    return newText
  } else {
    // Non-empty array: append before closing bracket
    const pattern = new RegExp(`(${cardNumAnchor}[\\s\\S]*?"effects":\\s*\\[[\\s\\S]*?)(\\])`)
    const replacement = `$1,{"type":"${effectType}"}$2`
    const newText = text.replace(pattern, replacement)
    if (newText === text) {
      console.log(`  [!] Could not patch #${card.cardNumber} ${card.name}`)
      return text
    }
    return newText
  }
}

function processFile(filePath: string): number {
  const raw = readFileSync(filePath, "utf-8")
  const cards: CardEntry[] = JSON.parse(raw)
  let text = raw
  let tagged = 0

  for (const card of cards) {
    const desc = card.description ?? ""

    // Description-based auto-detection (hand-played spells and events)
    if (
      shouldTagAsCounterEvent(desc, card.typeId) &&
      !alreadyTagged(card.effects, "counter_event")
    ) {
      tagged++
      console.log(
        `  [+] #${card.cardNumber} ${card.name} (type ${card.typeId}): counter_event — "${desc.slice(0, 80)}${desc.length > 80 ? "..." : ""}"`,
      )
      text = applyTag(text, card, "counter_event")
    }

    if (
      shouldTagAsCounterSpell(desc, card.typeId) &&
      !alreadyTagged(card.effects, "counter_spell")
    ) {
      tagged++
      console.log(
        `  [+] #${card.cardNumber} ${card.name} (type ${card.typeId}): counter_spell — "${desc.slice(0, 80)}${desc.length > 80 ? "..." : ""}"`,
      )
      text = applyTag(text, card, "counter_spell")
    }

    // Known in-play counter cards (artifacts/champions not detectable by pattern alone)
    const knownEffect = KNOWN_COUNTER_CARDS.get(card.cardNumber)
    if (knownEffect && !alreadyTagged(card.effects, knownEffect)) {
      tagged++
      console.log(
        `  [+] #${card.cardNumber} ${card.name} (type ${card.typeId}): ${knownEffect} [known override]`,
      )
      text = applyTag(text, card, knownEffect)
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

console.log(`Scanning for counter_event / counter_spell effects...\n`)

let total = 0
for (const f of files) {
  console.log(basename(f))
  total += processFile(f)
}

console.log(`\nDone. ${total} card(s) tagged total.`)
