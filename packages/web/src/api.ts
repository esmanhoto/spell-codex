const BASE = "/api"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CardInfo {
  instanceId:  string
  name:        string
  typeId:      number
  worldId:     number
  level:       number | string | null
  setId:       string
  cardNumber:  number
  description: string
}

export interface SlotState {
  realm:    CardInfo
  holdings: CardInfo[]
  isRazed:  boolean
}

export interface PoolEntry {
  champion:    CardInfo
  attachments: CardInfo[]
}

export interface PlayerBoard {
  hand:          CardInfo[]
  formation:     Record<string, SlotState | null>
  pool:          PoolEntry[]
  drawPileCount: number
  discardCount:  number
}

export interface CombatInfo {
  attackingPlayer: string
  defendingPlayer: string
  targetSlot:      string
  roundPhase:      string
  attacker:        CardInfo | null
  defender:        CardInfo | null
  attackerCards:   CardInfo[]
  defenderCards:   CardInfo[]
  attackerLevel:   number
  defenderLevel:   number
}

export type TargetScope =
  | "any_combat_card"
  | "opposing_combat_cards"
  | "own_combat_cards"
  | "none"

export interface PendingEffect {
  cardInstanceId:     string
  cardName:           string
  cardDescription:    string
  triggeringPlayerId: string
  targetScope:        TargetScope
}

export interface GameState {
  gameId:         string
  status:         string
  phase:          string
  activePlayer:   string
  turnNumber:     number
  turnDeadline:   string | null
  winner:         string | null
  legalMoves:     Move[]
  pendingEffects: PendingEffect[]
  board: {
    players: Record<string, PlayerBoard>
    combat:  CombatInfo | null
  }
  integrityErrors?: unknown[]
}

// Moves — mirror the engine's Move union (field names must match exactly)
export type Move =
  | { type: "PASS" }
  | { type: "PLAY_REALM";       cardInstanceId: string; slot: string }
  | { type: "REBUILD_REALM";    slot: string }
  | { type: "PLAY_HOLDING";     cardInstanceId: string; realmSlot: string }
  | { type: "PLACE_CHAMPION";   cardInstanceId: string }
  | { type: "ATTACH_ITEM";      cardInstanceId: string; championId: string }
  | { type: "PLAY_PHASE3_CARD"; cardInstanceId: string }
  | { type: "PLAY_PHASE5_CARD"; cardInstanceId: string }
  | { type: "PLAY_RULE_CARD";   cardInstanceId: string }
  | { type: "PLAY_EVENT";       cardInstanceId: string }
  | { type: "DECLARE_ATTACK";   championId: string; targetPlayerId: string; targetRealmSlot: string }
  | { type: "DECLARE_DEFENSE";  championId: string }
  | { type: "DECLINE_DEFENSE" }
  | { type: "PLAY_COMBAT_CARD"; cardInstanceId: string }
  | { type: "STOP_PLAYING" }
  | { type: "CONTINUE_ATTACK";  championId: string }
  | { type: "END_ATTACK" }
  | { type: "DISCARD_CARD";     cardInstanceId: string }
  | { type: "RESOLVE_EFFECT";   targetId: string }
  | { type: "SKIP_EFFECT" }
  | { type: string;             [key: string]: unknown }

// ─── API calls ────────────────────────────────────────────────────────────────

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, init)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export async function listDecks(): Promise<{ decks: string[] }> {
  return request("/decks")
}

export async function getDeck(name: string): Promise<{ name: string; cards: object[] }> {
  return request(`/decks/${encodeURIComponent(name)}`)
}

export async function createGame(opts: {
  playerAId:    string
  playerBId:    string
  playerBIsBot: boolean
  seed:         number
  deckA:        object[]
  deckB:        object[]
}): Promise<{ gameId: string }> {
  return request("/games", {
    method:  "POST",
    headers: { "Content-Type": "application/json", "X-User-Id": opts.playerAId },
    body: JSON.stringify({
      formatId: "standard-55",
      seed:     opts.seed,
      players: [
        { userId: opts.playerAId, deckSnapshot: opts.deckA, isBot: false },
        { userId: opts.playerBId, deckSnapshot: opts.deckB, isBot: opts.playerBIsBot },
      ],
    }),
  })
}

export async function getGameState(gameId: string, asUserId: string): Promise<GameState> {
  return request(`/games/${gameId}`, {
    headers: { "X-User-Id": asUserId },
  })
}

export async function submitMove(gameId: string, asUserId: string, move: Move): Promise<unknown> {
  return request(`/games/${gameId}/moves`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "X-User-Id": asUserId },
    body:    JSON.stringify(move),
  })
}
