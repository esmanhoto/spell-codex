import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getGameState, submitMove, createWsClient } from "../api.ts"
import type { GameState, Move, GameEvent, WsClientMessage, CardInfo } from "../api.ts"
import { GameContext } from "../context/GameContext.tsx"
import type { ContextMenuState } from "../context/GameContext.tsx"
import { useAuth } from "../auth.tsx"
import { GameBoard } from "../components/game/GameBoard.tsx"
import { CasterSelectModal } from "../components/game/CasterSelectModal.tsx"
import { ResolutionPanel } from "../components/game/ResolutionPanel.tsx"
import {
  SpellCastAnnouncementModal,
  type SpellCastAnnouncement,
} from "../components/game/SpellCastAnnouncementModal.tsx"
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
        const state = msg.state as GameState
        qc.setQueryData(["game", gameId, myPlayerId], state)
        if (state.events?.length) processIncomingEvents(state.events)
      } else if (msg.type === "ERROR") {
        setWsError(`${msg.code}: ${msg.message}`)
        if (msg.message) {
          showWarning(msg.message, classifyWarningCode({ code: msg.code, message: msg.message }))
        }
        setTimeout(() => setWsError(null), 5000)
      }
    },
    [gameId, myPlayerId, processIncomingEvents, qc, showWarning],
  )

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
    (m: Move) => {
      if (!identity) return
      setSelectedId(null)
      setLastMoveType(m.type)
      if (wsRef.current?.sendMove(m)) return
      submitMove(gameId!, identity, m)
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

  const lingeringSpellsByPlayer = useMemo(
    () => buildLingeringSpellsByPlayer(playerIds, data?.board.players),
    [data?.board.players, playerIds],
  )

  if (isLoading)
    return (
      <div className="page">
        <p>Loading...</p>
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

  return (
    <GameContext.Provider
      value={{
        playerA: myPlayerId,
        playerB: opponentPlayerId,
        myPlayerId,
        activePlayer: data.activePlayer,
        phase: data.phase,
        turnNumber: data.turnNumber,
        winner: data.winner,
        handMaxSize: data.handMaxSize,
        allBoards: data.board.players,
        lingeringSpellsByPlayer,
        combat: data.board.combat,
        resolutionContext: data.resolutionContext,
        legalMoves: data.legalMoves,
        ...(data.legalMovesPerPlayer ? { legalMovesPerPlayer: data.legalMovesPerPlayer } : {}),
        onMove: sendMove,
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
        requestSpellCast,
      }}
    >
      <GameBoard events={eventLog} wsError={wsError} />
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
    </GameContext.Provider>
  )
}
