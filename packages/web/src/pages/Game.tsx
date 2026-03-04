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
import { Phase3SpellOutcomeModal } from "../components/game/Phase3SpellOutcomeModal.tsx"
import {
  ManualPlayModal,
  type ManualPlayTargetOption,
} from "../components/game/ManualPlayModal.tsx"
import {
  SpellCastAnnouncementModal,
  type SpellCastAnnouncement,
} from "../components/game/SpellCastAnnouncementModal.tsx"
import { CounterCastModal } from "../components/game/CounterCastModal.tsx"
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
  keepInPlay: boolean
}

function isPhase3SpellCastEvent(event: GameEvent): event is GameEvent & Phase3SpellCastEvent {
  return event.type === "PHASE3_SPELL_CAST"
}

type PlayModeChangedEvent = {
  type: "PLAY_MODE_CHANGED"
  playerId: string
  mode: "full_manual" | "semi_auto"
}

function isPlayModeChangedEvent(event: GameEvent): event is GameEvent & PlayModeChangedEvent {
  return event.type === "PLAY_MODE_CHANGED"
}

function buildLingeringSpellsByPlayer(
  playerIds: string[],
  events: GameEvent[] | undefined,
): Record<string, CardInfo[]> {
  const result = Object.fromEntries(playerIds.map((id) => [id, [] as CardInfo[]]))
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
    confirmAction?: () => void
  } | null>(null)
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
  const [counterPrompt, setCounterPrompt] = useState<SpellCastAnnouncement | null>(null)
  const [manualPlayPrompt, setManualPlayPrompt] = useState<{ card: CardInfo } | null>(null)
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
    setCounterPrompt(null)
    setManualPlayPrompt(null)
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
              keepInPlay: event.keepInPlay,
            })
          }
        }

        if (isPlayModeChangedEvent(event) && event.mode === "full_manual") {
          showWarning(`Game put on manual mode by ${event.playerId}.`, "manual_mode_switch")
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
    if (activeAnnouncement || counterPrompt || announcementQueue.length === 0) return
    setActiveAnnouncement(announcementQueue[0]!)
    setAnnouncementQueue((prev) => prev.slice(1))
  }, [activeAnnouncement, announcementQueue, counterPrompt])

  const dispatchSpellMove = useCallback(
    (args: {
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
          ...(casterInstanceId !== undefined ? { casterInstanceId } : {}),
        }
      }

      if (move.type === "PLAY_PHASE3_CARD") {
        sendMove({
          ...move,
          keepInPlay,
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
      const combatCaster = spellCasterInCombat(spell, game.board.combat, spellOwnerId)
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

      if (move.type === "PLAY_PHASE3_CARD") {
        const phase3Move: Extract<Move, { type: "PLAY_PHASE3_CARD" }> = {
          type: "PLAY_PHASE3_CARD",
          cardInstanceId: spell.instanceId,
        }
        setPhase3OutcomePrompt({
          spell,
          move: phase3Move,
          casters: availableCasters,
          ...(target ? { target } : {}),
        })
        return
      }

      if (availableCasters.length > 1) {
        setCasterPrompt({
          spell,
          move,
          casters: availableCasters,
          keepInPlay: false,
          ...(target ? { target } : {}),
        })
        return
      }

      dispatchSpellMove({
        spell,
        move,
        ...(availableCasters[0] ? { casterInstanceId: availableCasters[0].instanceId } : {}),
        keepInPlay: false,
        ...(target ? { target } : {}),
      })
    },
    [data, dispatchSpellMove, showWarning],
  )

  const requestManualPlay = useCallback(
    (cardInstanceId: string) => {
      if (!data) return
      const me = data.board.players[myPlayerId]
      if (!me) return
      const card = me.hand.find((c) => c.instanceId === cardInstanceId)
      if (!card) {
        showWarning("Card not found in hand.")
        return
      }
      setManualPlayPrompt({ card })
    },
    [data, myPlayerId, showWarning],
  )

  usePhaseTracker(
    data?.phase ?? "",
    data?.legalMoves ?? [],
    sendMove,
    data?.activePlayer ?? "",
    myPlayerId,
    lastMoveType,
  )

  const playerIds = useMemo(() => Object.keys(data?.board.players ?? {}), [data?.board.players])
  const opponentPlayerId = playerIds.find((id) => id !== myPlayerId) ?? ""

  const manualPlayTargets = useMemo<ManualPlayTargetOption[]>(() => {
    if (!data || !myPlayerId || !opponentPlayerId) return []
    const game = data
    const result: ManualPlayTargetOption[] = []

    function pushBoardTargets(owner: "self" | "opponent", ownerId: string): void {
      const board = game.board.players[ownerId]
      if (!board) return
      for (const [slot, slotState] of Object.entries(board.formation)) {
        if (!slotState) continue
        result.push({
          cardInstanceId: slotState.realm.instanceId,
          label: `${slotState.realm.name} (realm ${slot})`,
          owner,
          kind: "realm",
          realmSlot: slot,
        })
        for (const holding of slotState.holdings) {
          result.push({
            cardInstanceId: holding.instanceId,
            label: `${holding.name} (holding ${slot})`,
            owner,
            kind: "card",
          })
        }
      }
      for (const entry of board.pool) {
        result.push({
          cardInstanceId: entry.champion.instanceId,
          label: `${entry.champion.name} (champion)`,
          owner,
          kind: "card",
        })
        for (const attachment of entry.attachments) {
          result.push({
            cardInstanceId: attachment.instanceId,
            label: `${attachment.name} (attachment)`,
            owner,
            kind: "card",
          })
        }
      }
    }

    pushBoardTargets("self", myPlayerId)
    pushBoardTargets("opponent", opponentPlayerId)
    return result
  }, [data, myPlayerId, opponentPlayerId])
  const selfRealmSlots = useMemo(() => {
    const slotsFromBoard = Object.keys(data?.board.players[myPlayerId]?.formation ?? {})
    const slotsFromMoves = (data?.legalMoves ?? []).flatMap((m) => {
      if (m.type === "PLAY_REALM") return [(m as { slot: string }).slot]
      if (m.type === "REBUILD_REALM") return [(m as { slot: string }).slot]
      return []
    })
    const unique = [...new Set([...slotsFromBoard, ...slotsFromMoves])]
    return unique.length > 0 ? unique : ["A", "B", "C", "D", "E", "F"]
  }, [data?.board.players, data?.legalMoves, myPlayerId])

  const lingeringSpellsByPlayer = useMemo(
    () => buildLingeringSpellsByPlayer(playerIds, data?.events),
    [data?.events, playerIds],
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
        playMode: data.playMode,
        manualSettings: data.manualSettings,
        winner: data.winner,
        allBoards: data.board.players,
        lingeringSpellsByPlayer,
        combat: data.board.combat,
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
        warningConfirmAction: warningState?.confirmAction ?? null,
        showWarning,
        suppressWarningCode,
        clearWarning,
        requestSpellCast,
        requestManualPlay,
      }}
    >
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
                ...(phase3OutcomePrompt.target ? { target: phase3OutcomePrompt.target } : {}),
              })
            } else {
              dispatchSpellMove({
                spell: phase3OutcomePrompt.spell,
                move: phase3OutcomePrompt.move,
                ...(phase3OutcomePrompt.casters[0]
                  ? { casterInstanceId: phase3OutcomePrompt.casters[0].instanceId }
                  : {}),
                keepInPlay,
                ...(phase3OutcomePrompt.target ? { target: phase3OutcomePrompt.target } : {}),
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
          canCounter={
            activeAnnouncement.playerId !== myPlayerId &&
            data.playMode === "full_manual" &&
            (data.board.players[myPlayerId]?.hand.length ?? 0) > 0
          }
          onCounter={() => {
            setCounterPrompt(activeAnnouncement)
            setActiveAnnouncement(null)
          }}
          onClose={() => setActiveAnnouncement(null)}
        />
      )}
      {counterPrompt && (
        <CounterCastModal
          cards={data.board.players[myPlayerId]?.hand ?? []}
          onPick={(cardInstanceId) => {
            const me = data.board.players[myPlayerId]
            const card = me?.hand.find((c) => c.instanceId === cardInstanceId)
            if (!card) {
              showWarning("Card not found in hand.")
              setCounterPrompt(null)
              return
            }
            setManualPlayPrompt({ card })
            setCounterPrompt(null)
          }}
          onClose={() => setCounterPrompt(null)}
        />
      )}
      {manualPlayPrompt && (
        <ManualPlayModal
          card={manualPlayPrompt.card}
          targets={manualPlayTargets}
          selfRealmSlots={selfRealmSlots}
          onPick={(selection) => {
            sendMove({
              type: "MANUAL_PLAY_CARD",
              cardInstanceId: manualPlayPrompt.card.instanceId,
              targetKind: selection.targetKind,
              resolution: selection.resolution,
              ...(selection.targetOwner != null ? { targetOwner: selection.targetOwner } : {}),
              ...(selection.targetCardInstanceId != null
                ? { targetCardInstanceId: selection.targetCardInstanceId }
                : {}),
              ...(selection.targetRealmSlot != null
                ? { targetRealmSlot: selection.targetRealmSlot }
                : {}),
            })
            setManualPlayPrompt(null)
          }}
          onClose={() => setManualPlayPrompt(null)}
        />
      )}
    </GameContext.Provider>
  )
}
