/**
 * Tags cards with { "type": "rebuild_realm" } effect.
 * Usage: bun run src/tags/tag-rebuild-realm.ts [file...]
 */
import type { EffectTag } from "./types.ts"
import { patchEffectByName, runTaggingPipeline } from "./tag-utils.ts"

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
  )
    return false
  if (REBUILD_PATTERN.test(lower) && (REALM_OR_RAZED.test(lower) || /\brebuild it\b/i.test(lower)))
    return true
  if (RESTORE_RAZED.test(lower)) return true
  return false
}

runTaggingPipeline(`"${EFFECT_TYPE}"`, (cards, raw) => {
  let text = raw
  let tagged = 0
  for (const card of cards) {
    if (!card.description) continue
    if (card.effects.some((e: EffectTag) => e.type === EFFECT_TYPE)) continue
    if (!shouldTag(card.description)) continue
    tagged++
    console.log(
      `  [+] #${card.cardNumber} ${card.name} (type ${card.typeId}): "${card.description.slice(0, 80)}..."`,
    )
    text = patchEffectByName(text, card, `{"type":"${EFFECT_TYPE}"}`)
  }
  return { text, tagged }
})
