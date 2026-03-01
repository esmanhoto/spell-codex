import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { listDecks, getDeck, createGame } from "../api.ts"

const DEFAULT_PLAYER_A  = "00000000-0000-0000-0000-000000000001"
const DEFAULT_PLAYER_B  = "00000000-0000-0000-0000-000000000002"

export function NewGame() {
  const navigate = useNavigate()

  const [playerA,  setPlayerA]  = useState(DEFAULT_PLAYER_A)
  const [playerB,  setPlayerB]  = useState(DEFAULT_PLAYER_B)
  const [deckA,    setDeckA]    = useState("1st_edition_starter_deck_a-1")
  const [deckB,    setDeckB]    = useState("1st_edition_starter_deck_b-1")
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  const { data: deckList } = useQuery({
    queryKey: ["decks"],
    queryFn:  listDecks,
  })

  async function handleStart() {
    setError(null)
    setLoading(true)
    try {
      const [{ cards: cardsA }, { cards: cardsB }] = await Promise.all([
        getDeck(deckA),
        getDeck(deckB),
      ])

      const seed      = Math.floor(Math.random() * 0x7fffffff)
      const { gameId } = await createGame({
        playerAId: playerA,
        playerBId: playerB,
        seed,
        deckA:     cardsA,
        deckB:     cardsB,
      })

      sessionStorage.setItem(`game:${gameId}:playerA`, playerA)
      sessionStorage.setItem(`game:${gameId}:playerB`, playerB)
      navigate(`/game/${gameId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create game")
    } finally {
      setLoading(false)
    }
  }

  const decks = deckList?.decks ?? []

  return (
    <div className="page">
      <h1>Spellfire</h1>
      <h2>New Game</h2>

      <div className="form">
        <label>
          Player A (UUID)
          <input value={playerA} onChange={e => setPlayerA(e.target.value)} />
        </label>
        <label>
          Player A — Deck
          <select value={deckA} onChange={e => setDeckA(e.target.value)}>
            {decks.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>

        <label>
          Player B (UUID)
          <input value={playerB} onChange={e => setPlayerB(e.target.value)} />
        </label>

        <label>
          Player B — Deck
          <select value={deckB} onChange={e => setDeckB(e.target.value)}>
            {decks.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>

        <p className="hint">
          You will control both players from this browser.
        </p>

        {error && <p className="error">{error}</p>}

        <button onClick={handleStart} disabled={loading || decks.length === 0}>
          {loading ? "Starting…" : "Start Game"}
        </button>
      </div>
    </div>
  )
}
