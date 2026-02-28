/**
 * Validates that every `effects` entry in a cards JSON file conforms to
 * the CardEffect union (Groups A + B).
 *
 * Usage:
 *   bun run validate:effects                    # validates cards/1st.json
 *   bun run validate:effects cards/2nd.json     # validates a specific file
 */

import path from "path"
import { readFileSync } from "fs"
import { z } from "zod"

// ─── CardEffect schema (Groups A + B) ────────────────────────────────────────

const EffectConditionSchema = z.discriminatedUnion("when", [
  z.object({ when: z.literal("attacking") }),
  z.object({ when: z.literal("defending") }),
  z.object({ when: z.literal("champion_type"),      typeId:    z.number().int() }),
  z.object({ when: z.literal("champion_attribute"), attribute: z.string() }),
])

const CardEffectSchema = z.discriminatedUnion("type", [
  // ── A · Combat level modifications ──────────────────────────────────────
  z.object({ type: z.literal("LEVEL_BONUS"),         value: z.number(), condition: EffectConditionSchema.optional() }),
  z.object({ type: z.literal("LEVEL_BONUS_VS"),      value: z.number(), targetAttribute: z.string() }),
  z.object({ type: z.literal("LEVEL_BONUS_VS_TYPE"), value: z.number(), typeId: z.number().int() }),

  // ── A · Spell access ────────────────────────────────────────────────────
  z.object({ type: z.literal("GRANT_SPELL_ACCESS"),  spellTypeId: z.number().int(), window: z.enum(["offense","defense","both"]) }),

  // ── A · Immunities ──────────────────────────────────────────────────────
  z.object({ type: z.literal("IMMUNE_TO_SPELLS"),    scope: z.enum(["offensive","defensive","both"]).optional() }),
  z.object({ type: z.literal("IMMUNE_TO_ATTRIBUTE"), attribute: z.string() }),
  z.object({ type: z.literal("IMMUNE_TO_ALL_MAGIC") }),

  // ── A · Card draw / hand ────────────────────────────────────────────────
  z.object({ type: z.literal("DRAW_CARD"),           count: z.number().int().positive() }),
  z.object({ type: z.literal("DISCARD_CARD"),        target: z.enum(["self","opponent"]), count: z.number().int().positive() }),

  // ── A · Combat bonus ────────────────────────────────────────────────────
  // typeIds: array of card type IDs that benefit; typeId 0 = all types
  z.object({ type: z.literal("COMBAT_BONUS"),        value: z.number(), typeIds: z.array(z.number().int()) }),

  // ── B · Passive / structural ─────────────────────────────────────────────
  z.object({ type: z.literal("HAND_SIZE_BONUS"),           count: z.number().int().positive() }),
  z.object({ type: z.literal("DRAW_PER_TURN"),             count: z.number().int().positive() }),
  z.object({ type: z.literal("DRAW_ON_REALM_PLAY"),        count: z.number().int().positive() }),
  z.object({ type: z.literal("REALM_GRANTS_SPELL_ACCESS"), spellTypeId: z.number().int(), window: z.enum(["offense","defense","both"]) }),
  z.object({ type: z.literal("NEGATE_ITEM_BONUS") }),
  z.object({ type: z.literal("RESTRICTED_ATTACKERS"),      attribute: z.string().optional(), typeId: z.number().int().optional() }),
  z.object({ type: z.literal("REALM_SELF_DEFENDS"),        level: z.number(), typeId: z.number().int() }),
])

const CardSchema = z.object({
  setId:       z.string(),
  cardNumber:  z.number().int(),
  name:        z.string(),
  effects:     z.array(CardEffectSchema),
}).passthrough()  // allow other card fields through

// ─── Main ─────────────────────────────────────────────────────────────────────

const arg = process.argv[2]
const target = arg
  ? path.resolve(arg)
  : path.join(import.meta.dir, "..", "cards", "1st.json")

console.log(`Validating ${target}\n`)

let cards: unknown[]
try {
  cards = JSON.parse(readFileSync(target, "utf-8")) as unknown[]
} catch (e) {
  console.error(`Failed to read file: ${e}`)
  process.exit(1)
}

if (!Array.isArray(cards)) {
  console.error("File must be a JSON array")
  process.exit(1)
}

let errors = 0
let checked = 0
let withEffects = 0

for (const card of cards) {
  const result = CardSchema.safeParse(card)
  if (!result.success) {
    errors++
    const c = card as { cardNumber?: number; name?: string }
    console.error(`Card #${c.cardNumber} "${c.name}"`)
    for (const issue of result.error.issues) {
      console.error(`  [${issue.path.join(".")}] ${issue.message}`)
    }
    console.error()
  } else {
    checked++
    if (result.data.effects.length > 0) withEffects++
  }
}

const total = cards.length
console.log(`Results: ${total} cards — ${checked} valid, ${errors} invalid, ${withEffects} with effects`)

if (errors > 0) {
  process.exit(1)
}
