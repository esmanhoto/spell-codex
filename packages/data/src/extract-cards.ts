/**
 * Extracts card data from CrossFire TCL database files and writes
 * one JSON file per set to packages/data/cards/{setId}.json
 */

import path from "path"
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "fs"
import { parseTclList, extractTclBlock } from "./lib/tcl-parser"
import type {
  Card,
  CardLevel,
  CardRarity,
  SupportRef,
  WorldId,
  SpellNature,
  CastPhase,
} from "./types"

const CROSSFIRE_DIR =
  process.env.CROSSFIRE_PATH ?? path.join(import.meta.dir, "..", "..", "..", "CrossFire READONLY")

const DB_DIR = path.join(CROSSFIRE_DIR, "DataBase")
const OUT_DIR = path.join(import.meta.dir, "..", "cards")
const SPELL_TYPE_IDS = new Set([4, 19]) // Cleric Spell, Wizard Spell
const SPELL_TAG_REGEX = /\((Off|Def)(?:\/(\d)(?:\/(\d))?)?\)/i

// ─── Field parsers ────────────────────────────────────────────────────────────

export function parseLevel(raw: string): CardLevel {
  if (!raw) return null
  // Keep explicit sign (+/-) or slash notation as strings
  if (raw.startsWith("+") || raw.startsWith("-") || raw.includes("/")) return raw
  const n = parseInt(raw, 10)
  return isNaN(n) ? raw : n
}

export function parseRarity(raw: string): CardRarity {
  const valid: CardRarity[] = ["M", "C", "UC", "R", "VR", "S", "V"]
  return valid.includes(raw as CardRarity) ? (raw as CardRarity) : "C"
}

/**
 * Parses the attributes field.
 * Attributes end with "." so we split on ". " and strip trailing periods.
 * Example: "Dwarf. Flyer." → ["Dwarf", "Flyer"]
 * Example: "Elf (drow)." → ["Elf (drow)"]
 */
export function parseAttributes(raw: string): string[] {
  if (!raw.trim()) return []
  return raw
    .split(/\.\s+/)
    .map((s) => s.replace(/\.$/, "").trim())
    .filter(Boolean)
}

/**
 * Parses the supportIds field.
 * Example: "1 2 d9 o9 d19 o19" → [1, 2, "d9", "o9", "d19", "o19"]
 */
export function parseRefList(raw: string): SupportRef[] {
  return parseTclList(raw)
    .filter((s) => s.length > 0)
    .map((s) => {
      const n = parseInt(s, 10)
      return isNaN(n) ? s : n
    })
}

export function parseSpellMeta(
  typeId: number,
  description: string,
  attributes: string[],
): { spellNature: SpellNature | null; castPhases: CastPhase[] } {
  if (!SPELL_TYPE_IDS.has(typeId)) {
    return { spellNature: null, castPhases: [] }
  }

  const sources = [description, ...attributes]
  for (const source of sources) {
    const match = source.match(SPELL_TAG_REGEX)
    if (!match) continue

    const spellNature: SpellNature = match[1]?.toLowerCase() === "off" ? "offensive" : "defensive"
    const castPhases = [match[2], match[3]]
      .filter((v): v is string => v != null && v !== "")
      .map((v) => Number(v))
      .filter((n): n is CastPhase => n === 3 || n === 4 || n === 5)

    return {
      spellNature,
      castPhases: castPhases.length > 0 ? [...new Set(castPhases)] : [4],
    }
  }

  return { spellNature: null, castPhases: [4] }
}

// ─── Card record parser ───────────────────────────────────────────────────────

export function parseCardRecord(record: string): Card | null {
  const fields = parseTclList(record)

  // Each card record must have exactly 13 fields
  if (fields.length !== 13) {
    return null
  }

  const [
    setId,
    cardNumberRaw,
    levelRaw,
    typeIdRaw,
    worldIdRaw,
    isAvatarRaw,
    name,
    description,
    rarityRaw,
    attributesRaw,
    _usableByRaw,
    supportRaw,
    weightRaw,
  ] = fields

  const cardNumber = parseInt(cardNumberRaw, 10)
  if (isNaN(cardNumber)) return null

  const typeId = parseInt(typeIdRaw, 10)
  if (isNaN(typeId)) return null

  const worldId = (parseInt(worldIdRaw, 10) || 0) as WorldId
  const weightN = parseInt(weightRaw, 10)
  const descriptionClean = description.trim()
  const attributes = parseAttributes(attributesRaw)
  const { spellNature, castPhases } = parseSpellMeta(typeId, descriptionClean, attributes)

  return {
    setId: setId.trim(),
    cardNumber,
    level: parseLevel(levelRaw),
    typeId,
    worldId,
    isAvatar: isAvatarRaw === "1",
    name: name.trim(),
    description: descriptionClean,
    rarity: parseRarity(rarityRaw.trim()),
    attributes,
    supportIds: parseRefList(supportRaw),
    spellNature,
    castPhases,
    weight: isNaN(weightN) ? null : weightN,
    effects: [],
  }
}

// ─── Per-file extraction ──────────────────────────────────────────────────────

function extractSet(tclFile: string): { setName: string; cards: Card[] } {
  const source = readFileSync(tclFile, "utf-8")
  const block = extractTclBlock(source, "CrossFire::cardDataBase")

  if (!block) {
    throw new Error(`Could not find cardDataBase block in ${tclFile}`)
  }

  const elements = parseTclList(block)

  if (elements.length === 0) {
    throw new Error(`Empty cardDataBase block in ${tclFile}`)
  }

  // First element is the set display name
  const setName = elements[0]
  const cards: Card[] = []

  for (let i = 1; i < elements.length; i++) {
    const card = parseCardRecord(elements[i])
    if (card) {
      cards.push(card)
    } else {
      console.warn(`  Skipped malformed record at index ${i} in ${path.basename(tclFile)}`)
    }
  }

  return { setName, cards }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  const filterArgs = process.argv
    .filter((arg) => arg.startsWith("--set="))
    .flatMap((arg) => arg.replace("--set=", "").split(","))
    .map((v) => v.trim())
    .filter(Boolean)
  const requestedSetIds = new Set(filterArgs)

  let files = readdirSync(DB_DIR).filter((f) => f.endsWith(".tcl"))
  if (requestedSetIds.size > 0) {
    files = files.filter((f) => requestedSetIds.has(path.basename(f, ".tcl")))
  }
  console.log(`Found ${files.length} database files in ${DB_DIR}\n`)

  let totalCards = 0

  for (const file of files.sort()) {
    const setId = path.basename(file, ".tcl")
    const tclPath = path.join(DB_DIR, file)

    try {
      const { setName, cards } = extractSet(tclPath)
      const outPath = path.join(OUT_DIR, `${setId}.json`)
      writeFileSync(outPath, JSON.stringify(cards, null, 2))
      console.log(
        `  ✓ ${setId.padEnd(5)} "${setName}" — ${cards.length} cards → ${path.relative(process.cwd(), outPath)}`,
      )
      totalCards += cards.length
    } catch (err) {
      console.error(`  ✗ ${setId}: ${(err as Error).message}`)
    }
  }

  console.log(`\nTotal cards extracted: ${totalCards}`)
}

if (import.meta.main) main()
