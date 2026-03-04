import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { listDecks, getDeck, createLobbyGame, joinLobbyGame, getLobbyStatus } from "../api.ts"
import { useAuth } from "../auth.tsx"

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

type LobbyMode = "create" | "join" | null

export function NewGame() {
  const navigate = useNavigate()
  const { identity, signOut } = useAuth()

  const [mode, setMode] = useState<LobbyMode>(null)
  const [createDeck, setCreateDeck] = useState("1st_edition_starter_deck_a-1")
  const [joinDeck, setJoinDeck] = useState("1st_edition_starter_deck_b-1")
  const [joinGameId, setJoinGameId] = useState("")
  const [waitingGameId, setWaitingGameId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { data: deckList } = useQuery({
    queryKey: ["decks"],
    queryFn: listDecks,
  })

  const { data: lobbyStatus } = useQuery({
    queryKey: ["lobby-status", waitingGameId, identity?.userId],
    queryFn: () => getLobbyStatus(waitingGameId!, identity!),
    enabled: !!waitingGameId && !!identity,
    refetchInterval: (q) => (q.state.data?.status === "waiting" ? 1500 : false),
  })

  useEffect(() => {
    if (waitingGameId && lobbyStatus?.status === "active") {
      navigate(`/game/${waitingGameId}`)
    }
  }, [lobbyStatus?.status, navigate, waitingGameId])

  async function handleCreate() {
    setError(null)
    setInfo(null)
    setLoading(true)
    try {
      if (!identity) throw new Error("You are not authenticated.")
      const { cards } = await getDeck(createDeck)
      const seed = Math.floor(Math.random() * 0x7fffffff)
      const { gameId } = await createLobbyGame({
        identity,
        seed,
        deck: cards,
      })
      setWaitingGameId(gameId)
      setInfo("Game created. Share this Game ID so your friend can join.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create game")
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin() {
    setError(null)
    setInfo(null)
    setLoading(true)
    try {
      if (!identity) throw new Error("You are not authenticated.")
      const gameId = joinGameId.trim()
      if (!isUuid(gameId)) throw new Error("Game ID must be a valid UUID.")

      const { cards } = await getDeck(joinDeck)
      const result = await joinLobbyGame({
        identity,
        gameId,
        deck: cards,
      })
      if (result.status !== "active") {
        throw new Error("Game is not ready yet.")
      }
      navigate(`/game/${gameId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join game")
    } finally {
      setLoading(false)
    }
  }

  async function copyGameId() {
    setError(null)
    setInfo(null)
    if (!waitingGameId) return
    try {
      await navigator.clipboard.writeText(waitingGameId)
      setInfo("Game ID copied.")
    } catch {
      setInfo("Could not copy automatically. Copy Game ID manually.")
    }
  }

  function resetToMenu() {
    setError(null)
    setInfo(null)
    setMode(null)
    setJoinGameId("")
    setWaitingGameId(null)
  }

  const decks = deckList?.decks ?? []

  return (
    <div className="page" data-testid="lobby-page">
      <h1>Spellfire</h1>
      <h2>Lobby</h2>

      <div className="form">
        {!waitingGameId && mode == null && (
          <>
            <button type="button" data-testid="create-mode-btn" onClick={() => setMode("create")}>
              Create a New Game
            </button>
            <button type="button" data-testid="join-mode-btn" onClick={() => setMode("join")}>
              Join a Game
            </button>
          </>
        )}

        {!waitingGameId && mode === "create" && (
          <>
            <label>
              Your Deck
              <select
                data-testid="create-deck-select"
                value={createDeck}
                onChange={(e) => setCreateDeck(e.target.value)}
              >
                {decks.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <button
              data-testid="create-game-btn"
              onClick={handleCreate}
              disabled={loading || decks.length === 0}
            >
              {loading ? "Creating..." : "Create Game"}
            </button>
            <button type="button" onClick={resetToMenu}>
              Back
            </button>
          </>
        )}

        {!waitingGameId && mode === "join" && (
          <>
            <label>
              Game ID
              <input
                data-testid="join-game-id-input"
                value={joinGameId}
                onChange={(e) => setJoinGameId(e.target.value)}
                placeholder="Paste game UUID"
              />
            </label>
            <label>
              Your Deck
              <select
                data-testid="join-deck-select"
                value={joinDeck}
                onChange={(e) => setJoinDeck(e.target.value)}
              >
                {decks.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <button
              data-testid="join-game-btn"
              onClick={handleJoin}
              disabled={loading || decks.length === 0 || joinGameId.trim().length === 0}
            >
              {loading ? "Joining..." : "Join Game"}
            </button>
            <button type="button" onClick={resetToMenu}>
              Back
            </button>
          </>
        )}

        {waitingGameId && (
          <div data-testid="waiting-room">
            <label>
              Game ID
              <input data-testid="created-game-id-input" value={waitingGameId} readOnly />
            </label>
            <button type="button" data-testid="copy-game-id-btn" onClick={copyGameId}>
              Copy Game ID
            </button>
            <p className="hint">Waiting for opponent to join...</p>
            <p className="hint" data-testid="waiting-player-count">
              Players in room: {lobbyStatus?.playerCount ?? 1}/2
            </p>
            <button
              type="button"
              data-testid="enter-game-btn"
              disabled={lobbyStatus?.status !== "active"}
              onClick={() => navigate(`/game/${waitingGameId}`)}
            >
              Enter Game
            </button>
            <button type="button" onClick={resetToMenu}>
              Cancel
            </button>
          </div>
        )}

        {error && (
          <p className="error" data-testid="new-game-error">
            {error}
          </p>
        )}
        {info && <p data-testid="new-game-info">{info}</p>}

        <button type="button" onClick={() => signOut()}>
          Sign Out
        </button>
      </div>
    </div>
  )
}
