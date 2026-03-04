/**
 * Parses CrossFire .cfd deck files and writes
 * packages/data/decks/{id}.json for each one.
 */

import path from "path"
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "fs"
import { parseTclList, extractTclBlock } from "./lib/tcl-parser"
import type { Deck } from "./types"

const CROSSFIRE_DIR =
  process.env.CROSSFIRE_PATH ?? path.join(import.meta.dir, "..", "..", "..", "CrossFire READONLY")

const DECKS_DIR = path.join(CROSSFIRE_DIR, "Decks")
const OUT_DIR = path.join(import.meta.dir, "..", "decks")

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts a bare-word (non-braced) TCL variable value on a single line:
 *   set varName someValue
 */
function extractBareValue(source: string, varName: string): string {
  const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = new RegExp(`set\\s+${escaped}\\s+(\\S+)`).exec(source)
  return match?.[1] ?? ""
}

/**
 * Parses a tempDeck or tempAltCards block:
 *   {setId cardNumber}  {setId cardNumber}  ...
 */
function parseDeckCardList(raw: string | null): Array<{ setId: string; cardNumber: number }> {
  if (!raw?.trim()) return []
  const result: Array<{ setId: string; cardNumber: number }> = []

  for (const el of parseTclList(raw)) {
    const parts = parseTclList(el)
    if (parts.length === 2) {
      const cardNumber = parseInt(parts[1], 10)
      if (!isNaN(cardNumber)) {
        result.push({ setId: parts[0].trim(), cardNumber })
      }
    }
  }

  return result
}

// ─── Per-file extraction ──────────────────────────────────────────────────────

function extractDeck(cfdPath: string, deckId: string): Deck {
  const source = readFileSync(cfdPath, "utf-8")

  const titleRaw = extractTclBlock(source, "tempDeckTitle")
  const authorRaw = extractTclBlock(source, "tempAuthorName")
  const notesRaw = extractTclBlock(source, "tempNotes")
  const deckRaw = extractTclBlock(source, "tempDeck")
  const emailRaw = extractBareValue(source, "tempAuthorEmail")
  const sizeRaw = extractBareValue(source, "tempDeckSize")

  const cards = parseDeckCardList(deckRaw)
  const deckSize = parseInt(sizeRaw, 10)

  return {
    id: deckId,
    title: titleRaw?.trim() ?? deckId,
    authorName: authorRaw?.trim() ?? "",
    authorEmail: emailRaw,
    notes: notesRaw?.trim() ?? "",
    deckSize: isNaN(deckSize) ? cards.length : deckSize,
    cards,
  }
}

// ─── Walk deck directories ────────────────────────────────────────────────────

function findCfdFiles(dir: string): Array<{ file: string; id: string }> {
  const results: Array<{ file: string; id: string }> = []

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findCfdFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith(".cfd")) {
      // Sanitize filename → id: lowercase, spaces→underscores, strip leading "Sample_"
      const baseName = path.basename(entry.name, ".cfd")
      const id = baseName
        .replace(/^Sample_/i, "")
        .replace(/\s+/g, "_")
        .toLowerCase()
      results.push({ file: fullPath, id })
    }
  }

  return results
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  const cfdFiles = findCfdFiles(DECKS_DIR)
  console.log(`Found ${cfdFiles.length} deck files\n`)

  // Deduplicate IDs (append _2, _3 etc. if needed)
  const idCount: Record<string, number> = {}
  const deduped = cfdFiles.map(({ file, id }) => {
    idCount[id] = (idCount[id] ?? 0) + 1
    const count = idCount[id]
    return { file, id: count === 1 ? id : `${id}_${count}` }
  })

  for (const { file, id } of deduped.sort((a, b) => a.id.localeCompare(b.id))) {
    try {
      const deck = extractDeck(file, id)
      const outPath = path.join(OUT_DIR, `${id}.json`)
      writeFileSync(outPath, JSON.stringify(deck, null, 2))
      console.log(`  ✓ ${id.padEnd(40)} "${deck.title}" — ${deck.cards.length} cards`)
    } catch (err) {
      console.error(`  ✗ ${id}: ${(err as Error).message}`)
    }
  }
}

main()
