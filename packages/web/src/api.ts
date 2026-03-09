const BASE = "/api"
const WS_BASE = (() => {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
  // In dev, Vite proxies /ws → localhost:3001/ws.
  return `${proto}//${window.location.host}`
})()

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CardInfo {
  instanceId: string
  name: string
  typeId: number
  worldId: number
  level: number | string | null
  setId: string
  cardNumber: number
  description: string
  supportIds: Array<number | string>
  spellNature: "offensive" | "defensive" | null
  castPhases: Array<3 | 4 | 5>
}

export interface SlotState {
  realm: CardInfo
  holdings: CardInfo[]
  isRazed: boolean
  holdingRevealedToAll: boolean
}

export interface PoolEntry {
  champion: CardInfo
  attachments: CardInfo[]
}

export interface PlayerBoard {
  hand: CardInfo[]
  handCount: number
  handHidden: boolean
  formation: Record<string, SlotState | null>
  pool: PoolEntry[]
  drawPileCount: number
  discardCount: number
  discardPile: CardInfo[]
  lastingEffects: CardInfo[]
}

export interface CombatInfo {
  attackingPlayer: string
  defendingPlayer: string
  targetSlot: string
  roundPhase: string
  attacker: CardInfo | null
  defender: CardInfo | null
  attackerCards: CardInfo[]
  defenderCards: CardInfo[]
  attackerLevel: number
  defenderLevel: number
  attackerManualLevel: number | null
  defenderManualLevel: number | null
}

export interface ResolutionContextInfo {
  cardInstanceId: string
  pendingCard: CardInfo
  initiatingPlayer: string
  resolvingPlayer: string
  cardDestination: "discard" | "abyss" | "void" | "in_play"
  attachTarget: {
    owner: string
    zone: "pool" | "formation"
    targetInstanceId?: string
    targetRealmSlot?: string
  } | null
}

export interface GameState {
  gameId: string
  viewerPlayerId: string | null
  playerOrder: string[]
  status: string
  phase: string
  activePlayer: string
  turnNumber: number
  turnDeadline: string | null
  winner: string | null
  handMaxSize: number
  legalMoves: Move[]
  legalMovesPerPlayer?: Record<string, Move[]>
  board: {
    players: Record<string, PlayerBoard>
    combat: CombatInfo | null
  }
  events?: GameEvent[]
  resolutionContext: ResolutionContextInfo | null
  integrityErrors?: unknown[]
}

export interface GameEvent {
  type: string
  [key: string]: unknown
}

export interface AuthIdentity {
  userId: string
  accessToken: string | null
}

// Moves — mirror the engine's Move union (field names must match exactly)
export type Move =
  | { type: "PASS" }
  | { type: "END_TURN" }
  | { type: "PLAY_REALM"; cardInstanceId: string; slot: string }
  | { type: "REBUILD_REALM"; slot: string }
  | { type: "PLAY_HOLDING"; cardInstanceId: string; realmSlot: string }
  | { type: "TOGGLE_HOLDING_REVEAL"; realmSlot: string }
  | { type: "PLACE_CHAMPION"; cardInstanceId: string }
  | { type: "ATTACH_ITEM"; cardInstanceId: string; championId: string }
  | {
      type: "PLAY_PHASE3_CARD"
      cardInstanceId: string
      keepInPlay?: boolean
      casterInstanceId?: string
      targetCardInstanceId?: string
      targetOwner?: "self" | "opponent"
    }
  | { type: "PLAY_PHASE5_CARD"; cardInstanceId: string }
  | { type: "PLAY_RULE_CARD"; cardInstanceId: string }
  | { type: "PLAY_EVENT"; cardInstanceId: string }
  | { type: "DECLARE_ATTACK"; championId: string; targetPlayerId: string; targetRealmSlot: string }
  | { type: "DECLARE_DEFENSE"; championId: string }
  | { type: "DECLINE_DEFENSE" }
  | { type: "PLAY_COMBAT_CARD"; cardInstanceId: string }
  | { type: "STOP_PLAYING" }
  | { type: "CONTINUE_ATTACK"; championId: string }
  | { type: "END_ATTACK" }
  | { type: "INTERRUPT_COMBAT" }
  | { type: "DISCARD_CARD"; cardInstanceId: string }
  | { type: "SET_COMBAT_LEVEL"; playerId: string; level: number }
  | { type: "SWITCH_COMBAT_SIDE"; cardInstanceId: string }
  | { type: "DISCARD_COMBAT_CARD"; cardInstanceId: string }
  | {
      type: "RETURN_FROM_DISCARD"
      playerId: string
      cardInstanceId: string
      destination: "hand" | "deck" | "pool"
    }
  | { type: "RESOLVE_DONE" }
  | { type: "RESOLVE_SET_CARD_DESTINATION"; destination: "discard" | "abyss" | "void" | "in_play" }
  | { type: "RESOLVE_RAZE_REALM"; playerId: string; slot: string }
  | { type: "RESOLVE_DRAW_CARDS"; playerId: string; count: number }
  | { type: "RESOLVE_RETURN_TO_POOL"; cardInstanceId: string }
  | {
      type: "RESOLVE_MOVE_CARD"
      cardInstanceId: string
      destination: { zone: string; playerId: string; returnsOnTurn?: number }
    }
  | { type: "RESOLVE_ATTACH_CARD"; cardInstanceId: string; targetInstanceId: string }
  | { type: string; [key: string]: unknown }

// ─── API calls ────────────────────────────────────────────────────────────────

function authHeaders(identity: AuthIdentity): Record<string, string> {
  if (identity.accessToken) return { Authorization: `Bearer ${identity.accessToken}` }
  return { "X-User-Id": identity.userId }
}

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
  identity: AuthIdentity
  playerBId: string
  seed: number
  deckA: object[]
  deckB: object[]
}): Promise<{ gameId: string }> {
  return request("/games", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(opts.identity) },
    body: JSON.stringify({
      formatId: "standard-55",
      seed: opts.seed,
      players: [
        { userId: opts.identity.userId, deckSnapshot: opts.deckA },
        { userId: opts.playerBId, deckSnapshot: opts.deckB },
      ],
    }),
  })
}

export async function createLobbyGame(opts: {
  identity: AuthIdentity
  seed: number
  deck: object[]
}): Promise<{ gameId: string; slug: string | null; status: "waiting" | "active" }> {
  return request("/games/lobby", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(opts.identity) },
    body: JSON.stringify({
      formatId: "standard-55",
      seed: opts.seed,
      deckSnapshot: opts.deck,
    }),
  })
}

export async function getLobbyStatus(
  gameId: string,
  identity: AuthIdentity,
): Promise<{
  gameId: string
  status: "waiting" | "active" | "finished" | "abandoned"
  playerCount: number
  isFull: boolean
}> {
  return request(`/games/${gameId}/lobby`, {
    headers: authHeaders(identity),
  })
}

export async function joinLobbyGame(opts: {
  identity: AuthIdentity
  gameId: string
  deck: object[]
}): Promise<{
  gameId: string
  status: "waiting" | "active" | "finished" | "abandoned"
  playerCount: number
  joined: boolean
  alreadyParticipant: boolean
}> {
  return request(`/games/${opts.gameId}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(opts.identity) },
    body: JSON.stringify({ deckSnapshot: opts.deck }),
  })
}

export async function getGameState(gameId: string, identity: AuthIdentity): Promise<GameState> {
  return request(`/games/${gameId}`, {
    headers: authHeaders(identity),
  })
}

// ─── Dev scenarios ────────────────────────────────────────────────────────────

export interface DevScenarioInfo {
  id: string
  name: string
  description: string
}

export async function listDevScenarios(): Promise<DevScenarioInfo[]> {
  const res = await request<{ scenarios: DevScenarioInfo[] }>("/dev/scenarios")
  return res.scenarios
}

export async function loadDevScenario(scenarioId: string): Promise<{
  gameId: string
  slug: string
  p1UserId: string
  p2UserId: string
}> {
  return request(`/dev/scenarios/${encodeURIComponent(scenarioId)}/load`, { method: "POST" })
}

export async function submitMove(
  gameId: string,
  identity: AuthIdentity,
  move: Move,
): Promise<unknown> {
  return request(`/games/${gameId}/moves`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(identity) },
    body: JSON.stringify(move),
  })
}

// ─── WebSocket client ─────────────────────────────────────────────────────────

export type WsClientMessage =
  | { type: "STATE_UPDATE"; gameId: string; state: GameState }
  | { type: "GAME_OVER"; gameId: string; winner: string }
  | { type: "PONG" }
  | { type: "ERROR"; code: string; message: string }

export interface WsClient {
  /** Returns true if the move was sent, false if the socket was not open. */
  sendMove: (move: Move) => boolean
  close: () => void
}

/**
 * Creates a WebSocket connection for real-time game play.
 * Auto-reconnects on disconnect. Calls `onMessage` for each server message.
 */
export function createWsClient(
  gameId: string,
  identity: AuthIdentity,
  onMessage: (msg: WsClientMessage) => void,
): WsClient {
  let ws: WebSocket | null = null
  let closed = false
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

  function connect() {
    if (closed) return
    ws = new WebSocket(`${WS_BASE}/ws`)

    ws.onopen = () => {
      ws!.send(
        JSON.stringify(
          identity.accessToken
            ? { type: "JOIN_GAME", gameId, token: identity.accessToken }
            : { type: "JOIN_GAME", gameId, playerId: identity.userId },
        ),
      )
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
        ws.send(JSON.stringify({ type: "SUBMIT_MOVE", gameId, move }))
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
