import type { CardData, CardInstance } from "./types.ts"
import { isSpellType } from "./utils.ts"

type SpellDirection = "offensive" | "defensive"
type CastPhase = 3 | 4 | 5
type CardLike = CardData | CardInstance

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
    return [...new Set(card.castPhases!.filter((n): n is CastPhase => n === 3 || n === 4 || n === 5))]
  }

  const match = getSpellTag(card)
  if (!match) return [4]

  const phases = [match[2], match[3]]
    .filter((v): v is string => v != null && v !== "")
    .map(v => Number(v))
    .filter((n): n is CastPhase => n === 3 || n === 4 || n === 5)

  if (phases.length === 0) return [4]

  return [...new Set(phases)]
}

/**
 * Checks if a champion/realm has supportIds required to cast this spell.
 * If spell direction is missing, allows either d/o direction support.
 */
export function canChampionUseSpell(spellLike: CardLike, championLike: CardLike): boolean {
  const spell = toCardData(spellLike)
  const champion = toCardData(championLike)
  if (!isSpellType(spell.typeId)) return false

  const typeRef = spell.typeId
  if (champion.supportIds.includes(typeRef)) return true

  const direction = getSpellDirection(spell)
  if (direction === "offensive") return champion.supportIds.includes(`o${typeRef}`)
  if (direction === "defensive") return champion.supportIds.includes(`d${typeRef}`)

  return champion.supportIds.includes(`d${typeRef}`) || champion.supportIds.includes(`o${typeRef}`)
}
