import type { CardData, CardInstance, SupportRef } from "./types.ts"
import { isSpellType } from "./utils.ts"

type SpellDirection = "offensive" | "defensive"
type CastPhase = 3 | 4 | 5
type CardLike = CardData | CardInstance

/**
 * Context for evaluating effective spell-casting capability.
 * Collects supportIds beyond the champion's own card.
 */
export interface SpellCastContext {
  /** Attached cards (magical items, artifacts) on this champion */
  attachments?: CardData[]
  /**
   * The realm this champion is actively defending during combat.
   * Realms only grant casting to their own defender, not to all pool champions.
   */
  defendingRealm?: CardData
  /** Holdings on the defending realm */
  holdingsOnRealm?: CardData[]
}

const SPELL_TAG_REGEX = /\((Off|Def)(?:\/(\d)(?:\/(\d))?)?\)/i

function toCardData(card: CardLike): CardData {
  return "card" in card ? card.card : card
}

function getSpellTag(card: CardData): RegExpMatchArray | null {
  const descriptionMatch = card.description.match(SPELL_TAG_REGEX)
  if (descriptionMatch) return descriptionMatch

  for (const attr of card.attributes) {
    const attrMatch = attr.match(SPELL_TAG_REGEX)
    if (attrMatch) return attrMatch
  }

  return null
}

/**
 * Returns spell direction from card text:
 * - Off => offensive
 * - Def => defensive
 * - null => direction not declared
 */
export function getSpellDirection(cardLike: CardLike): SpellDirection | null {
  const card = toCardData(cardLike)
  if (!isSpellType(card.typeId)) return null
  if (card.spellNature != null) return card.spellNature

  const match = getSpellTag(card)
  if (!match) return null

  return match[1]?.toLowerCase() === "off" ? "offensive" : "defensive"
}

/**
 * Returns allowed cast phases from card text.
 * Defaults to [4] when no explicit phase marker exists.
 */
export function getCastPhases(cardLike: CardLike): CastPhase[] {
  const card = toCardData(cardLike)
  if (!isSpellType(card.typeId)) return []
  if ((card.castPhases?.length ?? 0) > 0) {
    return [
      ...new Set(card.castPhases!.filter((n): n is CastPhase => n === 3 || n === 4 || n === 5)),
    ]
  }

  const match = getSpellTag(card)
  if (!match) return [4]

  const phases = [match[2], match[3]]
    .filter((v): v is string => v != null && v !== "")
    .map((v) => Number(v))
    .filter((n): n is CastPhase => n === 3 || n === 4 || n === 5)

  if (phases.length === 0) return [4]

  return [...new Set(phases)]
}

/**
 * Collects the union of supportIds from a champion and all context sources:
 * - Champion's own supportIds (always)
 * - Attached magical items / artifacts (always when equipped)
 * - Defending realm's supportIds (only when champion is defending that realm in combat)
 * - Holdings on the defending realm
 */
export function getEffectiveSupportIds(
  champion: CardData,
  context: SpellCastContext = {},
): SupportRef[] {
  const ids = new Set<SupportRef>()
  for (const id of champion.supportIds) ids.add(id)
  for (const att of context.attachments ?? []) {
    for (const id of att.supportIds) ids.add(id)
  }
  if (context.defendingRealm) {
    for (const id of context.defendingRealm.supportIds) ids.add(id)
  }
  for (const holding of context.holdingsOnRealm ?? []) {
    for (const id of holding.supportIds) ids.add(id)
  }
  return [...ids]
}

/**
 * Checks if a spell can be cast given a pre-built set of effective supportIds.
 * Use getEffectiveSupportIds() to build the support set from all relevant sources.
 */
export function canCastWithSupport(
  spellLike: CardLike,
  effectiveSupportIds: SupportRef[],
): boolean {
  const spell = toCardData(spellLike)
  if (!isSpellType(spell.typeId)) return false

  const typeRef = spell.typeId
  if (effectiveSupportIds.includes(typeRef)) return true

  const direction = getSpellDirection(spell)
  if (direction === "offensive") return effectiveSupportIds.includes(`o${typeRef}`)
  if (direction === "defensive") return effectiveSupportIds.includes(`d${typeRef}`)
  return effectiveSupportIds.includes(`d${typeRef}`) || effectiveSupportIds.includes(`o${typeRef}`)
}

/**
 * Checks if a champion (with optional context) can cast a spell.
 * Context includes attachments (magical items) and defending realm/holdings.
 */
export function canChampionUseSpell(
  spellLike: CardLike,
  championLike: CardLike,
  context: SpellCastContext = {},
): boolean {
  const champion = toCardData(championLike)
  return canCastWithSupport(spellLike, getEffectiveSupportIds(champion, context))
}
