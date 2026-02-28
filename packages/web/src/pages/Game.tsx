import { useState, useRef, useEffect, useCallback } from "react"
import { useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getGameState, submitMove, createWsClient } from "../api.ts"
import type { GameState, Move, GameEvent, WsClientMessage } from "../api.ts"
import { GameContext } from "../context/GameContext.tsx"
import type { ContextMenuState } from "../context/GameContext.tsx"
import { GameBoard } from "../components/game/GameBoard.tsx"
import { usePhaseTracker } from "../hooks/usePhaseTracker.ts"
import "../styles/game-vars.css"

export function Game() {
  const { id: gameId } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [eventLog, setEventLog] = useState<GameEvent[]>([])
  const [wsError, setWsError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const wsRef = useRef<ReturnType<typeof createWsClient> | null>(null)

  const openContextMenu = useCallback((x: number, y: number, actions: ContextMenuState["actions"]) => {
    setContextMenu({ x, y, actions })
  }, [])
  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const playerA = sessionStorage.getItem(`game:${gameId}:playerA`) ?? ""
  const playerB = sessionStorage.getItem(`game:${gameId}:playerB`) ?? ""

  const { data, error, isLoading, refetch } = useQuery<GameState>({
    queryKey: ["game", gameId],
    queryFn:  () => getGameState(gameId!, playerA),
    enabled:  !!gameId,
    staleTime: Infinity,
  })

  const handleWsMessage = useCallback((msg: WsClientMessage) => {
    if (msg.type === "STATE_UPDATE") {
      const state = msg.state as GameState
      qc.setQueryData(["game", gameId], state)
      if (state.events?.length) {
        setEventLog(prev => {
          const newEvents = state.events!.slice(prev.length)
          return newEvents.length ? [...prev, ...newEvents] : prev
        })
      }
    } else if (msg.type === "ERROR") {
      setWsError(`${msg.code}: ${msg.message}`)
      setTimeout(() => setWsError(null), 5000)
    }
  }, [gameId, qc])

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
    if (wsRef.current?.sendMove(m)) return
    const asUser = data?.activePlayer === playerA ? playerA : playerB
    submitMove(gameId!, asUser, m).then(() => refetch()).catch(console.error)
  }, [data, gameId, playerA, playerB, refetch])

  // Auto-phase advancement
  usePhaseTracker(
    data?.phase ?? "",
    data?.legalMoves ?? [],
    sendMove,
    data?.activePlayer ?? "",
    playerA,
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
      combat:         data.board.combat,
      pendingEffects: data.pendingEffects,
      responseWindow: data.responseWindow,
      legalMoves:     data.legalMoves,
      legalMovesPerPlayer: data.legalMovesPerPlayer,
      onMove:         sendMove,
      selectedId,
      onSelect:       setSelectedId,
      contextMenu,
      openContextMenu,
      closeContextMenu,
    }}>
      <GameBoard events={eventLog} wsError={wsError} />
    </GameContext.Provider>
  )
}
