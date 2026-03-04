import { expect, type APIRequestContext, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const PLAYER_A = "00000000-0000-0000-0000-000000000001"
export const PLAYER_B = "00000000-0000-0000-0000-000000000002"
const API_BASE = "/api"
const SPELL_TYPE_IDS = new Set([4, 19]) // Cleric/Wizard spells
const FIRST_EDITION_CARDS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../data/cards/1st.json",
)

function readFirstEditionCards<T extends Record<string, unknown>>(): T[] {
  return JSON.parse(readFileSync(FIRST_EDITION_CARDS_PATH, "utf8")) as T[]
}

export async function startGame(page: Page, request: APIRequestContext) {
  const gameId = await apiCreateGameForUi(request)
  await page.goto(`/game/${gameId}`)
  await expect(page.getByTestId("game-board")).toBeVisible()
}

export async function hasMove(page: Page, playerId: string, moveType: string): Promise<boolean> {
  const panel = page.getByTestId(`move-panel-${playerId}`)
  if ((await panel.count()) === 0) return false
  return (await panel.locator(`button[data-move-type="${moveType}"]`).count()) > 0
}

export async function clickMove(page: Page, playerId: string, moveType: string): Promise<boolean> {
  const panel = page.getByTestId(`move-panel-${playerId}`)
  if ((await panel.count()) === 0) return false
  const btn = panel.locator(`button[data-move-type="${moveType}"]`).first()
  if ((await btn.count()) === 0) return false
  try {
    await btn.click({ timeout: 1000 })
    return true
  } catch {
    return false
  }
}

export async function apiCreateGameForUi(request: APIRequestContext) {
  const deckARes = await request.get(`${API_BASE}/decks/1st_edition_starter_deck_a-1`)
  const deckBRes = await request.get(`${API_BASE}/decks/1st_edition_starter_deck_b-1`)
  expect(deckARes.ok()).toBe(true)
  expect(deckBRes.ok()).toBe(true)
  const deckA = (await deckARes.json()) as { cards: object[] }
  const deckB = (await deckBRes.json()) as { cards: object[] }

  const createRes = await request.post(`${API_BASE}/games`, {
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": PLAYER_A,
    },
    data: {
      formatId: "standard-55",
      seed: Math.floor(Math.random() * 0x7fffffff),
      players: [
        { userId: PLAYER_A, deckSnapshot: deckA.cards },
        { userId: PLAYER_B, deckSnapshot: deckB.cards },
      ],
    },
  })
  expect(createRes.ok()).toBe(true)
  const created = (await createRes.json()) as { gameId: string }
  return created.gameId
}

export async function apiCreateSpellOnlyGameForUi(request: APIRequestContext) {
  const decksRes = await request.get(`${API_BASE}/decks`)
  expect(decksRes.ok()).toBe(true)
  const decks = (await decksRes.json()) as { decks: string[] }

  let spellCard: Record<string, unknown> | null = null
  for (const name of decks.decks) {
    const deckRes = await request.get(`${API_BASE}/decks/${name}`)
    if (!deckRes.ok()) continue
    const deck = (await deckRes.json()) as {
      cards: Array<Record<string, unknown> & { typeId?: number }>
    }
    spellCard = deck.cards.find((c) => c.typeId === 4 || c.typeId === 19) ?? null
    if (spellCard) break
  }

  expect(spellCard).not.toBeNull()
  const spellDeck = Array.from({ length: 55 }, () => ({ ...spellCard! }))

  const createRes = await request.post(`${API_BASE}/games`, {
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": PLAYER_A,
    },
    data: {
      formatId: "standard-55",
      seed: 123456,
      players: [
        { userId: PLAYER_A, deckSnapshot: spellDeck },
        { userId: PLAYER_B, deckSnapshot: spellDeck },
      ],
    },
  })
  expect(createRes.ok()).toBe(true)
  const created = (await createRes.json()) as { gameId: string }
  return created.gameId
}

export async function apiCreatePhase3SpellGameForUi(request: APIRequestContext) {
  const cards = readFirstEditionCards<
    Record<string, unknown> & {
      typeId: number
      castPhases?: number[]
      supportIds?: Array<number | string>
    }
  >()

  const realm = cards.find((c) => c.typeId === 13)
  const spell = cards.find(
    (c) => (c.typeId === 4 || c.typeId === 19) && (c.castPhases ?? []).includes(3),
  )
  const champion = cards.find((c) => {
    if (![5, 7, 10, 12, 14, 16, 20].includes(c.typeId)) return false
    if (!spell) return false
    const supports = c.supportIds ?? []
    return (
      supports.includes(spell.typeId) ||
      supports.includes(`o${spell.typeId}`) ||
      supports.includes(`d${spell.typeId}`)
    )
  })

  expect(realm).toBeDefined()
  expect(spell).toBeDefined()
  expect(champion).toBeDefined()

  const spellDeck = [
    ...Array.from({ length: 20 }, () => ({ ...realm! })),
    ...Array.from({ length: 20 }, () => ({ ...champion! })),
    ...Array.from({ length: 15 }, () => ({ ...spell! })),
  ]

  const createRes = await request.post(`${API_BASE}/games`, {
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": PLAYER_A,
    },
    data: {
      formatId: "standard-55",
      seed: 20260302,
      players: [
        { userId: PLAYER_A, deckSnapshot: spellDeck },
        { userId: PLAYER_B, deckSnapshot: spellDeck },
      ],
    },
  })
  expect(createRes.ok()).toBe(true)
  const created = (await createRes.json()) as { gameId: string }
  return created.gameId
}

export async function apiCreateCombatReadyGameForUi(request: APIRequestContext) {
  const cards = readFirstEditionCards<
    Record<string, unknown> & {
      typeId: number
      name: string
    }
  >()

  const realmByName = new Map<string, Record<string, unknown> & { typeId: number; name: string }>()
  for (const card of cards) {
    if (card.typeId !== 13) continue
    if (!realmByName.has(card.name)) realmByName.set(card.name, card)
  }

  const championByName = new Map<
    string,
    Record<string, unknown> & { typeId: number; name: string }
  >()
  for (const card of cards) {
    if (![5, 7, 10, 12, 14, 16, 20].includes(card.typeId)) continue
    if (!championByName.has(card.name)) championByName.set(card.name, card)
  }

  const realmPool = Array.from(realmByName.values()).slice(0, 16)
  const championPool = Array.from(championByName.values()).slice(0, 16)
  expect(realmPool.length).toBeGreaterThan(5)
  expect(championPool.length).toBeGreaterThan(5)

  const seedCards = [...realmPool, ...championPool]
  const combatDeck = Array.from({ length: 55 }, (_, i) => ({ ...seedCards[i % seedCards.length]! }))

  const createRes = await request.post(`${API_BASE}/games`, {
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": PLAYER_A,
    },
    data: {
      formatId: "standard-55",
      seed: 20260304,
      players: [
        { userId: PLAYER_A, deckSnapshot: combatDeck },
        { userId: PLAYER_B, deckSnapshot: combatDeck },
      ],
    },
  })
  expect(createRes.ok()).toBe(true)
  const created = (await createRes.json()) as { gameId: string }
  return created.gameId
}

export async function apiDriveToPlayerAPhase3SpellMove(
  request: APIRequestContext,
  gameId: string,
): Promise<{ cardInstanceId: string }> {
  for (let i = 0; i < 400; i++) {
    const viewerRes = await request.get(`${API_BASE}/games/${gameId}`, {
      headers: { "X-User-Id": PLAYER_A },
    })
    expect(viewerRes.ok()).toBe(true)
    const viewerState = (await viewerRes.json()) as {
      activePlayer: string
      playMode?: string
      board: {
        players: Record<
          string,
          {
            hand: Array<{ instanceId: string; typeId: number; castPhases?: number[] }>
          }
        >
      }
      legalMoves: Array<{ type: string; [key: string]: unknown }>
    }
    const actingUser = viewerState.activePlayer === PLAYER_B ? PLAYER_B : PLAYER_A
    const state =
      actingUser === PLAYER_A
        ? viewerState
        : await request
            .get(`${API_BASE}/games/${gameId}`, {
              headers: { "X-User-Id": actingUser },
            })
            .then(async (res) => {
              expect(res.ok()).toBe(true)
              return res.json() as Promise<typeof viewerState>
            })

    if (state.activePlayer === PLAYER_A) {
      const legalPhase3 = state.legalMoves.filter(
        (m): m is { type: "PLAY_PHASE3_CARD"; cardInstanceId: string } =>
          m.type === "PLAY_PHASE3_CARD" && typeof m.cardInstanceId === "string",
      )

      const myHand = state.board.players[PLAYER_A]?.hand ?? []
      const spellCast = legalPhase3.find((move) => {
        const card = myHand.find((c) => c.instanceId === move.cardInstanceId)
        if (!card) return false
        if (!SPELL_TYPE_IDS.has(card.typeId)) return false
        return (card.castPhases ?? []).includes(3)
      })

      if (spellCast) {
        return { cardInstanceId: spellCast.cardInstanceId }
      }
    }

    const picked =
      state.legalMoves.find(
        (m): m is { type: "SET_PLAY_MODE"; mode: string } =>
          m.type === "SET_PLAY_MODE" && m.mode === "semi_auto",
      ) ??
      state.legalMoves.find((m) => m.type === "PLAY_REALM") ??
      state.legalMoves.find((m) => m.type === "PLACE_CHAMPION") ??
      state.legalMoves.find((m) => m.type === "PASS") ??
      state.legalMoves.find((m) => m.type === "END_TURN") ??
      state.legalMoves.find((m) => m.type === "DISCARD_CARD") ??
      state.legalMoves.find((m) => m.type !== "PLAY_PHASE3_CARD")

    if (!picked) break

    const moveRes = await request.post(`${API_BASE}/games/${gameId}/moves`, {
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": state.activePlayer,
      },
      data: picked,
    })
    expect(moveRes.ok()).toBe(true)
  }

  throw new Error("Could not reach a state where Player A can cast a phase-3 spell")
}

export async function driveGameToCombat(request: APIRequestContext, gameId: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    const viewerRes = await request.get(`${API_BASE}/games/${gameId}`, {
      headers: { "X-User-Id": PLAYER_A },
    })
    expect(viewerRes.ok()).toBe(true)
    const viewerState = (await viewerRes.json()) as {
      activePlayer: string
      phase: string
      playMode?: string
      board: {
        players: Record<
          string,
          {
            pool: unknown[]
          }
        >
      }
      legalMoves: Array<{ type: string; [key: string]: unknown }>
    }
    const actingUser = viewerState.activePlayer === PLAYER_B ? PLAYER_B : PLAYER_A
    const state =
      actingUser === PLAYER_A
        ? viewerState
        : await request
            .get(`${API_BASE}/games/${gameId}`, {
              headers: { "X-User-Id": actingUser },
            })
            .then(async (res) => {
              expect(res.ok()).toBe(true)
              return res.json() as Promise<typeof viewerState>
            })

    const moves = state.legalMoves
    const activePoolCount = state.board.players[state.activePlayer]?.pool.length ?? 0
    const switchToSemiAuto = moves.find(
      (m): m is { type: "SET_PLAY_MODE"; mode: string } =>
        m.type === "SET_PLAY_MODE" && m.mode === "semi_auto",
    )
    const attack = moves.find((m) => m.type === "DECLARE_ATTACK")
    const picked =
      switchToSemiAuto ??
      attack ??
      moves.find((m) => m.type === "PLAY_REALM") ??
      (activePoolCount === 0 ? moves.find((m) => m.type === "PLACE_CHAMPION") : undefined) ??
      moves.find((m) => m.type === "PASS") ??
      moves.find((m) => m.type === "DISCARD_CARD") ??
      moves.find((m) => m.type === "END_TURN") ??
      moves.find((m) => !m.type.startsWith("MANUAL_")) ??
      moves[0]

    if (!picked) break
    const moveRes = await request.post(`${API_BASE}/games/${gameId}/moves`, {
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": state.activePlayer,
      },
      data: picked,
    })
    expect(moveRes.ok()).toBe(true)

    if (picked.type === "DECLARE_ATTACK") return
  }

  throw new Error("Could not reach combat setup within move budget")
}
