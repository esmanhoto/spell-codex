/**
 * Phase 6c — Dev scenario load + play integration test.
 * Covers: api + db + engine — load scenario → inject state → join WS → play.
 * Verifies state reconstruction from snapshot, move application on scenario
 * state, and DB persistence of scenario-based games.
 * Requires DATABASE_URL.
 */

import { describe, it, expect, beforeEach } from "bun:test"
import type { ServerWebSocket } from "bun"
import { wsHandlers, registry } from "../src/ws.ts"
import { evictCachedState } from "../src/state-cache.ts"
import { app } from "../src/index.ts"
import { getGame, reconstructState, listActions } from "@spell/db"
import { getLegalMoves } from "@spell/engine"
import type { GameState } from "@spell/engine"

process.env["AUTH_BYPASS"] = "true"

// ─── Mock socket ─────────────────────────────────────────────────────────────

interface WsData {
  gameId: string | null
  userId: string | null
  displayName: string | null
  lastChatTs: number
  idleTimer: ReturnType<typeof setTimeout> | null
}

interface MockSocket extends ServerWebSocket<WsData> {
  received: unknown[]
}

function mockSocket(data?: Partial<WsData>): MockSocket {
  const received: unknown[] = []
  return {
    data: {
      gameId: null,
      userId: null,
      displayName: null,
      lastChatTs: 0,
      idleTimer: null,
      ...data,
    },
    received,
    send(msg: string | Buffer) {
      received.push(JSON.parse(msg.toString()))
    },
    close() {},
    terminate() {},
    publish() {
      return 0
    },
    subscribe() {},
    unsubscribe() {},
    isSubscribed() {
      return false
    },
    cork() {},
    ping() {
      return 0
    },
    pong() {
      return 0
    },
    remoteAddress: "127.0.0.1",
    readyState: 1 as const,
    binaryType: "arraybuffer" as const,
  } as unknown as MockSocket
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEV_P1 = "00000000-0000-0000-0000-000000000001"
const DEV_P2 = "00000000-0000-0000-0000-000000000002"

function findMsg(ws: MockSocket, type: string): Record<string, unknown> | undefined {
  return ws.received.find((m) => (m as { type: string }).type === type) as
    | Record<string, unknown>
    | undefined
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loadScenario(): Promise<{ gameId: string; slug: string; scenarioId: string }> {
  const listRes = await app.request("/dev/scenarios")
  const { scenarios } = (await listRes.json()) as { scenarios: Array<{ id: string }> }
  expect(scenarios.length).toBeGreaterThan(0)

  const scenarioId = scenarios[0]!.id
  const res = await app.request(`/dev/scenarios/${scenarioId}/load`, { method: "POST" })
  expect(res.status).toBe(200)
  const body = (await res.json()) as { gameId: string; slug: string }
  return { ...body, scenarioId }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Dev scenario load + play (api + db + engine)", () => {
  beforeEach(() => {
    registry.clear()
  })

  it("loaded scenario has stateSnapshot in DB", async () => {
    const { gameId } = await loadScenario()
    const game = await getGame(gameId)

    expect(game).not.toBeNull()
    expect(game!.status).toBe("active")
    expect(game!.stateSnapshot).not.toBeNull()
  })

  it("reconstruct from snapshot matches initial state", async () => {
    const { gameId } = await loadScenario()
    const game = await getGame(gameId)

    // Reconstruct with snapshot
    const { state: withSnapshot } = await reconstructState(
      gameId,
      game!.seed,
      game!.stateSnapshot as GameState,
    )

    // Should have both players
    expect(withSnapshot.players[DEV_P1]).toBeDefined()
    expect(withSnapshot.players[DEV_P2]).toBeDefined()
    expect(withSnapshot.activePlayer).toBeDefined()
  })

  it("WS join on scenario game returns valid STATE_UPDATE", async () => {
    const { gameId } = await loadScenario()
    evictCachedState(gameId)

    const ws = mockSocket()
    await wsHandlers.message(
      ws as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "JOIN_GAME", gameId, playerId: DEV_P1 }),
    )

    const msg = findMsg(ws, "STATE_UPDATE")
    expect(msg).toBeDefined()
    expect(msg!["gameId"]).toBe(gameId)
    expect(msg!["rawEngineState"]).toBeDefined()

    const engineState = msg!["rawEngineState"] as GameState
    expect(engineState.players[DEV_P1]).toBeDefined()
    expect(engineState.players[DEV_P2]).toBeDefined()
  })

  it("submitting legal move on scenario game persists to DB", async () => {
    const { gameId } = await loadScenario()
    evictCachedState(gameId)

    const ws = mockSocket()
    await wsHandlers.message(
      ws as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "JOIN_GAME", gameId, playerId: DEV_P1 }),
    )

    const stateMsg = findMsg(ws, "STATE_UPDATE")
    const engineState = stateMsg!["rawEngineState"] as GameState
    ws.received.length = 0

    // Find a legal move for the active player
    const activePlayer = engineState.activePlayer
    const legalMoves = getLegalMoves(engineState, activePlayer)
    expect(legalMoves.length).toBeGreaterThan(0)
    const move = legalMoves[0]!

    const activeWs = activePlayer === DEV_P1 ? ws : mockSocket()
    if (activePlayer !== DEV_P1) {
      await wsHandlers.message(
        activeWs as unknown as ServerWebSocket<WsData>,
        JSON.stringify({ type: "JOIN_GAME", gameId, playerId: DEV_P2 }),
      )
      activeWs.received.length = 0
    }

    await wsHandlers.message(
      activeWs as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "SUBMIT_MOVE", gameId, move }),
    )

    // Verify action in DB
    const actions = await listActions(gameId)
    expect(actions.length).toBe(1)
    expect((actions[0]!.move as { type: string }).type).toBe(move.type)
  })

  it("reconstruct after move on scenario game produces valid state", async () => {
    const { gameId } = await loadScenario()
    evictCachedState(gameId)

    // Join and find a legal move
    const ws = mockSocket()
    await wsHandlers.message(
      ws as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "JOIN_GAME", gameId, playerId: DEV_P1 }),
    )
    const stateMsg = findMsg(ws, "STATE_UPDATE")
    const engineState = stateMsg!["rawEngineState"] as GameState
    ws.received.length = 0

    const activePlayer = engineState.activePlayer
    const legalMoves = getLegalMoves(engineState, activePlayer)
    const move = legalMoves[0]!

    const activeWs = activePlayer === DEV_P1 ? ws : mockSocket()
    if (activePlayer !== DEV_P1) {
      await wsHandlers.message(
        activeWs as unknown as ServerWebSocket<WsData>,
        JSON.stringify({ type: "JOIN_GAME", gameId, playerId: DEV_P2 }),
      )
      activeWs.received.length = 0
    }

    await wsHandlers.message(
      activeWs as unknown as ServerWebSocket<WsData>,
      JSON.stringify({ type: "SUBMIT_MOVE", gameId, move }),
    )

    // Verify action persisted
    const actions = await listActions(gameId)
    expect(actions.length).toBe(1)

    // Reconstruct from DB — should complete without errors
    const game = await getGame(gameId)
    const { state: reconstructed, errors } = await reconstructState(
      gameId,
      game!.seed,
      game!.stateSnapshot as GameState,
    )
    expect(errors.length).toBe(0)
    expect(reconstructed.players[DEV_P1]).toBeDefined()
    expect(reconstructed.players[DEV_P2]).toBeDefined()
  })

  it("give-card on scenario game works end-to-end", async () => {
    const { gameId } = await loadScenario()

    // Give a card via dev endpoint
    const res = await app.request(`/dev/games/${gameId}/give-card`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: DEV_P1, setId: "1st", cardNumber: 1 }),
    })
    expect(res.status).toBe(200)

    // Verify action persisted
    const actions = await listActions(gameId)
    expect(actions.length).toBe(1)
    expect((actions[0]!.move as { type: string }).type).toBe("DEV_GIVE_CARD")

    // Verify reconstruct from snapshot replays without errors
    const game = await getGame(gameId)
    const { state, errors } = await reconstructState(
      gameId,
      game!.seed,
      game!.stateSnapshot as GameState,
    )
    expect(errors.length).toBe(0)

    // Player should have the given card in hand
    const p1Hand = state.players[DEV_P1]!.hand
    const hasGivenCard = p1Hand.some((ci) => ci.card.setId === "1st" && ci.card.cardNumber === 1)
    expect(hasGivenCard).toBe(true)
  })
})
