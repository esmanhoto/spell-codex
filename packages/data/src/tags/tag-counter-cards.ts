/**
 * Tags cards with counter_event / counter_spell effects.
 * Usage: bun run src/tags/tag-counter-cards.ts [file...]
 */
import type { EffectTag } from "./types.ts"
import { type CardEntry, patchEffectByNumber, runTaggingPipeline } from "./tag-utils.ts"

const TYPE_EVENT = 6
const TYPE_CLERIC_SPELL = 4
const TYPE_WIZARD_SPELL = 19

const KNOWN_COUNTER_CARDS: Map<number, "counter_event" | "counter_spell"> = new Map([
  [220, "counter_spell"],
  [427, "counter_event"],
  [450, "counter_event"],
])

const UNDO_EVENT_PATTERN = /\bundoes\b.*\bevent\b/i
const CALM_EVENT_PATTERN = /\bmagical\s+calm\b.*\bevent\b/i
const MASS_DISPEL_JUST_CAST_PATTERN = /\bjust-cast\s+spell\b/i
const CANCEL_SPELL_PATTERN = /\bcancels?\b.*\bspell\b/i
const NEGATE_WALL_PATTERN = /\bnegates?\b.*\bwall\s+spell\b/i
const DISPEL_SPELL_PATTERN = /\bdispel\b.*\bspell\b|\bspell[s]?\b.*\bdispel\b/i

export function shouldTagAsCounterEvent(desc: string, typeId: number): boolean {
  if (typeId !== TYPE_EVENT) return false
  return (
    UNDO_EVENT_PATTERN.test(desc) ||
    CALM_EVENT_PATTERN.test(desc) ||
    MASS_DISPEL_JUST_CAST_PATTERN.test(desc)
  )
}

export function shouldTagAsCounterSpell(desc: string, typeId: number): boolean {
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

function tagCard(
  text: string,
  card: CardEntry,
  effectType: string,
  label: string,
): { text: string; tagged: boolean } {
  if (alreadyTagged(card.effects, effectType)) return { text, tagged: false }
  console.log(`  [+] #${card.cardNumber} ${card.name} (type ${card.typeId}): ${effectType}${label}`)
  return { text: patchEffectByNumber(text, card, `{"type":"${effectType}"}`), tagged: true }
}

if (import.meta.main)
  runTaggingPipeline("counter_event / counter_spell", (cards, raw) => {
    let text = raw
    let tagged = 0
    for (const card of cards) {
      const desc = card.description ?? ""

      if (shouldTagAsCounterEvent(desc, card.typeId)) {
        const r = tagCard(
          text,
          card,
          "counter_event",
          ` — "${desc.slice(0, 80)}${desc.length > 80 ? "..." : ""}"`,
        )
        text = r.text
        if (r.tagged) tagged++
      }

      if (shouldTagAsCounterSpell(desc, card.typeId)) {
        const r = tagCard(
          text,
          card,
          "counter_spell",
          ` — "${desc.slice(0, 80)}${desc.length > 80 ? "..." : ""}"`,
        )
        text = r.text
        if (r.tagged) tagged++
      }

      const knownEffect = KNOWN_COUNTER_CARDS.get(card.cardNumber)
      if (knownEffect) {
        const r = tagCard(text, card, knownEffect, " [known override]")
        text = r.text
        if (r.tagged) tagged++
      }
    }
    return { text, tagged }
  })
