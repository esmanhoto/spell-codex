import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { useParams, useLocation, useNavigate } from "react-router-dom"
import { useFetch } from "../hooks/useFetch.ts"
import type { GameState as EngineGameState } from "@spell/engine"
import { getGameState, submitMove, createWsClient, loadDevScenario } from "../api.ts"
import type { GameState, Move, GameEvent, WsClientMessage, CardInfo } from "../api.ts"
import { hashEngineState } from "../utils/state-hash.ts"
import { cardImageUrl } from "../utils/card-helpers.ts"
import { filterLocalState, collectCardImageUrls, buildLingeringSpellsByPlayer, applyMoveLocally } from "../utils/game-logic.ts"
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
import { SpoilModal } from "../components/game/SpoilModal.tsx"
import { TriggerPanel } from "../components/game/TriggerPanel.tsx"
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


export function Game() {
  const { id: gameId } = useParams<{ id: string }>()
  const location = useLocation()
  const { identity, bypass } = useAuth()
  const navigate = useNavigate()
  const searchParams = new URLSearchParams(location.search)
  const devAs = bypass ? searchParams.get("devAs") : null
  const devScenarioId = bypass ? searchParams.get("scenario") : null
  const effectiveIdentity: typeof identity = useMemo(
    () => (devAs ? { userId: devAs, accessToken: null } : identity),
    [devAs, identity],
  )
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

  const { data, error, isLoading, refetch, setData: setGameData } = useFetch<GameState>({
    fn: () => getGameState(gameId!, effectiveIdentity!),
    enabled: !!gameId && !!effectiveIdentity,
    // Safety-net poll — MOVE_APPLIED delta handles real-time updates (Phase 6).
    // This only matters if WS drops silently without triggering a reconnect.
    refetchInterval: (d) => (d?.winner ? false : 60_000),
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

      for (const event of newEvents) {
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
        // Set resolution watch synchronously when opponent casts a spell (avoids race with useEffect)
        if (event.type === "PHASE3_SPELL_CAST" && event.playerId !== myPlayerId) {
          resolutionWatchRef.current = {
            card: {
              instanceId: event.instanceId as string,
              name: event.cardName as string,
              typeId: event.cardTypeId as number,
              worldId: 0,
              level: null,
              setId: event.setId as string,
              cardNumber: event.cardNumber as number,
              description: "",
              supportIds: [],
              spellNature: null,
              castPhases: [],
              effects: [],
            },
            playerId: event.playerId as string,
            effects: [],
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
            const declEffects = ((event.declarations ?? []) as Array<Record<string, unknown>>).map(
              (d) => {
                switch (d.action) {
                  case "raze_realm": return `Raze ${d.realmName ?? "realm"} (slot ${d.slot})`
                  case "rebuild_realm": return `Rebuild ${d.realmName ?? "realm"} (slot ${d.slot})`
                  case "discard_card": return `Discard ${d.cardName ?? "card"}`
                  case "draw_cards": return `Draw ${d.count ?? 1} card(s)`
                  case "return_to_pool": return `Return ${d.cardName ?? "champion"} to pool`
                  case "move_card": return `Move ${d.cardName ?? "card"} to ${d.destination ?? "zone"}`
                  case "other": return `${d.text ?? "Custom effect"}`
                  default: return `${d.action}`
                }
              },
            )
            setResolutionOutcome({
              card: watched.card,
              destination: event.destination as string,
              effects: watched.effects,
              declarations: declEffects,
              casterName: "your opponent",
            })
            resolutionWatchRef.current = null
          }
        }
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
        setGameData(merged)
        if (state.events?.length) processIncomingEvents(state.events)
      } else if (msg.type === "MOVE_APPLIED") {
        const engineState = localEngineStateRef.current
        // Opponent moves: can't replay locally (we don't have their hand/drawPile),
        // so request an authoritative sync from the server instead.
        if (!engineState || msg.playerId !== myPlayerId) {
          wsRef.current?.sendSyncRequest(msg.gameId)
          return
        }
        const result = applyMoveLocally({
          engineState,
          playerId: msg.playerId,
          move: msg.move,
          viewerId: myPlayerId,
          status: msg.status,
          turnDeadline: msg.turnDeadline,
          winner: msg.winner,
          currentApiState: currentDataRef.current,
        })
        if (!result) {
          console.warn("[phase6] engine error on MOVE_APPLIED — requesting sync")
          wsRef.current?.sendSyncRequest(msg.gameId)
          return
        }
        // Hash reconciliation — hash the filtered view (opponent hand/drawPile hidden)
        const filteredForHash = filterLocalState(result.newEngineState, myPlayerId)
        void hashEngineState(filteredForHash).then((clientHash) => {
          if (clientHash !== msg.stateHash) {
            console.warn(
              `[phase6] hash mismatch (client=${clientHash.slice(0, 8)} server=${msg.stateHash.slice(0, 8)}) — requesting sync`,
            )
            wsRef.current?.sendSyncRequest(msg.gameId)
          }
        })
        localEngineStateRef.current = result.newEngineState
        // Server confirmed — clear rollback snapshot
        lastConfirmedStateRef.current = null
        setGameData(result.apiState)
        if (result.newEngineState.events.length) processIncomingEvents(result.newEngineState.events)
      } else if (msg.type === "ERROR") {
        // Rollback optimistic state if we have a confirmed snapshot
        const confirmed = lastConfirmedStateRef.current
        if (confirmed) {
          setGameData(confirmed)
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
    [gameId, myPlayerId, onChatWsMessage, processIncomingEvents, setGameData, showWarning],
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

  // Stable ref so WS connection is not torn down when handleWsMessage identity changes
  const handleWsMessageRef = useRef(handleWsMessage)
  handleWsMessageRef.current = handleWsMessage

  useEffect(() => {
    if (!gameId || !effectiveIdentity) return
    const client = createWsClient(gameId, effectiveIdentity, (msg) => handleWsMessageRef.current(msg))
    wsRef.current = client
    return () => {
      client.close()
      wsRef.current = null
    }
  }, [gameId, effectiveIdentity])

  const DRAW_PHASE_ALLOWED = new Set(["PASS", "REBUILD_REALM", "DISCARD_CARD"])

  const sendMove = useCallback(
    (m: Move | Move[]) => {
      if (!effectiveIdentity) return
      const moves = Array.isArray(m) ? m : [m]
      if (moves.length === 0) return

      // Warn when doing anything other than draw/rebuild during START_OF_TURN
      const cur = currentDataRef.current
      if (
        moves.length === 1 &&
        cur?.phase === "START_OF_TURN" &&
        cur.activePlayer === myPlayerId &&
        !DRAW_PHASE_ALLOWED.has(moves[0]!.type) &&
        !cur.resolutionContext &&
        !(cur.pendingTriggers && cur.pendingTriggers.length > 0)
      ) {
        showWarning(
          "You are in Phase 1 (drawing). Proceed without drawing first?",
          undefined,
          false,
          () => {
            // re-enter sendMove bypassing this check by advancing phase optimistically
            setSelectedId(null)
            const currentState = currentDataRef.current
            if (currentState) {
              const optimistic = applyOptimisticMove(currentState, myPlayerId, moves[0]!)
              if (optimistic) {
                lastConfirmedStateRef.current = currentState
                setGameData(optimistic)
              }
            }
            if (wsRef.current?.sendMove(moves[0]!)) return
            submitMove(gameId!, effectiveIdentity!, moves[0]!)
              .then(() => {
                lastConfirmedStateRef.current = null
                return refetch()
              })
              .catch((err: unknown) => {
                const confirmed = lastConfirmedStateRef.current
                if (confirmed) {
                  setGameData(confirmed)
                  lastConfirmedStateRef.current = null
                }
                const raw = err instanceof Error ? err.message : String(err)
                showWarning(raw, classifyWarningCode(raw))
                console.error(err)
              })
          },
        )
        return
      }

      setSelectedId(null)

      // Single move: apply optimistic state before sending
      if (moves.length === 1) {
        const currentState = currentDataRef.current
        if (currentState) {
          const optimistic = applyOptimisticMove(currentState, myPlayerId, moves[0]!)
          if (optimistic) {
            lastConfirmedStateRef.current = currentState
            setGameData(optimistic)
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
              setGameData(confirmed)
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
    [gameId, effectiveIdentity, myPlayerId, setGameData, refetch, showWarning],
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
        // Allow out-of-turn casting for wizard spells, cleric spells, and counter_spell cards
        const isOutOfTurnSpell =
          spell.typeId === 4 ||
          spell.typeId === 19 ||
          spell.effects.some((e) => e.type === "counter_spell")
        if (!isOutOfTurnSpell) {
          showWarning("Not your turn.")
          return
        }
      }

      let move = resolveSpellMove(game.legalMoves, spell.instanceId)
      const isOutOfTurn = game.activePlayer !== spellOwnerId
      // Out-of-turn spells won't appear in legalMoves (active-player only) — construct move directly
      if (!move && isOutOfTurn) {
        move = { type: "PLAY_PHASE3_CARD", cardInstanceId: spell.instanceId }
      }
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

  // Spoils are drawn automatically by the engine — SpoilModal shows when pendingSpoilCard is set

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
            {data.pendingSpoilCard && (
              <SpoilModal
                card={data.pendingSpoilCard}
                legalMoves={data.legalMoves}
                onMove={sendMove}
              />
            )}
            {data.resolutionContext && (
              <ResolutionPanel
                ctx={data.resolutionContext}
                allBoards={data.board.players}
                myPlayerId={myPlayerId}
                onMove={sendMove}
              />
            )}
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
