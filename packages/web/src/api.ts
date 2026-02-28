const BASE = "/api"
const WS_BASE = (() => {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
  // In dev, Vite proxies /api → localhost:3001; WS is on the same host
  return `${proto}//${window.location.host}/api`
})()

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
  attackingPlayer:    string
  defendingPlayer:    string
  targetSlot:         string
  roundPhase:         string
  attacker:           CardInfo | null
  defender:           CardInfo | null
  attackerCards:      CardInfo[]
  defenderCards:      CardInfo[]
  attackerLevel:      number
  defenderLevel:      number
  attackerManualLevel: number | null
  defenderManualLevel: number | null
}

export interface ResponseWindow {
  triggeringPlayerId:    string
  respondingPlayerId:    string
  effectCardInstanceId:  string
  effectCardName:        string
  effectCardDescription: string
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
  gameId:               string
  status:               string
  phase:                string
  activePlayer:         string
  turnNumber:           number
  turnDeadline:         string | null
  winner:               string | null
  legalMoves:           Move[]
  legalMovesPerPlayer?: Record<string, Move[]>
  pendingEffects:       PendingEffect[]
  responseWindow:       ResponseWindow | null
  board: {
    players: Record<string, PlayerBoard>
    combat:  CombatInfo | null
  }
  events?: GameEvent[]
  integrityErrors?: unknown[]
}

export interface GameEvent {
  type: string
  [key: string]: unknown
}

// Moves — mirror the engine's Move union (field names must match exactly)
export type ManualAction = "discard" | "to_limbo" | "to_abyss" | "raze_realm"

export type Move =
  | { type: "PASS" }
  | { type: "PLAY_REALM";              cardInstanceId: string; slot: string }
  | { type: "REBUILD_REALM";           slot: string }
  | { type: "PLAY_HOLDING";            cardInstanceId: string; realmSlot: string }
  | { type: "PLACE_CHAMPION";          cardInstanceId: string }
  | { type: "ATTACH_ITEM";             cardInstanceId: string; championId: string }
  | { type: "PLAY_PHASE3_CARD";        cardInstanceId: string }
  | { type: "PLAY_PHASE5_CARD";        cardInstanceId: string }
  | { type: "PLAY_RULE_CARD";          cardInstanceId: string }
  | { type: "PLAY_EVENT";              cardInstanceId: string }
  | { type: "DECLARE_ATTACK";          championId: string; targetPlayerId: string; targetRealmSlot: string }
  | { type: "DECLARE_DEFENSE";         championId: string }
  | { type: "DECLINE_DEFENSE" }
  | { type: "PLAY_COMBAT_CARD";        cardInstanceId: string }
  | { type: "STOP_PLAYING" }
  | { type: "CONTINUE_ATTACK";         championId: string }
  | { type: "END_ATTACK" }
  | { type: "DISCARD_CARD";            cardInstanceId: string }
  | { type: "RESOLVE_EFFECT";          targetId: string }
  | { type: "SKIP_EFFECT" }
  | { type: "PASS_RESPONSE" }
  | { type: "MANUAL_DISCARD";          cardInstanceId: string }
  | { type: "MANUAL_TO_LIMBO";         cardInstanceId: string; returnsInTurns?: number }
  | { type: "MANUAL_TO_ABYSS";         cardInstanceId: string }
  | { type: "MANUAL_TO_HAND";          cardInstanceId: string }
  | { type: "MANUAL_RAZE_REALM";       slot: string }
  | { type: "MANUAL_DRAW_CARDS";       count: number }
  | { type: "MANUAL_RETURN_TO_POOL";   cardInstanceId: string }
  | { type: "MANUAL_AFFECT_OPPONENT";  cardInstanceId: string; action: ManualAction }
  | { type: "MANUAL_SET_COMBAT_LEVEL";    playerId: string; level: number }
  | { type: "MANUAL_SWITCH_COMBAT_SIDE"; cardInstanceId: string }
  | { type: string;                       [key: string]: unknown }

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

// ─── WebSocket client ─────────────────────────────────────────────────────────

export type WsClientMessage =
  | { type: "STATE_UPDATE";           gameId: string; state: GameState }
  | { type: "RESPONSE_WINDOW_OPEN";   gameId: string; respondingPlayerId: string; effectCardName: string; effectCardDescription: string }
  | { type: "RESPONSE_WINDOW_CLOSED"; gameId: string }
  | { type: "GAME_OVER";              gameId: string; winner: string }
  | { type: "PONG" }
  | { type: "ERROR";                  code: string; message: string }

export interface WsClient {
  /** Returns true if the move was sent, false if the socket was not open. */
  sendMove: (move: Move) => boolean
  close:    () => void
}

/**
 * Creates a WebSocket connection for real-time game play.
 * Auto-reconnects on disconnect. Calls `onMessage` for each server message.
 */
export function createWsClient(
  gameId:    string,
  playerId:  string,
  onMessage: (msg: WsClientMessage) => void,
): WsClient {
  let ws: WebSocket | null = null
  let closed = false
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

  function connect() {
    if (closed) return
    ws = new WebSocket(`${WS_BASE}/ws`)

    ws.onopen = () => {
      ws!.send(JSON.stringify({ type: "JOIN_GAME", gameId, playerId }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WsClientMessage
        onMessage(msg)
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      if (closed) return
      // Auto-reconnect after 2 seconds
      reconnectTimeout = setTimeout(connect, 2000)
    }

    ws.onerror = () => {
      ws?.close()
    }
  }

  connect()

  return {
    sendMove(move: Move): boolean {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "SUBMIT_MOVE", gameId, playerId, move }))
        return true
      }
      return false
    },
    close() {
      closed = true
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      ws?.close()
    },
  }
}
