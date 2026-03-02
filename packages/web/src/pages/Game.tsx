import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getGameState, submitMove, createWsClient } from "../api.ts"
import type { GameState, Move, GameEvent, WsClientMessage, CardInfo } from "../api.ts"
import { GameContext } from "../context/GameContext.tsx"
import type { ContextMenuState } from "../context/GameContext.tsx"
import { GameBoard } from "../components/game/GameBoard.tsx"
import { CasterSelectModal } from "../components/game/CasterSelectModal.tsx"
import { Phase3SpellOutcomeModal } from "../components/game/Phase3SpellOutcomeModal.tsx"
import {
  SpellCastAnnouncementModal,
  type SpellCastAnnouncement,
} from "../components/game/SpellCastAnnouncementModal.tsx"
import { usePhaseTracker } from "../hooks/usePhaseTracker.ts"
import {
  isSpellCard, resolveSpellMove, spellCastersInPool, phaseToCastPhase,
  getCastPhases, spellCasterInCombat,
} from "../utils/spell-casting.ts"
import "../styles/game-vars.css"

type Phase3SpellCastEvent = {
  type: "PHASE3_SPELL_CAST"
  playerId: string
  instanceId: string
  setId: string
  cardNumber: number
  cardName: string
  cardTypeId: number
  keepInPlay: boolean
}

function isPhase3SpellCastEvent(event: GameEvent): event is GameEvent & Phase3SpellCastEvent {
  return event.type === "PHASE3_SPELL_CAST"
}

function buildLingeringSpellsByPlayer(
  playerIds: string[],
  events: GameEvent[] | undefined,
): Record<string, CardInfo[]> {
  const result = Object.fromEntries(playerIds.map(id => [id, [] as CardInfo[]]))
  if (!events) return result

  const byPlayerSeen = new Map<string, Set<string>>()
  for (const id of playerIds) byPlayerSeen.set(id, new Set())

  for (const event of events) {
    if (!isPhase3SpellCastEvent(event) || !event.keepInPlay) continue
    if (!playerIds.includes(event.playerId)) continue
    const seen = byPlayerSeen.get(event.playerId)!
    if (seen.has(event.instanceId)) continue
    seen.add(event.instanceId)
    result[event.playerId]!.push({
      instanceId: event.instanceId,
      name: event.cardName,
      typeId: event.cardTypeId,
      worldId: 0,
      level: null,
      setId: event.setId,
      cardNumber: event.cardNumber,
      description: "",
      supportIds: [],
      spellNature: null,
      castPhases: [],
    })
  }
  return result
}

export function Game() {
  const { id: gameId } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [eventLog, setEventLog] = useState<GameEvent[]>([])
  const [wsError, setWsError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [lastMoveType, setLastMoveType] = useState<string | null>(null)
  const [warningMessage, setWarningMessage] = useState<string | null>(null)
  const [phase3OutcomePrompt, setPhase3OutcomePrompt] = useState<{
    spell: CardInfo
    move: Extract<Move, { type: "PLAY_PHASE3_CARD" }>
    casters: CardInfo[]
    target?: { cardInstanceId: string; owner: "self" | "opponent" }
  } | null>(null)
  const [casterPrompt, setCasterPrompt] = useState<{
    spell: CardInfo
    move: Move
    casters: CardInfo[]
    keepInPlay: boolean
    target?: { cardInstanceId: string; owner: "self" | "opponent" }
  } | null>(null)
  const [announcementQueue, setAnnouncementQueue] = useState<SpellCastAnnouncement[]>([])
  const [activeAnnouncement, setActiveAnnouncement] = useState<SpellCastAnnouncement | null>(null)
  const spellTargetsRef = useRef<Record<string, {
    cardInstanceId: string
    owner: "self" | "opponent"
    casterInstanceId?: string
  }>>({})
  const processedEventsRef = useRef(0)
  const wsRef = useRef<ReturnType<typeof createWsClient> | null>(null)

  const openContextMenu = useCallback((x: number, y: number, actions: ContextMenuState["actions"]) => {
    setContextMenu({ x, y, actions })
  }, [])
  const closeContextMenu = useCallback(() => setContextMenu(null), [])
  const showWarning = useCallback((message: string) => setWarningMessage(message), [])
  const clearWarning = useCallback(() => setWarningMessage(null), [])

  const playerA = sessionStorage.getItem(`game:${gameId}:playerA`) ?? ""
  const playerB = sessionStorage.getItem(`game:${gameId}:playerB`) ?? ""

  useEffect(() => {
    processedEventsRef.current = 0
    setEventLog([])
    setAnnouncementQueue([])
    setActiveAnnouncement(null)
  }, [gameId])

  const { data, error, isLoading, refetch } = useQuery<GameState>({
    queryKey: ["game", gameId],
    queryFn:  () => getGameState(gameId!, playerA),
    enabled:  !!gameId,
    staleTime: Infinity,
  })

  const processIncomingEvents = useCallback((events: GameEvent[]) => {
    if (events.length <= processedEventsRef.current) return
    const newEvents = events.slice(processedEventsRef.current)
    processedEventsRef.current = events.length
    setEventLog(prev => [...prev, ...newEvents])

    const announcements: SpellCastAnnouncement[] = []
    for (const event of newEvents) {
      if (!isPhase3SpellCastEvent(event)) continue
      announcements.push({
        playerLabel: event.playerId === playerA ? "Player A" : "Player B",
        cardName: event.cardName,
        setId: event.setId,
        cardNumber: event.cardNumber,
        keepInPlay: event.keepInPlay,
      })
    }
    if (announcements.length > 0) {
      setAnnouncementQueue(prev => [...prev, ...announcements])
    }
  }, [playerA])

  const handleWsMessage = useCallback((msg: WsClientMessage) => {
    if (msg.type === "STATE_UPDATE") {
      const state = msg.state as GameState
      qc.setQueryData(["game", gameId], state)
      if (state.events?.length) processIncomingEvents(state.events)
    } else if (msg.type === "ERROR") {
      setWsError(`${msg.code}: ${msg.message}`)
      if (msg.message) setWarningMessage(msg.message)
      setTimeout(() => setWsError(null), 5000)
    }
  }, [gameId, processIncomingEvents, qc])

  useEffect(() => {
    if (!gameId || !playerA) return
    const client = createWsClient(gameId, playerA, handleWsMessage)
    wsRef.current = client
    return () => {
      client.close()
      wsRef.current = null
    }
  }, [gameId, playerA, handleWsMessage])

  const sendMove = useCallback((m: Move) => {
    setSelectedId(null)
    setLastMoveType(m.type)
    if (wsRef.current?.sendMove(m)) return
    const asUser = data?.activePlayer === playerA ? playerA : playerB
    submitMove(gameId!, asUser, m)
      .then(() => refetch())
      .catch((err: unknown) => {
        const raw = err instanceof Error ? err.message : String(err)
        const detail = raw.replace(/^\d+:\s*/, "")
        try {
          const parsed = JSON.parse(detail) as { error?: string }
          setWarningMessage(parsed.error ?? raw)
        } catch {
          setWarningMessage(raw)
        }
        console.error(err)
      })
  }, [data, gameId, playerA, playerB, refetch])

  useEffect(() => {
    if (data?.events?.length) processIncomingEvents(data.events)
  }, [data?.events, processIncomingEvents])

  useEffect(() => {
    if (activeAnnouncement || announcementQueue.length === 0) return
    setActiveAnnouncement(announcementQueue[0]!)
    setAnnouncementQueue(prev => prev.slice(1))
  }, [activeAnnouncement, announcementQueue])

  const dispatchSpellMove = useCallback((args: {
    spell: CardInfo
    move: Move
    casterInstanceId?: string
    keepInPlay?: boolean
    target?: { cardInstanceId: string; owner: "self" | "opponent" }
  }) => {
    const { spell, move, casterInstanceId, keepInPlay = false, target } = args
    if (target) {
      spellTargetsRef.current[spell.instanceId] = {
        ...target,
        casterInstanceId,
      }
    }

    if (move.type === "PLAY_PHASE3_CARD") {
      sendMove({
        ...move,
        keepInPlay,
        casterInstanceId,
        targetCardInstanceId: target?.cardInstanceId,
        targetOwner: target?.owner,
      })
      return
    }

    sendMove(move)
  }, [sendMove])

  const requestSpellCast = useCallback((spellInstanceId: string, target?: {
    cardInstanceId: string
    owner: "self" | "opponent"
  }) => {
    const game = data
    if (!game) return
    const spellOwnerEntry = Object.entries(game.board.players).find(([, board]) =>
      board.hand.some(c => c.instanceId === spellInstanceId),
    )
    if (!spellOwnerEntry) {
      showWarning("Card not found in hand.")
      return
    }
    const [spellOwnerId, spellOwnerBoard] = spellOwnerEntry
    const spell = spellOwnerBoard.hand.find(c => c.instanceId === spellInstanceId)
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
    const combatCaster = spellCasterInCombat(spell, game.board.combat, spellOwnerId)
    const fallbackCasters = [...new Map([...poolCasters, ...combatCaster].map(c => [c.instanceId, c])).values()]
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

    if (move.type === "PLAY_PHASE3_CARD") {
      const phase3Move: Extract<Move, { type: "PLAY_PHASE3_CARD" }> = {
        type: "PLAY_PHASE3_CARD",
        cardInstanceId: spell.instanceId,
      }
      setPhase3OutcomePrompt({
        spell,
        move: phase3Move,
        casters: availableCasters,
        target,
      })
      return
    }

    if (availableCasters.length > 1) {
      setCasterPrompt({
        spell,
        move,
        casters: availableCasters,
        keepInPlay: false,
        target,
      })
      return
    }

    dispatchSpellMove({
      spell,
      move,
      casterInstanceId: availableCasters[0]?.instanceId,
      keepInPlay: false,
      target,
    })
  }, [data, dispatchSpellMove, showWarning])

  // Auto-phase advancement
  usePhaseTracker(
    data?.phase ?? "",
    data?.legalMoves ?? [],
    sendMove,
    data?.activePlayer ?? "",
    playerA,
    lastMoveType,
  )

  const lingeringSpellsByPlayer = useMemo(
    () => buildLingeringSpellsByPlayer([playerA, playerB], data?.events),
    [data?.events, playerA, playerB],
  )

  if (isLoading) return <div className="page"><p>Loading...</p></div>
  if (error)     return <div className="page"><p className="error">{String(error)}</p></div>
  if (!data)     return null

  return (
    <GameContext.Provider value={{
      playerA,
      playerB,
      myPlayerId:     playerA,
      activePlayer:   data.activePlayer,
      phase:          data.phase,
      turnNumber:     data.turnNumber,
      winner:         data.winner,
      allBoards:      data.board.players,
      lingeringSpellsByPlayer,
      combat:         data.board.combat,
      legalMoves:     data.legalMoves,
      legalMovesPerPlayer: data.legalMovesPerPlayer,
      onMove:         sendMove,
      selectedId,
      onSelect:       setSelectedId,
      contextMenu,
      openContextMenu,
      closeContextMenu,
      warningMessage,
      showWarning,
      clearWarning,
      requestSpellCast,
    }}>
      <GameBoard events={eventLog} wsError={wsError} />
      {phase3OutcomePrompt && (
        <Phase3SpellOutcomeModal
          spell={phase3OutcomePrompt.spell}
          onPick={(keepInPlay) => {
            if (phase3OutcomePrompt.casters.length > 1) {
              setCasterPrompt({
                spell: phase3OutcomePrompt.spell,
                move: phase3OutcomePrompt.move,
                casters: phase3OutcomePrompt.casters,
                keepInPlay,
                target: phase3OutcomePrompt.target,
              })
            } else {
              dispatchSpellMove({
                spell: phase3OutcomePrompt.spell,
                move: phase3OutcomePrompt.move,
                casterInstanceId: phase3OutcomePrompt.casters[0]?.instanceId,
                keepInPlay,
                target: phase3OutcomePrompt.target,
              })
            }
            setPhase3OutcomePrompt(null)
          }}
          onClose={() => setPhase3OutcomePrompt(null)}
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
              keepInPlay: casterPrompt.keepInPlay,
              target: casterPrompt.target,
            })
            setCasterPrompt(null)
          }}
          onClose={() => setCasterPrompt(null)}
        />
      )}
      {activeAnnouncement && (
        <SpellCastAnnouncementModal
          announcement={activeAnnouncement}
          onClose={() => setActiveAnnouncement(null)}
        />
      )}
    </GameContext.Provider>
  )
}
