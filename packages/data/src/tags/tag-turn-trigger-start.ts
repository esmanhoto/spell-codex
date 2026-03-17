/**
 * Tags cards with { "type": "turn_trigger", "timing": "start" }.
 * Usage: bun run src/tags/tag-turn-trigger-start.ts [file...]
 */
import type { EffectTag, TurnTriggerEffect } from "./types.ts"
import { patchEffectByName, runTaggingPipeline } from "./tag-utils.ts"

const EFFECT: TurnTriggerEffect = { type: "turn_trigger", timing: "start" }
const EFFECT_JSON = JSON.stringify(EFFECT)

const START_PATTERN = /\b(at the (start|beginning) of (the player'?s|his|its owner'?s) turn)\b/i
const EXCLUDE_PLAYED_AT = /\bplayed at the (start|beginning) of\b/i

function shouldTag(desc: string): boolean {
  if (EXCLUDE_PLAYED_AT.test(desc)) return false
  return START_PATTERN.test(desc)
}

runTaggingPipeline('"turn_trigger / start"', (cards, raw) => {
  let text = raw
  let tagged = 0
  for (const card of cards) {
    if (!card.description) continue
    if (card.effects.some((e: EffectTag) => e.type === "turn_trigger" && e.timing === "start"))
      continue
    if (!shouldTag(card.description)) continue
    tagged++
    console.log(`  [+] #${card.cardNumber} ${card.name}: "${card.description.slice(0, 80)}..."`)
    text = patchEffectByName(text, card, EFFECT_JSON)
  }
  return { text, tagged }
})
