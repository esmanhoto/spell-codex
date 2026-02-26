/**
 * Interactive engine REPL — run with: bun run scripts/repl.ts
 *
 * Simulates a full 2-player game turn-by-turn, printing state after each move.
 * Useful for manually verifying the engine without writing tests.
 */

import { initGame, applyMove, getLegalMoves } from "../src/index.ts"
import type { GameState, Move } from "../src/index.ts"
import { Phase } from "../src/index.ts"
import { HAND_SIZES } from "../src/constants.ts"

// ─── Minimal card data matching the real 1st Edition cards ───────────────────

const WATERDEEP = { setId: "1st", cardNumber: 1,  name: "Waterdeep",  typeId: 13, worldId: 1 as const, isAvatar: false, level: null, description: "Any champion can use wizard spells when defending Waterdeep.", attributes: ["Coast"], supportIds: ["d19","o19"], effects: [] }
const VILLAGE   = { setId: "1st", cardNumber: 50, name: "Village",    typeId: 13, worldId: 0 as const, isAvatar: false, level: null, description: "", attributes: [], supportIds: [], effects: [] }
const ELMINSTER = { setId: "1st", cardNumber: 20, name: "Elminster",  typeId: 20, worldId: 1 as const, isAvatar: false, level: 8,    description: "Elminster can use wizard spells.", attributes: [], supportIds: [1, 2, 9, "d19", "o19"], effects: [] }
const ALUSTRIEL = { setId: "1st", cardNumber: 10, name: "Alustriel",  typeId: 5,  worldId: 1 as const, isAvatar: false, level: 6,    description: "Cleric champion.", attributes: [], supportIds: [1, 2, 4, 9], effects: [] }
const DRIZZT    = { setId: "1st", cardNumber: 30, name: "Drizzt",     typeId: 7,  worldId: 1 as const, isAvatar: false, level: 9,    description: "Hero of Faerûn.", attributes: [], supportIds: [1, 9], effects: [] }
const DWARF_AXE = { setId: "1st", cardNumber: 100, name: "Dwarven Axemen", typeId: 1, worldId: 0 as const, isAvatar: false, level: "+4", description: "+4 to champion.", attributes: ["Dwarf"], supportIds: [], effects: [] }
const SWORD     = { setId: "1st", cardNumber: 200, name: "Sword of Valor",  typeId: 9, worldId: 0 as const, isAvatar: false, level: null, description: "+2/+1 to bearer in combat.", attributes: [], supportIds: [], effects: [] }

function makeDeck(cards: typeof WATERDEEP[], total = 55) {
  const deck = []
  for (let i = 0; deck.length < total; i++) deck.push(cards[i % cards.length]!)
  return deck
}

const config = {
  gameId: "repl-game",
  players: [
    { id: "Alice", deckCards: makeDeck([WATERDEEP, VILLAGE, ELMINSTER, ALUSTRIEL, DWARF_AXE, SWORD]) },
    { id: "Bob",   deckCards: makeDeck([VILLAGE, WATERDEEP, DRIZZT, ALUSTRIEL, DWARF_AXE, SWORD]) },
  ] as [typeof config["players"][0], typeof config["players"][0]],
  seed: 42,
}

// ─── Display helpers ──────────────────────────────────────────────────────────

function printState(state: GameState) {
  const sep = "─".repeat(60)
  console.log(`\n${sep}`)
  console.log(`Turn ${state.currentTurn}  |  Active: ${state.activePlayer}  |  Phase: ${state.phase}`)
  console.log(sep)

  for (const [pid, player] of Object.entries(state.players)) {
    const formation = Object.entries(player.formation.slots)
      .map(([slot, s]) => `${slot}:${s?.realm.card.name}${s?.isRazed ? "(razed)" : ""}`)
      .join(", ") || "(empty)"
    const pool = player.pool.map(e => `${e.champion.card.name}(${e.champion.card.level})`).join(", ") || "(none)"
    const handNames = player.hand.map(c => c.card.name).join(", ")

    console.log(`\n${pid}:`)
    console.log(`  Formation : ${formation}`)
    console.log(`  Pool      : ${pool}`)
    console.log(`  Hand (${player.hand.length}/${HAND_SIZES[state.deckSize]!.maxEnd}): ${handNames}`)
    console.log(`  Discard   : ${player.discardPile.length} cards`)
  }

  if (state.combatState) {
    const c = state.combatState
    console.log(`\n  ⚔ Combat: ${c.attackingPlayer} → ${c.defendingPlayer} realm ${c.targetRealmSlot} [${c.roundPhase}]`)
    if (c.attacker) console.log(`    Attacker: ${c.attacker.card.name} (${c.attacker.card.level})`)
    if (c.defender) console.log(`    Defender: ${c.defender.card.name} (${c.defender.card.level})`)
  }

  if (state.winner) console.log(`\n🏆 WINNER: ${state.winner}`)
  console.log()
}

function printMoves(moves: Move[]) {
  if (moves.length === 0) { console.log("  (no legal moves)"); return }
  moves.forEach((m, i) => {
    const detail = "cardInstanceId" in m ? ` [${(m as { cardInstanceId: string }).cardInstanceId}]`
      : "championId" in m ? ` [champ: ${(m as { championId: string }).championId}]`
      : "slot" in m ? ` [slot: ${(m as { slot: string }).slot}]`
      : ""
    console.log(`  ${i}: ${m.type}${detail}`)
  })
}

// ─── Auto-play helper (picks the first legal move greedily) ──────────────────

function autoMove(state: GameState): Move {
  const moves = getLegalMoves(state, state.activePlayer)
  if (moves.length === 0) throw new Error("No legal moves")

  // Prefer interesting moves over PASS
  const priority = ["PLAY_REALM", "PLACE_CHAMPION", "ATTACH_ITEM", "DECLARE_ATTACK", "DECLARE_DEFENSE", "STOP_PLAYING"]
  for (const type of priority) {
    const m = moves.find(m => m.type === type)
    if (m) return m
  }
  return moves[0]!
}

// ─── REPL loop ────────────────────────────────────────────────────────────────

let state = initGame(config)
printState(state)

// Auto-play a full game (up to 50 moves) so you can see the engine in action
const MAX_MOVES = 50
let moveCount = 0

console.log("Auto-playing game...\n")

while (!state.winner && moveCount < MAX_MOVES) {
  const activePlayer = state.activePlayer
  // For combat defense, the active player may temporarily be the other player
  const move = autoMove(state)

  console.log(`Move ${++moveCount}: [${activePlayer}] ${move.type}` +
    ("slot" in move ? ` → slot ${(move as { slot: string }).slot}` : "") +
    ("targetRealmSlot" in move ? ` → realm ${(move as { targetRealmSlot: string }).targetRealmSlot}` : ""))

  const result = applyMove(state, activePlayer, move)

  if (result.events.length > 0) {
    const important = result.events.filter(e =>
      ["REALM_PLAYED","CHAMPION_PLACED","ATTACK_DECLARED","DEFENSE_DECLINED",
       "REALM_RAZED","COMBAT_RESOLVED","DEFENDER_WINS","ATTACKER_WINS","GAME_OVER"].includes(e.type)
    )
    for (const ev of important) console.log(`  → ${JSON.stringify(ev)}`)
  }

  state = result.newState

  // Print full state at phase boundaries
  if (result.events.some(e => e.type === "TURN_STARTED" || e.type === "GAME_OVER")) {
    printState(state)
  }
}

if (!state.winner) {
  console.log(`\n(stopped after ${MAX_MOVES} moves)`)
  printState(state)
} else {
  console.log(`\nGame over after ${moveCount} moves. Winner: ${state.winner}`)
}
