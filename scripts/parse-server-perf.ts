/**
 * Parses a server log file and extracts perf move entries.
 *
 * Usage:
 *   bun scripts/parse-server-perf.ts benchmarks/test.txt
 *   bun scripts/parse-server-perf.ts benchmarks/test.txt --json   (raw rows only)
 *   bun scripts/parse-server-perf.ts benchmarks/test.txt --out benchmarks/parsed.json
 */

import { readFileSync, writeFileSync } from "fs"

// ─── Parse args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const inputFile = args.find((a) => !a.startsWith("--"))
const rawOnly = args.includes("--json")
const outIndex = args.indexOf("--out")
const outFile = outIndex !== -1 ? args[outIndex + 1] : null

if (!inputFile) {
  console.error("Usage: bun scripts/parse-server-perf.ts <logfile> [--json] [--out <file>]")
  process.exit(1)
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PerfMove {
  perf: "move" | "move_http"
  game: string
  seq: number
  move_type: string
  actions_replayed: number
  reconstruct_ms: number
  apply_move_ms: number
  hash_ms: number
  serialize_ms?: number
  broadcast_bytes?: number
  total_ms: number
}

// ─── Extract perf lines ───────────────────────────────────────────────────────

const raw = readFileSync(inputFile, "utf-8")
const rows: PerfMove[] = []

for (const line of raw.split("\n")) {
  const trimmed = line.trim()
  if (!trimmed.startsWith("{")) continue
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>
    if (obj["perf"] !== "move" && obj["perf"] !== "move_http") continue
    rows.push(obj as unknown as PerfMove)
  } catch {
    // not valid JSON — skip
  }
}

if (rows.length === 0) {
  console.error("No perf move entries found in file.")
  process.exit(1)
}

if (rawOnly) {
  console.log(JSON.stringify(rows, null, 2))
  process.exit(0)
}

// ─── Stats helpers ────────────────────────────────────────────────────────────

function stats(values: number[]): {
  min: number
  max: number
  avg: number
  p50: number
  p95: number
} {
  const sorted = [...values].sort((a, b) => a - b)
  const sum = sorted.reduce((a, b) => a + b, 0)
  const p = (pct: number) => sorted[Math.floor((pct / 100) * sorted.length)] ?? sorted.at(-1)!
  return {
    min: +sorted[0]!.toFixed(2),
    max: +sorted.at(-1)!.toFixed(2),
    avg: +(sum / sorted.length).toFixed(2),
    p50: +p(50).toFixed(2),
    p95: +p(95).toFixed(2),
  }
}

// ─── Group by game ────────────────────────────────────────────────────────────

const byGame = new Map<string, PerfMove[]>()
for (const row of rows) {
  if (!byGame.has(row.game)) byGame.set(row.game, [])
  byGame.get(row.game)!.push(row)
}

// ─── Build output ─────────────────────────────────────────────────────────────

const numericFields = [
  "reconstruct_ms",
  "apply_move_ms",
  "hash_ms",
  "serialize_ms",
  "broadcast_bytes",
  "total_ms",
] as const

const games = Object.fromEntries(
  [...byGame.entries()].map(([gameId, moves]) => {
    const sorted = [...moves].sort((a, b) => a.seq - b.seq)
    const fieldStats: Record<string, ReturnType<typeof stats>> = {}
    for (const field of numericFields) {
      const values = sorted.map((m) => m[field]).filter((v): v is number => v !== undefined)
      if (values.length > 0) fieldStats[field] = stats(values)
    }
    return [
      gameId,
      {
        moves_recorded: sorted.length,
        seq_range: `${sorted[0]!.seq}–${sorted.at(-1)!.seq}`,
        move_types: [...new Set(sorted.map((m) => m.move_type))],
        per_move: sorted.map((m) => ({
          seq: m.seq,
          type: m.move_type,
          actions_replayed: m.actions_replayed,
          reconstruct_ms: m.reconstruct_ms,
          apply_move_ms: m.apply_move_ms,
          hash_ms: m.hash_ms,
          serialize_ms: m.serialize_ms,
          broadcast_bytes: m.broadcast_bytes,
          total_ms: m.total_ms,
        })),
        stats: fieldStats,
      },
    ]
  }),
)

// Overall stats across all games
const allFieldStats: Record<string, ReturnType<typeof stats>> = {}
for (const field of numericFields) {
  const values = rows.map((m) => m[field]).filter((v): v is number => v !== undefined)
  if (values.length > 0) allFieldStats[field] = stats(values)
}

const output = {
  source: inputFile,
  total_moves: rows.length,
  games_count: byGame.size,
  overall_stats: allFieldStats,
  games,
}

// ─── Output ───────────────────────────────────────────────────────────────────

const json = JSON.stringify(output, null, 2)

if (outFile) {
  writeFileSync(outFile, json)
  console.log(`Written to ${outFile}`)
} else {
  // Pretty print to terminal
  console.log(`\n=== Server Perf Summary ===`)
  console.log(`Source: ${inputFile}`)
  console.log(`Moves: ${rows.length} across ${byGame.size} game(s)\n`)

  console.log("─── Overall stats ───────────────────────────────────")
  for (const [field, s] of Object.entries(allFieldStats)) {
    const unit = field.endsWith("_bytes") ? "B" : "ms"
    console.log(
      `  ${field.padEnd(20)} min=${s.min}${unit}  avg=${s.avg}${unit}  p95=${s.p95}${unit}  max=${s.max}${unit}`,
    )
  }

  for (const [gameId, data] of Object.entries(games)) {
    const g = data as (typeof games)[string]
    console.log(
      `\n─── Game ${gameId.slice(0, 8)}… (${g.moves_recorded} moves, seq ${g.seq_range}) ───`,
    )
    console.log(`  seq  type                  replayed  reconstruct  apply    total`)
    for (const m of g.per_move) {
      console.log(
        `  ${String(m.seq).padStart(3)}  ${m.type.padEnd(22)}  ${String(m.actions_replayed).padStart(8)}  ` +
          `${String(m.reconstruct_ms).padStart(9)}ms  ${String(m.apply_move_ms).padStart(5)}ms  ${String(m.total_ms).padStart(7)}ms`,
      )
    }
  }

  console.log(`\nFor full JSON: bun scripts/parse-server-perf.ts ${inputFile} --out out.json\n`)
}
