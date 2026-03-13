import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getGameState, submitMove, createWsClient } from "../api.ts"
import type { GameState, Move, GameEvent, WsClientMessage, CardInfo, PlayerBoard } from "../api.ts"
import { cardImageUrl, CARD_BACK_URL } from "../utils/card-helpers.ts"
import { BoardContext } from "../context/BoardContext.tsx"
import { CombatContext } from "../context/CombatContext.tsx"
import { MovesContext } from "../context/MovesContext.tsx"
import { UIContext } from "../context/UIContext.tsx"
import type { ContextMenuState } from "../context/types.ts"
import { useAuth } from "../auth.tsx"
import { GameBoard } from "../components/game/GameBoard.tsx"
import { CasterSelectModal } from "../components/game/CasterSelectModal.tsx"
import { ResolutionPanel } from "../components/game/ResolutionPanel.tsx"
import {
  SpellCastAnnouncementModal,
  type SpellCastAnnouncement,
} from "../components/game/SpellCastAnnouncementModal.tsx"
import {
  ResolutionOutcomeModal,
  type ResolutionOutcome,
} from "../components/game/ResolutionOutcomeModal.tsx"
import { usePhaseTracker } from "../hooks/usePhaseTracker.ts"
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
import { MusicPlayer } from "../components/MusicPlayer.tsx"
import { ChatBar } from "../components/game/ChatBar.tsx"
import { ChatPanel } from "../components/game/ChatPanel.tsx"
import { EmoteOverlay } from "../components/game/EmoteOverlay.tsx"
import { useChat } from "../hooks/useChat.ts"
import "../styles/game-vars.css"

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

function collectCardImageUrls(boards: Record<string, PlayerBoard>): string[] {
  const urls = new Set<string>()
  urls.add(CARD_BACK_URL)
  for (const board of Object.values(boards)) {
    for (const c of board.hand) urls.add(cardImageUrl(c.setId, c.cardNumber))
    for (const slot of Object.values(board.formation)) {
      if (slot) {
        urls.add(cardImageUrl(slot.realm.setId, slot.realm.cardNumber))
        for (const h of slot.holdings) urls.add(cardImageUrl(h.setId, h.cardNumber))
      }
    }
    for (const entry of board.pool) {
      urls.add(cardImageUrl(entry.champion.setId, entry.champion.cardNumber))
      for (const a of entry.attachments) urls.add(cardImageUrl(a.setId, a.cardNumber))
    }
    for (const c of board.lastingEffects) urls.add(cardImageUrl(c.setId, c.cardNumber))
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
  const { identity } = useAuth()
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [eventLog, setEventLog] = useState<GameEvent[]>([])
  const [wsError, setWsError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [rebuildTarget, setRebuildTarget] = useState<string | null>(null)
  const [lastMoveType, setLastMoveType] = useState<string | null>(null)
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
  const [chatOpen, setChatOpen] = useState(false)
  const [imagesReady, setImagesReady] = useState(false)
  const [imageProgress, setImageProgress] = useState({ loaded: 0, total: 0 })
  const preCacheStartedRef = useRef(false)
  const moveCountRef = useRef(0)
  const lastMoveSentAtRef = useRef<number | null>(null)
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

  const myPlayerId = identity?.userId ?? ""

  useEffect(() => {
    suppressedWarningsRef.current = readSuppressedWarnings()
  }, [])

  useEffect(() => {
    processedEventsRef.current = 0
    setEventLog([])
    setAnnouncementQueue([])
    setActiveAnnouncement(null)
  }, [gameId])

  const { data, error, isLoading, refetch } = useQuery<GameState>({
    queryKey: ["game", gameId, myPlayerId],
    queryFn: () => getGameState(gameId!, identity!),
    enabled: !!gameId && !!identity,
    staleTime: Infinity,
    // Keep eventual consistency even if WS reconnect/proxy has issues.
    refetchInterval: (query) => (query.state.data?.winner ? false : 2000),
  })

  // Pre-cache all card images on first load before showing the game board
  useEffect(() => {
    if (!data || preCacheStartedRef.current) return
    preCacheStartedRef.current = true
    const urls = collectCardImageUrls(data.board.players)
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
        const wsReceiveAt = performance.now()
        const sentAt = lastMoveSentAtRef.current
        if (sentAt !== null) {
          const moveNum = moveCountRef.current
          console.log(
            `[perf] move_submit_to_ws_ack_ms: ${(wsReceiveAt - sentAt).toFixed(2)} (move ${moveNum})`,
          )
          lastMoveSentAtRef.current = null
        }
        const state = msg.state as GameState
        qc.setQueryData(["game", gameId, myPlayerId], state)
        if (state.events?.length) processIncomingEvents(state.events)
        if (!document.hidden) {
          requestAnimationFrame(() => {
            console.log(
              `[perf] ws_message_to_render_ms: ${(performance.now() - wsReceiveAt).toFixed(2)}`,
            )
          })
        }
      } else if (msg.type === "ERROR") {
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
    if (!gameId || !identity) return
    const client = createWsClient(gameId, identity, handleWsMessage)
    wsRef.current = client
    return () => {
      client.close()
      wsRef.current = null
    }
  }, [gameId, identity, handleWsMessage])

  const sendMove = useCallback(
    (m: Move | Move[]) => {
      if (!identity) return
      const moves = Array.isArray(m) ? m : [m]
      if (moves.length === 0) return
      setSelectedId(null)
      setLastMoveType(moves[moves.length - 1]!.type)

      // Single move: prefer WS for low latency
      if (moves.length === 1) {
        if (wsRef.current?.sendMove(moves[0]!)) {
          moveCountRef.current++
          lastMoveSentAtRef.current = performance.now()
          return
        }
        submitMove(gameId!, identity, moves[0]!)
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
        chain = chain.then(() => submitMove(gameId!, identity, move) as Promise<void>)
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
    [gameId, identity, refetch, showWarning],
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

  usePhaseTracker(
    data?.phase ?? "",
    data?.legalMoves ?? [],
    sendMove,
    data?.activePlayer ?? "",
    myPlayerId,
    lastMoveType,
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
        "Draw a spoil",
      )
    }
    if (!hasSpoil) {
      spoilModalShownRef.current = false
    }
  }, [data?.legalMoves, showWarning, sendMove])

  const playerIds = useMemo(() => Object.keys(data?.board.players ?? {}), [data?.board.players])
  const opponentPlayerId = playerIds.find((id) => id !== myPlayerId) ?? ""
  const playerAName = data?.players?.find((p) => p.userId === myPlayerId)?.nickname || "You"
  const playerBName =
    data?.players?.find((p) => p.userId === opponentPlayerId)?.nickname || "Opponent"

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
    ],
  )

  if (isLoading || (data && !imagesReady))
    return (
      <div
        className="page"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        {isLoading ? (
          <p>Loading game state…</p>
        ) : (
          <>
            <p>
              Loading images… {imageProgress.loaded} / {imageProgress.total}
            </p>
            <progress
              value={imageProgress.loaded}
              max={imageProgress.total}
              style={{ width: 240 }}
            />
          </>
        )}
      </div>
    )
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
            {data.resolutionContext && (
              <ResolutionPanel
                ctx={data.resolutionContext}
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
          </UIContext.Provider>
        </MovesContext.Provider>
      </CombatContext.Provider>
    </BoardContext.Provider>
  )
}
