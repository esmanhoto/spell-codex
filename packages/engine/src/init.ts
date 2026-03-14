import type { GameState, GameConfig, PlayerState, CardInstance } from "./types.ts"
import { Phase } from "./types.ts"
import { HAND_SIZES } from "./constants.ts"
import { seededShuffle, createInstance, takeCards } from "./utils.ts"

/**
 * Initializes a new game from config.
 * Deterministic — same config + seed always produces the same initial state.
 */
export function initGame(config: GameConfig): GameState {
  const formationSize = config.formationSize ?? 6
  const [p1Config, p2Config] = config.players

  const deckSize = determineDeckSize(p1Config.deckCards.length)
  const { starting } = HAND_SIZES[deckSize]!

  // Create runtime instances with deterministic IDs: gameId + player index + deck position.
  // This ensures reconstructState always produces identical IDs for the same game,
  // regardless of how many other games have been reconstructed in this process.
  const p1Instances = p1Config.deckCards.map((card, i) =>
    createInstance(card, `${config.gameId}-p0-${i}`),
  )
  const p2Instances = p2Config.deckCards.map((card, i) =>
    createInstance(card, `${config.gameId}-p1-${i}`),
  )

  // Shuffle deterministically — XOR the seed with a constant per player
  // so both players get different shuffles from the same seed
  const p1Shuffled = seededShuffle(p1Instances, config.seed)
  const p2Shuffled = seededShuffle(p2Instances, config.seed ^ 0xdeadbeef)

  const [p1Hand, p1DrawPile] = takeCards(p1Shuffled, starting)
  const [p2Hand, p2DrawPile] = takeCards(p2Shuffled, starting)

  const players: Record<string, PlayerState> = {
    [p1Config.id]: makePlayerState(p1Config.id, p1Hand, p1DrawPile, formationSize),
    [p2Config.id]: makePlayerState(p2Config.id, p2Hand, p2DrawPile, formationSize),
  }

  return {
    id: config.gameId,
    players,
    currentTurn: 1,
    activePlayer: p1Config.id,
    playerOrder: [p1Config.id, p2Config.id],
    phase: Phase.StartOfTurn,
    combatState: null,
    winner: null,
    events: [{ type: "GAME_STARTED", players: [p1Config.id, p2Config.id] }],
    deckSize,
    hasAttackedThisTurn: false,
    hasPlayedRealmThisTurn: false,
    pendingSpoil: null,
    resolutionContext: null,
    pendingTriggers: [],
    endTriggersPopulated: false,
  }
}

function makePlayerState(
  id: string,
  hand: CardInstance[],
  drawPile: CardInstance[],
  formationSize: 6 | 8 | 10,
): PlayerState {
  return {
    id,
    hand,
    drawPile,
    discardPile: [],
    limbo: [],
    abyss: [],
    formation: { size: formationSize, slots: {} },
    dungeon: null,
    pool: [],
    lastingEffects: [],
  }
}

function determineDeckSize(cardCount: number): 55 | 75 | 110 {
  if (cardCount <= 60) return 55
  if (cardCount <= 85) return 75
  return 110
}
