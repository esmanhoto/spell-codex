/**
 * Writes packages/data/sets.json and packages/data/worlds.json
 * using metadata from CrossFire's CommonV.tcl plus actual card counts
 * from the already-extracted cards/*.json files.
 */

import path from "path"
import { readdirSync, readFileSync, writeFileSync } from "fs"
import type { CardSet, CardSetClass, World, WorldId } from "./types"

const CARDS_DIR = path.join(import.meta.dir, "..", "cards")
const OUT_DIR = path.join(import.meta.dir, "..")

// ─── Set metadata (from CrossFire Scripts/CommonV.tcl) ────────────────────────
// Format: [class, id, name, chaseCount]
// Classes: ed=edition, bost=booster, stik=community sticker sets, intl=international

const SET_META: Array<[CardSetClass, string, string, number]> = [
  ["edition", "NO", "No Edition", 0],
  ["edition", "1st", "1st Edition", 25],
  ["edition", "2nd", "2nd Edition", 0],
  ["edition", "3rd", "3rd Edition", 0],
  ["edition", "4th", "4th Edition", 0],
  ["booster", "PR", "Promo", 0],
  ["booster", "RL", "Ravenloft", 0],
  ["booster", "DL", "DragonLance", 25],
  ["booster", "FR", "Forgotten Realms", 25],
  ["booster", "AR", "Artifacts", 20],
  ["booster", "PO", "Powers", 20],
  ["booster", "UD", "The Underdark", 25],
  ["booster", "RR", "Runes & Ruins", 25],
  ["booster", "BR", "Birthright", 25],
  ["booster", "DR", "Draconomicon", 25],
  ["booster", "NS", "Night Stalkers", 25],
  ["booster", "DU", "Dungeons", 25],
  ["community", "IQ", "Inquisition", 0],
  ["community", "MI", "Millennium", 0],
  ["community", "CH", "Chaos", 0],
  ["community", "CQ", "Conquest", 0],
  ["international", "FRN", "French Edition", 25],
  ["international", "DE", "German Edition", 25],
  ["international", "IT", "Italian Edition", 25],
  ["international", "POR", "Portuguese Edition", 25],
  ["international", "SP", "Spanish Edition", 25],
]

// ─── World metadata (from CrossFire Scripts/CommonV.tcl worldInfo) ────────────

const WORLDS: World[] = [
  { id: 0 as WorldId, name: "None", shortName: "", iconFile: "worldad2.gif" },
  { id: 1 as WorldId, name: "Forgotten Realms", shortName: "FR", iconFile: "worldfr.gif" },
  { id: 2 as WorldId, name: "Greyhawk", shortName: "GH", iconFile: "worldgh.gif" },
  { id: 3 as WorldId, name: "Ravenloft", shortName: "RL", iconFile: "worldrl.gif" },
  { id: 4 as WorldId, name: "Dark Sun", shortName: "DS", iconFile: "worldds.gif" },
  { id: 5 as WorldId, name: "DragonLance", shortName: "DL", iconFile: "worlddl.gif" },
  { id: 6 as WorldId, name: "Birthright", shortName: "BR", iconFile: "worldbr.gif" },
  { id: 7 as WorldId, name: "AD&D", shortName: "ADD", iconFile: "worldadd.gif" },
  { id: 9 as WorldId, name: "No World", shortName: "", iconFile: "worldnon.gif" },
]

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  // Count actual cards from extracted JSON files
  const cardCounts: Record<string, number> = {}

  for (const file of readdirSync(CARDS_DIR).filter((f) => f.endsWith(".json"))) {
    const setId = path.basename(file, ".json")
    const cards = JSON.parse(readFileSync(path.join(CARDS_DIR, file), "utf-8")) as unknown[]
    cardCounts[setId] = cards.length
  }

  const sets: CardSet[] = SET_META.filter(([, id]) => id !== "NO") // skip the meta "No Edition" entry
    .map(([cls, id, name, chaseCount]) => ({
      id,
      name,
      class: cls,
      cardCount: cardCounts[id] ?? 0,
      chaseCount,
    }))

  const setsPath = path.join(OUT_DIR, "sets.json")
  writeFileSync(setsPath, JSON.stringify(sets, null, 2))
  console.log(`✓ sets.json — ${sets.length} sets`)
  for (const s of sets) {
    console.log(`  ${s.id.padEnd(5)} ${s.class.padEnd(14)} "${s.name}" — ${s.cardCount} cards`)
  }

  const worldsPath = path.join(OUT_DIR, "worlds.json")
  writeFileSync(worldsPath, JSON.stringify(WORLDS, null, 2))
  console.log(`\n✓ worlds.json — ${WORLDS.length} worlds`)
}

main()
