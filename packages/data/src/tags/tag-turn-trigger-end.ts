/**
 * Tags cards with { "type": "turn_trigger", "timing": "end" }.
 * Usage: bun run src/tags/tag-turn-trigger-end.ts [file...]
 */
import type { EffectTag, TurnTriggerEffect } from "./types.ts"
import { patchEffectByName, runTaggingPipeline } from "./tag-utils.ts"

const EFFECT: TurnTriggerEffect = { type: "turn_trigger", timing: "end" }
const EFFECT_JSON = JSON.stringify(EFFECT)

const END_PATTERN = /\b(at the end of|end of) (his|the player'?s) turn\b/i
const EXCLUDE_UNTIL = /\buntil the end of\b/i
const EXCLUDE_EACH = /\bend of each player'?s turn\b/i

export function shouldTagTurnEnd(desc: string): boolean {
  if (EXCLUDE_UNTIL.test(desc)) return false
  if (EXCLUDE_EACH.test(desc)) return false
  return END_PATTERN.test(desc)
}

if (import.meta.main) runTaggingPipeline('"turn_trigger / end"', (cards, raw) => {
  let text = raw
  let tagged = 0
  for (const card of cards) {
    if (!card.description) continue
    if (card.effects.some((e: EffectTag) => e.type === "turn_trigger" && e.timing === "end"))
      continue
    if (!shouldTagTurnEnd(card.description)) continue
    tagged++
    console.log(`  [+] #${card.cardNumber} ${card.name}: "${card.description.slice(0, 80)}..."`)
    text = patchEffectByName(text, card, EFFECT_JSON)
  }
  return { text, tagged }
})
