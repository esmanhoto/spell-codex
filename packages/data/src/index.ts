/**
 * Runs all Phase 1 data extraction scripts in the correct order:
 *   1. extract-cards   → cards/{setId}.json
 *   2. extract-sets    → sets.json, worlds.json  (needs cards/ to exist)
 *   3. extract-formats → formats/{id}.json
 *   4. extract-decks   → decks/{id}.json
 *   5. copy-images     → assets/cards/{setId}/*.jpg
 */

const scripts = [
  "extract-cards.ts",
  "extract-sets.ts",
  "extract-formats.ts",
  "extract-decks.ts",
  "copy-images.ts",
]

const srcDir = import.meta.dir

for (const script of scripts) {
  const sep = "─".repeat(60)
  console.log(`\n${sep}`)
  console.log(`  ${script}`)
  console.log(`${sep}\n`)

  const proc = Bun.spawnSync([process.execPath, "run", `${srcDir}/${script}`], {
    env: process.env,
    stdout: "inherit",
    stderr: "inherit",
  })

  if (proc.exitCode !== 0) {
    console.error(`\n✗ ${script} failed with exit code ${proc.exitCode}`)
    process.exit(proc.exitCode ?? 1)
  }
}

console.log("\n✓ All extraction steps complete.")
