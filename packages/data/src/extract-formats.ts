/**
 * Parses CrossFire .cff deck format files and writes
 * packages/data/formats/{id}.json for each one.
 *
 * Only extracts the "standard" formats (55, 75, 110 card).
 * Tournament variants and special formats are skipped for now.
 */

import path from "path"
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "fs"
import { parseTclList, extractTclBlock } from "./lib/tcl-parser"
import type { DeckFormat, TypeLimit } from "./types"

const CROSSFIRE_DIR =
  process.env.CROSSFIRE_PATH ?? path.join(import.meta.dir, "..", "..", "..", "CrossFire READONLY")

const FORMATS_DIR = path.join(CROSSFIRE_DIR, "Formats")
const OUT_DIR = path.join(import.meta.dir, "..", "formats")

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parses a TCL block like:
 *   TypeName  min  max  maxCopies
 *   {Type Name}  min  max  maxCopies
 * into a Record<string, TypeLimit>
 */
function parseLimitBlock(raw: string | null): Record<string, TypeLimit> {
  if (!raw) return {}
  const result: Record<string, TypeLimit> = {}
  const elements = parseTclList(raw)

  // Elements come in groups of 4: name, min, max, maxCopies
  for (let i = 0; i + 3 < elements.length; i += 4) {
    const name = elements[i]
    const min = parseInt(elements[i + 1], 10)
    const max = parseInt(elements[i + 2], 10)
    const maxCopies = parseInt(elements[i + 3], 10)
    if (!isNaN(min) && !isNaN(max) && !isNaN(maxCopies)) {
      result[name] = { min, max, maxCopies }
    }
  }

  return result
}

/**
 * Parses the Total block which has irregular entries:
 *   All          55   55
 *   Avatars       0    1
 *   Chase         0   55
 *   Champions     1   20
 *   Levels        0   90
 */
function parseTotalBlock(raw: string | null): {
  total: { min: number; max: number }
  championCount: { min: number; max: number }
  maxChampionLevels: number
  maxAvatars: number
} {
  const defaults = {
    total: { min: 55, max: 55 },
    championCount: { min: 1, max: 20 },
    maxChampionLevels: 90,
    maxAvatars: 1,
  }

  if (!raw) return defaults

  const elements = parseTclList(raw)

  // Groups of 3: label, min, max
  for (let i = 0; i + 2 < elements.length; i += 3) {
    const label = elements[i].toLowerCase()
    const min = parseInt(elements[i + 1], 10)
    const max = parseInt(elements[i + 2], 10)
    if (isNaN(min) || isNaN(max)) continue

    if (label === "all") defaults.total = { min, max }
    else if (label === "champions") defaults.championCount = { min, max }
    else if (label === "levels") defaults.maxChampionLevels = max
    else if (label === "avatars") defaults.maxAvatars = max
  }

  return defaults
}

/**
 * Parses banned/allowed card lists:
 *   {setId cardNumber}  {setId cardNumber}  ...
 */
function parseCardRefList(raw: string | null): Array<{ setId: string; cardNumber: number }> {
  if (!raw?.trim()) return []
  const elements = parseTclList(raw)
  const result: Array<{ setId: string; cardNumber: number }> = []

  for (const el of elements) {
    const parts = parseTclList(el)
    if (parts.length === 2) {
      const cardNumber = parseInt(parts[1], 10)
      if (!isNaN(cardNumber)) {
        result.push({ setId: parts[0], cardNumber })
      }
    }
  }

  return result
}

// ─── Per-file extraction ──────────────────────────────────────────────────────

function extractFormat(cffPath: string, formatId: string): DeckFormat {
  const source = readFileSync(cffPath, "utf-8")

  const titleRaw = extractTclBlock(source, "tempDeckFormatTitle")
  const totalRaw = extractTclBlock(source, "tempDeckFormatTotal")
  const limitsRaw = extractTclBlock(source, "tempDeckFormatLimits")
  const rarityRaw = extractTclBlock(source, "tempDeckFormatRarity")
  const worldRaw = extractTclBlock(source, "tempDeckFormatWorld")
  const setRaw = extractTclBlock(source, "tempDeckFormatSet")
  const bannedRaw = extractTclBlock(source, "tempDeckFormatBanned")
  const allowedRaw = extractTclBlock(source, "tempDeckFormatAllowed")

  const totalInfo = parseTotalBlock(totalRaw)

  return {
    id: formatId,
    name: titleRaw?.trim() ?? formatId,
    ...totalInfo,
    typeLimits: parseLimitBlock(limitsRaw),
    rarityLimits: parseLimitBlock(rarityRaw),
    worldLimits: parseLimitBlock(worldRaw),
    setLimits: parseLimitBlock(setRaw),
    banned: parseCardRefList(bannedRaw),
    allowed: parseCardRefList(allowedRaw),
  }
}

// ─── Walk format directories ──────────────────────────────────────────────────

function findCffFiles(dir: string): Array<{ file: string; id: string }> {
  const results: Array<{ file: string; id: string }> = []

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findCffFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith(".cff")) {
      const id = entry.name.replace(/\.cff$/, "")
      results.push({ file: fullPath, id })
    }
  }

  return results
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  const cffFiles = findCffFiles(FORMATS_DIR)
  console.log(`Found ${cffFiles.length} format files\n`)

  for (const { file, id } of cffFiles.sort((a, b) => a.id.localeCompare(b.id))) {
    try {
      const format = extractFormat(file, id)
      const outPath = path.join(OUT_DIR, `${id}.json`)
      writeFileSync(outPath, JSON.stringify(format, null, 2))
      console.log(`  ✓ ${id.padEnd(12)} "${format.name}"`)
    } catch (err) {
      console.error(`  ✗ ${id}: ${(err as Error).message}`)
    }
  }
}

main()
