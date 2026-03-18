import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { useParams, useLocation, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { applyMove } from "@spell/engine"
import type { GameState as EngineGameState } from "@spell/engine"
import { getGameState, submitMove, createWsClient, loadDevScenario } from "../api.ts"
import type { GameState, Move, GameEvent, WsClientMessage, CardInfo } from "../api.ts"
import { serializeEngineStateForClient } from "../utils/client-serialize.ts"
import { hashEngineState } from "../utils/state-hash.ts"
import { cardImageUrl, CARD_BACK_URL } from "../utils/card-helpers.ts"
import { BoardContext } from "../context/BoardContext.tsx"
import { CombatContext } from "../context/CombatContext.tsx"
import { MovesContext } from "../context/MovesContext.tsx"
import { UIContext } from "../context/UIContext.tsx"
import type { ContextMenuState } from "../context/types.ts"
import type { TargetPickerState } from "../context/UIContext.tsx"
import { useAuth } from "../auth.tsx"
import { GameBoard } from "../components/game/GameBoard.tsx"
import { GameLoadingScreen } from "../components/game/GameLoadingScreen.tsx"
import { CasterSelectModal } from "../components/game/CasterSelectModal.tsx"
import { ResolutionPanel } from "../components/game/ResolutionPanel.tsx"
import { TriggerPanel } from "../components/game/TriggerPanel.tsx"
import {
  SpellCastAnnouncementModal,
  type SpellCastAnnouncement,
} from "../components/game/SpellCastAnnouncementModal.tsx"
import {
  ResolutionOutcomeModal,
  type ResolutionOutcome,
} from "../components/game/ResolutionOutcomeModal.tsx"
import {
  isSpellCard,
  resolveSpellMove,
  spellCastersInPool,
  phaseToCastPhase,
  getCastPhases,
  spellCasterInCombat,
} from "../utils/spell-casting.ts"
import {
  classifyWarningCode,
  readSuppressedWarnings,
  persistSuppressedWarnings,
} from "../utils/warnings.ts"
import type { WarningCode } from "../utils/warnings.ts"
import { applyOptimisticMove } from "../utils/optimistic-state.ts"
import { MusicPlayer } from "../components/MusicPlayer.tsx"
import { ChatBar } from "../components/game/ChatBar.tsx"
import { ChatPanel } from "../components/game/ChatPanel.tsx"
import { EmoteOverlay } from "../components/game/EmoteOverlay.tsx"
import { DevGiveCardPanel } from "../components/game/DevGiveCardPanel.tsx"
import { useChat } from "../hooks/useChat.ts"
import "../styles/game-vars.css"

/** Zero-out opponent hidden zones to match server-side filterStateForPlayer. */
function filterLocalState(state: EngineGameState, viewerId: string): EngineGameState {
  const players = { ...state.players }
  for (const id of Object.keys(players)) {
    if (id !== viewerId) {
      players[id] = { ...players[id]!, hand: [], drawPile: [] }
    }
  }
  return { ...state, players }
}

type Phase3SpellCastEvent = {
  type: "PHASE3_SPELL_CAST"
  playerId: string
  instanceId: string
  setId: string
  cardNumber: number
  cardName: string
  cardTypeId: number
  keepInPlay?: boolean
}

function isPhase3SpellCastEvent(event: GameEvent): event is GameEvent & Phase3SpellCastEvent {
  return event.type === "PHASE3_SPELL_CAST"
}

function collectCardImageUrls(deckCardImages?: Array<[string, number]>): string[] {
  const urls = new Set<string>()
  urls.add(CARD_BACK_URL)
  if (deckCardImages) {
    for (const [setId, cardNumber] of deckCardImages) {
      urls.add(cardImageUrl(setId, cardNumber))
    }
  }
  return [...urls]
}

function buildLingeringSpellsByPlayer(
  playerIds: string[],
  boards: Record<string, import("../api.ts").PlayerBoard> | undefined,
): Record<string, CardInfo[]> {
  const result = Object.fromEntries(playerIds.map((id) => [id, [] as CardInfo[]]))
  if (!boards) return result
  for (const id of playerIds) {
    result[id] = boards[id]?.lastingEffects ?? []
  }
  return result
}

export function Game() {
  const { id: gameId } = useParams<{ id: string }>()
  const location = useLocation()
  const { identity, bypass } = useAuth()
  const navigate = useNavigate()
  const searchParams = new URLSearchParams(location.search)
  const devAs = bypass ? searchParams.get("devAs") : null
  const devScenarioId = bypass ? searchParams.get("scenario") : null
  const effectiveIdentity: typeof identity = devAs ? { userId: devAs, accessToken: null } : identity
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [eventLog, setEventLog] = useState<GameEvent[]>([])
  const [wsError, setWsError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [rebuildTarget, setRebuildTarget] = useState<string | null>(null)
  const [warningState, setWarningState] = useState<{
    message: string
    code: WarningCode
    suppressible: boolean
    proceedLabel?: string
    confirmAction?: () => void
  } | null>(null)
  const [casterPrompt, setCasterPrompt] = useState<{
    spell: CardInfo
    move: Move
    casters: CardInfo[]
    target?: { cardInstanceId: string; owner: "self" | "opponent" }
  } | null>(null)
  const [announcementQueue, setAnnouncementQueue] = useState<SpellCastAnnouncement[]>([])
  const [activeAnnouncement, setActiveAnnouncement] = useState<SpellCastAnnouncement | null>(null)
  const [resolutionOutcome, setResolutionOutcome] = useState<ResolutionOutcome | null>(null)
  const [counterReveal, setCounterReveal] = useState<{
    setId: string
    cardNumber: number
    cardName: string
    cancelledCardName: string
  } | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [imagesReady, setImagesReady] = useState(false)
  const [imageProgress, setImageProgress] = useState({ loaded: 0, total: 0 })
  const preCacheStartedRef = useRef(false)

  const resolutionWatchRef = useRef<{ card: CardInfo; playerId: string; effects: string[] } | null>(
    null,
  )
  const spellTargetsRef = useRef<
    Record<
      string,
      {
        cardInstanceId: string
        owner: "self" | "opponent"
        casterInstanceId?: string
      }
    >
  >({})
  const suppressedWarningsRef = useRef<Set<WarningCode>>(new Set())
  const processedEventsRef = useRef(0)
  const wsRef = useRef<ReturnType<typeof createWsClient> | null>(null)
  // Optimistic UI: snapshot of last server-confirmed state for rollback on error
  const lastConfirmedStateRef = useRef<GameState | null>(null)
  // Ref to current data so sendMove can read it without a stale closure
  const currentDataRef = useRef<GameState | undefined>(undefined)
  // Stable players ref — only updated when we have actual player data, never reset to undefined
  const stablePlayersRef = useRef<GameState["players"]>(undefined)
  const stableOpponentIdRef = useRef<string>("")
  // Client-side engine state for local move application (Phase 6)
  const localEngineStateRef = useRef<EngineGameState | null>(null)
  const {
    messages: chatMessages,
    unreadCount,
    floatingEmotes,
    onWsMessage: onChatWsMessage,
    sendMessage,
    sendEmote,
    resetUnread,
  } = useChat(wsRef, chatOpen)

  const openContextMenu = useCallback(
    (x: number, y: number, actions: ContextMenuState["actions"]) => {
      setContextMenu({ x, y, actions })
    },
    [],
  )
  const closeContextMenu = useCallback(() => setContextMenu(null), [])
  const [targetPicker, setTargetPicker] = useState<TargetPickerState | null>(null)
  const openTargetPicker = useCallback(
    (title: string, targets: TargetPickerState["targets"]) => setTargetPicker({ title, targets }),
    [],
  )
  const closeTargetPicker = useCallback(() => setTargetPicker(null), [])
  const showWarning = useCallback(
    (
      message: string,
      code: WarningCode = "generic_warning",
      suppressible = true,
      confirmAction?: () => void,
      proceedLabel?: string,
    ) => {
      if (suppressible && suppressedWarningsRef.current.has(code)) {
        if (confirmAction) confirmAction()
        return
      }
      setWarningState({
        message,
        code,
        suppressible,
        ...(confirmAction ? { confirmAction } : {}),
        ...(proceedLabel ? { proceedLabel } : {}),
      })
    },
    [],
  )
  const clearWarning = useCallback(() => setWarningState(null), [])
  const suppressWarningCode = useCallback((code: WarningCode) => {
    if (suppressedWarningsRef.current.has(code)) return
    const next = new Set(suppressedWarningsRef.current)
    next.add(code)
    suppressedWarningsRef.current = next
    persistSuppressedWarnings(next)
  }, [])

  const myPlayerId = effectiveIdentity?.userId ?? ""

  useEffect(() => {
    suppressedWarningsRef.current = readSuppressedWarnings()
  }, [])

  useEffect(() => {
    processedEventsRef.current = 0
    setEventLog([])
    setAnnouncementQueue([])
    setActiveAnnouncement(null)
  }, [gameId])

  // Cross-tab scenario restart: when another tab reloads a scenario, navigate here too
  useEffect(() => {
    if (!bypass) return
    function onStorage(e: StorageEvent) {
      if (e.key !== "spell:dev-restart" || !e.newValue) return
      const data = JSON.parse(e.newValue) as {
        scenarioId: string
        slug: string
        p1UserId: string
        p2UserId: string
      }
      const myId = effectiveIdentity?.userId
      const target =
        myId === data.p2UserId
          ? `/game/${data.slug}?devAs=${data.p2UserId}&scenario=${data.scenarioId}`
          : `/game/${data.slug}?scenario=${data.scenarioId}`
      navigate(target)
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [bypass, effectiveIdentity, navigate])

  async function handleRestartScenario() {
    if (!devScenarioId) return
    const result = await loadDevScenario(devScenarioId)
    const slug = result.slug ?? result.gameId
    localStorage.setItem(
      "spell:dev-restart",
      JSON.stringify({
        scenarioId: devScenarioId,
        slug,
        p1UserId: result.p1UserId,
        p2UserId: result.p2UserId,
        ts: Date.now(),
      }),
    )
    const myId = effectiveIdentity?.userId
    const target =
      myId === result.p2UserId
        ? `/game/${slug}?devAs=${result.p2UserId}&scenario=${devScenarioId}`
        : `/game/${slug}?scenario=${devScenarioId}`
    navigate(target)
  }

  const { data, error, isLoading, refetch } = useQuery<GameState>({
    queryKey: ["game", gameId, myPlayerId],
    queryFn: () => getGameState(gameId!, effectiveIdentity!),
    enabled: !!gameId && !!effectiveIdentity,
    staleTime: Infinity,
    // Safety-net poll — MOVE_APPLIED delta handles real-time updates (Phase 6).
    // This only matters if WS drops silently without triggering a reconnect.
    refetchInterval: (query) => (query.state.data?.winner ? false : 60_000),
  })
  // Keep ref in sync so sendMove can access current state without a stale closure
  currentDataRef.current = data
  // Only update stable players when we actually have player data
  if (data?.players) stablePlayersRef.current = data.players

  // Pre-cache all card images on first load before showing the game board
  useEffect(() => {
    if (!data || preCacheStartedRef.current) return
    preCacheStartedRef.current = true
    const urls = collectCardImageUrls(data.deckCardImages)
    if (urls.length === 0) {
      setImagesReady(true)
      return
    }
    setImageProgress({ loaded: 0, total: urls.length })
    let loaded = 0
    for (const url of urls) {
      const img = new Image()
      img.onload = img.onerror = () => {
        loaded++
        setImageProgress({ loaded, total: urls.length })
        if (loaded === urls.length) setImagesReady(true)
      }
      img.src = url
    }
  }, [data])

  const processIncomingEvents = useCallback(
    (events: GameEvent[]) => {
      if (events.length <= processedEventsRef.current) return
      const newEvents = events.slice(processedEventsRef.current)
      processedEventsRef.current = events.length
      setEventLog((prev) => [...prev, ...newEvents])

      const announcements: SpellCastAnnouncement[] = []
      for (const event of newEvents) {
        if (isPhase3SpellCastEvent(event)) {
          if (event.playerId !== myPlayerId) {
            announcements.push({
              playerId: event.playerId,
              playerLabel: "Opponent",
              cardName: event.cardName,
              setId: event.setId,
              cardNumber: event.cardNumber,
              keepInPlay: event.keepInPlay ?? false,
            })
          }
        }
        // Accumulate effects while watching an opponent resolve
        if (resolutionWatchRef.current) {
          const watched = resolutionWatchRef.current
          switch (event.type) {
            case "REALM_RAZED":
              watched.effects.push(`Razed ${event.realmName as string}`)
              break
            case "REALM_REBUILT":
              watched.effects.push(`Rebuilt ${event.realmName as string}`)
              break
            case "CARDS_DRAWN":
              watched.effects.push(
                `${event.playerId === myPlayerId ? "You drew" : "Opponent drew"} ${event.count as number} card(s)`,
              )
              break
            case "CARD_ZONE_MOVED": {
              const cardName = event.cardName as string
              const to = event.toZone as string
              if (to === "discard") {
                watched.effects.push(`Discarded ${cardName}`)
              } else if (to === "abyss" || to === "void") {
                watched.effects.push(`Sent ${cardName} to the Abyss`)
              } else if (to === "limbo") {
                watched.effects.push(`Sent ${cardName} to limbo`)
              } else {
                watched.effects.push(`Moved ${cardName} to ${to}`)
              }
              break
            }
            case "CHAMPION_RETURNED_TO_POOL":
              watched.effects.push(`Returned ${event.cardName as string} to pool`)
              break
          }
        }
        if (event.type === "COUNTER_PLAYED" && event.playerId !== myPlayerId) {
          setCounterReveal({
            setId: event.setId as string,
            cardNumber: event.cardNumber as number,
            cardName: event.cardName as string,
            cancelledCardName: event.cancelledCardName as string,
          })
        }
        if (event.type === "RESOLUTION_COMPLETED" && event.playerId !== myPlayerId) {
          const watched = resolutionWatchRef.current
          if (watched && watched.playerId === event.playerId) {
            setResolutionOutcome({
              card: watched.card,
              destination: event.destination as string,
              effects: watched.effects,
            })
            resolutionWatchRef.current = null
          }
        }
      }
      if (announcements.length > 0) {
        setAnnouncementQueue((prev) => [...prev, ...announcements])
      }
    },
    [myPlayerId, showWarning],
  )

  const handleWsMessage = useCallback(
    (msg: WsClientMessage) => {
      if (msg.type === "STATE_UPDATE") {
        // Initialize local engine state from raw engine state (JOIN_GAME / SYNC_REQUEST)
        if (msg.rawEngineState) {
          localEngineStateRef.current = msg.rawEngineState as EngineGameState
        }
        // Server confirmed — clear rollback snapshot
        lastConfirmedStateRef.current = null
        const state = msg.state as GameState
        // Preserve players (nicknames) — WS STATE_UPDATE doesn't include them
        const prev = currentDataRef.current
        const merged = prev?.players ? { ...state, players: prev.players } : state
        qc.setQueryData(["game", gameId, myPlayerId], merged)
        if (state.events?.length) processIncomingEvents(state.events)
      } else if (msg.type === "MOVE_APPLIED") {
        const engineState = localEngineStateRef.current
        // Opponent moves: can't replay locally (we don't have their hand/drawPile),
        // so request an authoritative sync from the server instead.
        if (!engineState || msg.playerId !== myPlayerId) {
          wsRef.current?.sendSyncRequest(msg.gameId)
          return
        }
        let newEngineState: EngineGameState
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = applyMove(engineState, msg.playerId, msg.move as any)
          newEngineState = result.newState
        } catch (err) {
          console.warn("[phase6] engine error on MOVE_APPLIED — requesting sync", err)
          wsRef.current?.sendSyncRequest(msg.gameId)
          return
        }
        // Hash reconciliation — hash the filtered view (opponent hand/drawPile hidden)
        const filteredForHash = filterLocalState(newEngineState, myPlayerId)
        void hashEngineState(filteredForHash).then((clientHash) => {
          if (clientHash !== msg.stateHash) {
            console.warn(
              `[phase6] hash mismatch (client=${clientHash.slice(0, 8)} server=${msg.stateHash.slice(0, 8)}) — requesting sync`,
            )
            wsRef.current?.sendSyncRequest(msg.gameId)
          }
        })
        localEngineStateRef.current = newEngineState
        // Derive API state and update React query cache
        const currentApiState = currentDataRef.current
        const apiState = serializeEngineStateForClient(newEngineState, myPlayerId, {
          status: msg.status,
          turnDeadline: msg.turnDeadline,
          winner: msg.winner,
          players: currentApiState?.players,
        })
        // Preserve deckCardImages from current state
        const merged: GameState = {
          ...(currentApiState ?? {}),
          ...apiState,
          ...(currentApiState?.deckCardImages
            ? { deckCardImages: currentApiState.deckCardImages }
            : {}),
        }
        // Server confirmed — clear rollback snapshot
        lastConfirmedStateRef.current = null
        qc.setQueryData(["game", gameId, myPlayerId], merged)
        if (newEngineState.events.length) processIncomingEvents(newEngineState.events)
      } else if (msg.type === "ERROR") {
        // Rollback optimistic state if we have a confirmed snapshot
        const confirmed = lastConfirmedStateRef.current
        if (confirmed) {
          qc.setQueryData(["game", gameId, myPlayerId], confirmed)
          lastConfirmedStateRef.current = null
        }
        setWsError(`${msg.code}: ${msg.message}`)
        if (msg.message) {
          showWarning(msg.message, classifyWarningCode({ code: msg.code, message: msg.message }))
        }
        setTimeout(() => setWsError(null), 5000)
      } else if (msg.type === "CHAT_MSG" || msg.type === "CHAT_EMOTE") {
        onChatWsMessage(msg)
      }
    },
    [gameId, myPlayerId, onChatWsMessage, processIncomingEvents, qc, showWarning],
  )

  useEffect(() => {
    const ctx = data?.resolutionContext
    if (ctx && ctx.resolvingPlayer !== myPlayerId) {
      resolutionWatchRef.current = {
        card: ctx.pendingCard,
        playerId: ctx.resolvingPlayer,
        effects: [],
      }
    }
  }, [data?.resolutionContext, myPlayerId])

  useEffect(() => {
    if (!gameId || !effectiveIdentity) return
    const client = createWsClient(gameId, effectiveIdentity, handleWsMessage)
    wsRef.current = client
    return () => {
      client.close()
      wsRef.current = null
    }
  }, [gameId, effectiveIdentity, handleWsMessage])

  const sendMove = useCallback(
    (m: Move | Move[]) => {
      if (!effectiveIdentity) return
      const moves = Array.isArray(m) ? m : [m]
      if (moves.length === 0) return
      setSelectedId(null)

      // Single move: apply optimistic state before sending
      if (moves.length === 1) {
        const currentState = currentDataRef.current
        if (currentState) {
          const optimistic = applyOptimisticMove(currentState, myPlayerId, moves[0]!)
          if (optimistic) {
            lastConfirmedStateRef.current = currentState
            qc.setQueryData(["game", gameId, myPlayerId], optimistic)
          }
        }
      }

      // Single move: prefer WS for low latency
      if (moves.length === 1) {
        if (wsRef.current?.sendMove(moves[0]!)) {
          return
        }
        submitMove(gameId!, effectiveIdentity, moves[0]!)
          .then(() => {
            lastConfirmedStateRef.current = null
            return refetch()
          })
          .catch((err: unknown) => {
            // Rollback optimistic state on HTTP error
            const confirmed = lastConfirmedStateRef.current
            if (confirmed) {
              qc.setQueryData(["game", gameId, myPlayerId], confirmed)
              lastConfirmedStateRef.current = null
            }
            const raw = err instanceof Error ? err.message : String(err)
            const detail = raw.replace(/^\d+:\s*/, "")
            try {
              const parsed = JSON.parse(detail) as { error?: string; code?: string }
              const message = parsed.error ?? raw
              showWarning(
                message,
                classifyWarningCode({
                  message,
                  ...(parsed.code !== undefined ? { code: parsed.code } : {}),
                }),
              )
            } catch {
              showWarning(raw, classifyWarningCode(raw))
            }
            console.error(err)
          })
        return
      }

      // Multiple moves: send via WS if open (ordered per connection),
      // otherwise chain HTTP calls sequentially
      if (wsRef.current) {
        for (const move of moves) {
          wsRef.current.sendMove(move)
        }
        return
      }
      let chain = Promise.resolve()
      for (const move of moves) {
        chain = chain.then(() => submitMove(gameId!, effectiveIdentity, move) as Promise<void>)
      }
      chain
        .then(() => refetch())
        .catch((err: unknown) => {
          const raw = err instanceof Error ? err.message : String(err)
          const detail = raw.replace(/^\d+:\s*/, "")
          try {
            const parsed = JSON.parse(detail) as { error?: string; code?: string }
            const message = parsed.error ?? raw
            showWarning(
              message,
              classifyWarningCode({
                message,
                ...(parsed.code !== undefined ? { code: parsed.code } : {}),
              }),
            )
          } catch {
            showWarning(raw, classifyWarningCode(raw))
          }
          console.error(err)
        })
    },
    [gameId, effectiveIdentity, myPlayerId, qc, refetch, showWarning],
  )

  const submitRebuild = useCallback(
    (cardInstanceIds: [string, string, string]) => {
      if (!rebuildTarget) return
      sendMove({ type: "REBUILD_REALM", slot: rebuildTarget, cardInstanceIds })
      setRebuildTarget(null)
    },
    [rebuildTarget, sendMove],
  )

  useEffect(() => {
    if (data?.events?.length) processIncomingEvents(data.events)
  }, [data?.events, processIncomingEvents])

  useEffect(() => {
    if (activeAnnouncement || announcementQueue.length === 0) return
    setActiveAnnouncement(announcementQueue[0]!)
    setAnnouncementQueue((prev) => prev.slice(1))
  }, [activeAnnouncement, announcementQueue])

  const dispatchSpellMove = useCallback(
    (args: {
      spell: CardInfo
      move: Move
      casterInstanceId?: string
      target?: { cardInstanceId: string; owner: "self" | "opponent" }
    }) => {
      const { spell, move, casterInstanceId, target } = args
      if (target) {
        spellTargetsRef.current[spell.instanceId] = {
          ...target,
          ...(casterInstanceId !== undefined ? { casterInstanceId } : {}),
        }
      }

      if (move.type === "PLAY_PHASE3_CARD") {
        sendMove({
          ...move,
          ...(casterInstanceId !== undefined ? { casterInstanceId } : {}),
          ...(target
            ? {
                targetCardInstanceId: target.cardInstanceId,
                targetOwner: target.owner,
              }
            : {}),
        })
        return
      }

      sendMove(move)
    },
    [sendMove],
  )

  const requestSpellCast = useCallback(
    (
      spellInstanceId: string,
      target?: {
        cardInstanceId: string
        owner: "self" | "opponent"
      },
    ) => {
      const game = data
      if (!game) return
      const spellOwnerEntry = Object.entries(game.board.players).find(([, board]) =>
        board.hand.some((c) => c.instanceId === spellInstanceId),
      )
      if (!spellOwnerEntry) {
        showWarning("Card not found in hand.")
        return
      }
      const [spellOwnerId, spellOwnerBoard] = spellOwnerEntry
      const spell = spellOwnerBoard.hand.find((c) => c.instanceId === spellInstanceId)
      if (!spell || !isSpellCard(spell)) {
        showWarning("That card is not a spell.")
        return
      }
      if (game.activePlayer !== spellOwnerId) {
        showWarning("Not your turn.")
        return
      }

      const move = resolveSpellMove(game.legalMoves, spell.instanceId)
      const poolCasters = spellCastersInPool(spell, spellOwnerBoard)
      const combatCaster = spellCasterInCombat(
        spell,
        game.board.combat,
        spellOwnerId,
        spellOwnerBoard,
        game.board.players,
      )
      const fallbackCasters = [
        ...new Map([...poolCasters, ...combatCaster].map((c) => [c.instanceId, c])).values(),
      ]
      const allCasters = move?.type === "PLAY_COMBAT_CARD" ? combatCaster : poolCasters

      if ((allCasters.length === 0 ? fallbackCasters.length : allCasters.length) === 0) {
        showWarning("You have no casters for this spell.")
        return
      }

      if (!move) {
        const castPhase = phaseToCastPhase(game.phase)
        if (castPhase == null || !getCastPhases(spell).includes(castPhase)) {
          showWarning(`Cannot cast ${spell.name} in ${game.phase.replaceAll("_", " ")}.`)
        } else {
          showWarning(`Cannot cast ${spell.name} right now.`)
        }
        return
      }

      const availableCasters = allCasters.length > 0 ? allCasters : fallbackCasters

      if (availableCasters.length > 1) {
        setCasterPrompt({
          spell,
          move,
          casters: availableCasters,
          ...(target ? { target } : {}),
        })
        return
      }

      dispatchSpellMove({
        spell,
        move,
        ...(availableCasters[0] ? { casterInstanceId: availableCasters[0].instanceId } : {}),
        ...(target ? { target } : {}),
      })
    },
    [data, dispatchSpellMove, showWarning],
  )

  // Auto-show spoil modal when CLAIM_SPOIL enters legal moves
  const spoilModalShownRef = useRef(false)
  useEffect(() => {
    const hasSpoil = (data?.legalMoves ?? []).some((m) => m.type === "CLAIM_SPOIL")
    if (hasSpoil && !spoilModalShownRef.current) {
      spoilModalShownRef.current = true
      showWarning(
        "You earned a spoil of combat. Draw 1 card?",
        "generic_warning",
        false,
        () => sendMove({ type: "CLAIM_SPOIL" }),
        "Draw a well earned spoil",
      )
    }
    if (!hasSpoil) {
      spoilModalShownRef.current = false
    }
  }, [data?.legalMoves, showWarning, sendMove])

  const playerIds = useMemo(() => Object.keys(data?.board.players ?? {}), [data?.board.players])
  const opponentPlayerId = playerIds.find((id) => id !== myPlayerId) ?? stableOpponentIdRef.current
  if (opponentPlayerId) stableOpponentIdRef.current = opponentPlayerId
  const playerAName = stablePlayersRef.current?.find((p) => p.userId === myPlayerId)?.nickname ?? ""
  const playerBName =
    stablePlayersRef.current?.find((p) => p.userId === opponentPlayerId)?.nickname ?? ""

  const lingeringSpellsByPlayer = useMemo(
    () => buildLingeringSpellsByPlayer(playerIds, data?.board.players),
    [data?.board.players, playerIds],
  )

  const boardCtxValue = useMemo(
    () => ({
      playerA: myPlayerId,
      playerB: opponentPlayerId,
      playerAName,
      playerBName,
      myPlayerId,
      winner: data?.winner ?? null,
      handMaxSize: data?.handMaxSize ?? 8,
      allBoards: data?.board.players ?? {},
      lingeringSpellsByPlayer,
    }),
    [
      myPlayerId,
      opponentPlayerId,
      playerAName,
      playerBName,
      data?.winner,
      data?.handMaxSize,
      data?.board.players,
      lingeringSpellsByPlayer,
    ],
  )

  const combatCtxValue = useMemo(
    () => ({
      combat: data?.board.combat ?? null,
      resolutionContext: data?.resolutionContext ?? null,
    }),
    [data?.board.combat, data?.resolutionContext],
  )

  const movesCtxValue = useMemo(
    () => ({
      legalMoves: data?.legalMoves ?? [],
      ...(data?.legalMovesPerPlayer ? { legalMovesPerPlayer: data.legalMovesPerPlayer } : {}),
      activePlayer: data?.activePlayer ?? "",
      phase: data?.phase ?? "",
      turnNumber: data?.turnNumber ?? 0,
      onMove: sendMove,
    }),
    [
      data?.legalMoves,
      data?.legalMovesPerPlayer,
      data?.activePlayer,
      data?.phase,
      data?.turnNumber,
      sendMove,
    ],
  )

  const uiCtxValue = useMemo(
    () => ({
      selectedId,
      onSelect: setSelectedId,
      contextMenu,
      openContextMenu,
      closeContextMenu,
      warningMessage: warningState?.message ?? null,
      warningCode: warningState?.code ?? null,
      warningSuppressible: warningState?.suppressible ?? true,
      warningProceedLabel: warningState?.proceedLabel,
      warningConfirmAction: warningState?.confirmAction ?? null,
      showWarning,
      suppressWarningCode,
      clearWarning,
      rebuildTarget,
      setRebuildTarget,
      submitRebuild,
      requestSpellCast,
      targetPicker,
      openTargetPicker,
      closeTargetPicker,
    }),
    [
      selectedId,
      contextMenu,
      openContextMenu,
      closeContextMenu,
      warningState,
      showWarning,
      suppressWarningCode,
      clearWarning,
      rebuildTarget,
      setRebuildTarget,
      submitRebuild,
      requestSpellCast,
      targetPicker,
      openTargetPicker,
      closeTargetPicker,
    ],
  )

  if (isLoading || (data && !imagesReady)) {
    const progress = isLoading
      ? undefined
      : imageProgress.total > 0
        ? Math.round((imageProgress.loaded / imageProgress.total) * 100)
        : 0
    return <GameLoadingScreen progress={progress} />
  }
  if (error)
    return (
      <div className="page">
        <p className="error">{String(error)}</p>
      </div>
    )
  if (!data) return null
  if (!myPlayerId || !opponentPlayerId) {
    return (
      <div className="page">
        <p className="error">Could not resolve players for this game.</p>
      </div>
    )
  }

  function handleToggleChat() {
    setChatOpen((prev) => {
      if (!prev) resetUnread()
      return !prev
    })
  }

  return (
    <BoardContext.Provider value={boardCtxValue}>
      <CombatContext.Provider value={combatCtxValue}>
        <MovesContext.Provider value={movesCtxValue}>
          <UIContext.Provider value={uiCtxValue}>
            <GameBoard events={eventLog} wsError={wsError} />
            <div style={{ position: "fixed", top: 12, right: 14, zIndex: 500 }}>
              <MusicPlayer />
            </div>
            {devScenarioId && (
              <button
                onClick={() => void handleRestartScenario()}
                title="Restart scenario (syncs both tabs)"
                style={{
                  position: "fixed",
                  top: 12,
                  left: 64,
                  zIndex: 500,
                  background: "#1a1a1a",
                  border: "1px solid #444",
                  color: "#888",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  letterSpacing: "0.04em",
                }}
              >
                ↺ Restart
              </button>
            )}
            <EmoteOverlay emotes={floatingEmotes} />
            <ChatBar
              chatOpen={chatOpen}
              unreadCount={unreadCount}
              onToggleChat={handleToggleChat}
              onEmote={sendEmote}
            />
            {chatOpen && (
              <ChatPanel
                messages={chatMessages}
                myPlayerId={myPlayerId}
                playerIds={playerIds}
                onSend={sendMessage}
                onClose={handleToggleChat}
              />
            )}
            {data.resolutionContext &&
              (() => {
                // Build counter options from legalMoves for the waiting view
                const myBoard = data.board.players[myPlayerId]
                const counterOptions = data.legalMoves
                  .filter((m) => m.type === "PLAY_EVENT" || m.type === "USE_POOL_COUNTER")
                  .map((m) => {
                    let card: CardInfo | null = null
                    if (m.type === "PLAY_EVENT" && "cardInstanceId" in m) {
                      card = myBoard?.hand.find((c) => c.instanceId === m.cardInstanceId) ?? null
                    } else if (m.type === "USE_POOL_COUNTER" && "cardInstanceId" in m) {
                      for (const entry of myBoard?.pool ?? []) {
                        if (entry.champion.instanceId === m.cardInstanceId) {
                          card = entry.champion
                          break
                        }
                        const att = entry.attachments.find(
                          (a: CardInfo) => a.instanceId === m.cardInstanceId,
                        )
                        if (att) {
                          card = att
                          break
                        }
                      }
                    }
                    return card ? { card, move: m } : null
                  })
                  .filter((x): x is { card: CardInfo; move: Move } => x !== null)
                return (
                  <ResolutionPanel
                    ctx={data.resolutionContext}
                    allBoards={data.board.players}
                    myPlayerId={myPlayerId}
                    counterOptions={counterOptions}
                    onMove={sendMove}
                  />
                )
              })()}
            {!data.resolutionContext && data.pendingTriggers && data.pendingTriggers.length > 0 && (
              <TriggerPanel
                trigger={data.pendingTriggers[0]}
                allBoards={data.board.players}
                myPlayerId={myPlayerId}
                onMove={sendMove}
              />
            )}
            {casterPrompt && (
              <CasterSelectModal
                spell={casterPrompt.spell}
                casters={casterPrompt.casters}
                onPick={(casterInstanceId) => {
                  dispatchSpellMove({
                    spell: casterPrompt.spell,
                    move: casterPrompt.move,
                    casterInstanceId,
                    ...(casterPrompt.target ? { target: casterPrompt.target } : {}),
                  })
                  setCasterPrompt(null)
                }}
                onClose={() => setCasterPrompt(null)}
              />
            )}
            {activeAnnouncement && (
              <SpellCastAnnouncementModal
                announcement={activeAnnouncement}
                canCounter={false}
                onCounter={() => {}}
                onClose={() => setActiveAnnouncement(null)}
              />
            )}
            {resolutionOutcome && (
              <ResolutionOutcomeModal
                outcome={resolutionOutcome}
                onClose={() => setResolutionOutcome(null)}
              />
            )}
            {counterReveal && (
              <div
                className="overlay-modal"
                style={{
                  position: "fixed",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: "var(--z-modal)",
                  background: "rgba(0,0,0,0.6)",
                }}
              >
                <div
                  style={{
                    background: "#151818",
                    border: "2px solid #8a7a30",
                    borderRadius: "8px",
                    padding: "20px",
                    maxWidth: "320px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "#c8b060",
                      fontWeight: 700,
                    }}
                  >
                    Countered!
                  </div>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: "#e8d8a0" }}>
                    {counterReveal.cardName}
                  </div>
                  <div style={{ fontSize: "12px", color: "#b0a080" }}>
                    cancelled {counterReveal.cancelledCardName}
                  </div>
                  <img
                    src={cardImageUrl(counterReveal.setId, counterReveal.cardNumber)}
                    alt={counterReveal.cardName}
                    style={{ width: "160px", borderRadius: "4px" }}
                  />
                  <button
                    style={{
                      background: "#2a2a2a",
                      border: "1px solid #555",
                      color: "#ccc",
                      borderRadius: "5px",
                      padding: "7px 20px",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                    onClick={() => setCounterReveal(null)}
                  >
                    Ok
                  </button>
                </div>
              </div>
            )}
            {bypass && gameId && opponentPlayerId && (
              <DevGiveCardPanel
                gameId={gameId}
                myPlayerId={myPlayerId}
                opponentId={opponentPlayerId}
                onGiven={() => void refetch()}
              />
            )}
          </UIContext.Provider>
        </MovesContext.Provider>
      </CombatContext.Provider>
    </BoardContext.Provider>
  )
}
