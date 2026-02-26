/**
 * Copies card images from CrossFire READONLY/Graphics/Cards/{setId}/*.jpg
 * to packages/data/assets/cards/{setId}/{cardNumber}.jpg
 *
 * Only copies sets listed in the allowlist (MVP = 1st Edition + boosters).
 * Renames files: strips leading zeros (e.g. "001.jpg" → "1.jpg").
 */

import path from "path"
import { readdirSync, mkdirSync, copyFileSync, existsSync } from "fs"

const CROSSFIRE_DIR =
  process.env.CROSSFIRE_PATH ??
  path.join(import.meta.dir, "..", "..", "..", "CrossFire READONLY")

const SRC_DIR = path.join(CROSSFIRE_DIR, "Graphics", "Cards")
const OUT_DIR = path.join(import.meta.dir, "..", "assets", "cards")

// For MVP, copy all available sets (filter here if needed)
const SET_ALLOWLIST: string[] | null = null // null = copy all

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  const sets = readdirSync(SRC_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => !SET_ALLOWLIST || SET_ALLOWLIST.includes(name))
    .sort()

  console.log(`Found ${sets.length} set directories\n`)

  let totalCopied = 0
  let totalSkipped = 0

  for (const setId of sets) {
    const setDir = path.join(SRC_DIR, setId)
    const outSetDir = path.join(OUT_DIR, setId)
    mkdirSync(outSetDir, { recursive: true })

    const images = readdirSync(setDir).filter((f) => f.endsWith(".jpg"))
    let copied = 0

    for (const imgFile of images) {
      // Strip leading zeros from the card number: "001.jpg" → "1.jpg"
      const num = parseInt(path.basename(imgFile, ".jpg"), 10)
      if (isNaN(num)) {
        totalSkipped++
        continue
      }

      const src = path.join(setDir, imgFile)
      const dest = path.join(outSetDir, `${num}.jpg`)

      if (!existsSync(dest)) {
        copyFileSync(src, dest)
        copied++
      }
    }

    totalCopied += copied
    console.log(`  ✓ ${setId.padEnd(5)} — ${copied} images copied`)
  }

  console.log(`\nTotal: ${totalCopied} images copied, ${totalSkipped} skipped`)
}

main()
