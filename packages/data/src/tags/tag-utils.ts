/**
 * Shared utilities for card effect tagging scripts.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join, basename } from "node:path"
import type { EffectTag } from "./types.ts"

export interface CardEntry {
  setId: string
  cardNumber: number
  name: string
  description: string
  typeId: number
  effects: EffectTag[]
  [key: string]: unknown
}

/** Appends an effect JSON string into a card's effects array using text-level regex. */
export function patchEffectByName(text: string, card: CardEntry, effectJson: string): string {
  const nameEscaped = card.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  if (card.effects.length === 0) {
    const pattern = new RegExp(`("name":\\s*"${nameEscaped}"[\\s\\S]*?"effects":\\s*)\\[\\]`)
    const patched = text.replace(pattern, `$1[${effectJson}]`)
    if (patched === text) console.log(`  [!] Could not patch #${card.cardNumber} ${card.name}`)
    return patched
  }
  const pattern = new RegExp(
    `("name":\\s*"${nameEscaped}"[\\s\\S]*?"effects":\\s*\\[[\\s\\S]*?)(\\])`,
  )
  const patched = text.replace(pattern, `$1,${effectJson}$2`)
  if (patched === text) console.log(`  [!] Could not patch #${card.cardNumber} ${card.name}`)
  return patched
}

/** Appends an effect JSON string using cardNumber as anchor (more robust for duplicate names). */
export function patchEffectByNumber(text: string, card: CardEntry, effectJson: string): string {
  const cardNumAnchor = `"cardNumber":\\s*${card.cardNumber}[,\\s]`
  if (card.effects.length === 0) {
    const pattern = new RegExp(`(${cardNumAnchor}[\\s\\S]*?"effects":\\s*)\\[\\]`)
    const patched = text.replace(pattern, `$1[${effectJson}]`)
    if (patched === text) console.log(`  [!] Could not patch #${card.cardNumber} ${card.name}`)
    return patched
  }
  const pattern = new RegExp(`(${cardNumAnchor}[\\s\\S]*?"effects":\\s*\\[[\\s\\S]*?)(\\])`)
  const patched = text.replace(pattern, `$1,${effectJson}$2`)
  if (patched === text) console.log(`  [!] Could not patch #${card.cardNumber} ${card.name}`)
  return patched
}

/**
 * Runs a tagging pipeline across files.
 * `processFile` receives (cards, rawText) and returns { text: string; tagged: number }.
 */
export function runTaggingPipeline(
  label: string,
  processFile: (cards: CardEntry[], text: string) => { text: string; tagged: number },
): void {
  const args = process.argv.slice(2)
  const files = args.length > 0 ? args : [join(import.meta.dir, "..", "..", "cards", "1st.json")]

  console.log(`Scanning for ${label} effect...\n`)

  let total = 0
  for (const f of files) {
    console.log(basename(f))
    const raw = readFileSync(f, "utf-8")
    const cards: CardEntry[] = JSON.parse(raw)
    const result = processFile(cards, raw)
    if (result.tagged > 0) {
      writeFileSync(f, result.text)
      console.log(`  → ${result.tagged} card(s) tagged in ${basename(f)}`)
    } else {
      console.log(`  → no new cards to tag in ${basename(f)}`)
    }
    total += result.tagged
  }

  console.log(`\nDone. ${total} card(s) tagged total.`)
}
