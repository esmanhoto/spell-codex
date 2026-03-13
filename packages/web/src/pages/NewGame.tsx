import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, LogIn, Users, Swords } from "lucide-react"
import {
  listDecks,
  getDeck,
  createLobbyGame,
  joinLobbyGame,
  getLobbyStatus,
  getMyProfile,
  updateNickname,
} from "../api.ts"
import { useAuth } from "../auth.tsx"
import { MusicPlayer } from "../components/MusicPlayer.tsx"
import styles from "./NewGame.module.css"

import { formatEmailAsName } from "../utils/display-name.ts"

type LobbyMode = "create" | "join" | null

export function NewGame() {
  const navigate = useNavigate()
  const { identity, signOut } = useAuth()
  const qc = useQueryClient()

  const [mode, setMode] = useState<LobbyMode>(null)
  const [createDeck, setCreateDeck] = useState("1st_edition_starter_deck_a-1")
  const [joinDeck, setJoinDeck] = useState("1st_edition_starter_deck_b-1")
  const [joinGameId, setJoinGameId] = useState("")
  const [waitingGameId, setWaitingGameId] = useState<string | null>(null)
  const [waitingSlug, setWaitingSlug] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [nicknameInput, setNicknameInput] = useState("")
  const [editingName, setEditingName] = useState(false)

  const { data: deckList } = useQuery({
    queryKey: ["decks"],
    queryFn: listDecks,
  })

  const { data: profileData } = useQuery({
    queryKey: ["my-profile", identity?.userId],
    queryFn: () => getMyProfile(identity!),
    enabled: !!identity,
  })

  useEffect(() => {
    if (profileData && !nicknameInput) {
      setNicknameInput(profileData.nickname)
    }
  }, [profileData, nicknameInput])

  const { mutate: saveNickname } = useMutation({
    mutationFn: (n: string) => updateNickname(identity!, n),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-profile", identity?.userId] }),
  })

  const { data: lobbyStatus } = useQuery({
    queryKey: ["lobby-status", waitingGameId, identity?.userId],
    queryFn: () => getLobbyStatus(waitingGameId!, identity!),
    enabled: !!waitingGameId && !!identity,
    refetchInterval: (q) => (q.state.data?.status === "waiting" ? 1500 : false),
  })

  useEffect(() => {
    if (waitingGameId && lobbyStatus?.status === "active") {
      navigate(`/game/${waitingSlug ?? waitingGameId}`)
    }
  }, [lobbyStatus?.status, navigate, waitingGameId, waitingSlug])

  async function handleCreate() {
    setError(null)
    setInfo(null)
    setLoading(true)
    try {
      if (!identity) throw new Error("You are not authenticated.")
      const { cards } = await getDeck(createDeck)
      const seed = Math.floor(Math.random() * 0x7fffffff)
      const { gameId, slug } = await createLobbyGame({
        identity,
        seed,
        deck: cards,
      })
      setWaitingGameId(gameId)
      setWaitingSlug(slug)
      setMode(null)
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
      const gameIdentifier = joinGameId.trim()
      if (!gameIdentifier) throw new Error("Please enter a Game ID.")

      const { cards } = await getDeck(joinDeck)
      const result = await joinLobbyGame({
        identity,
        gameId: gameIdentifier,
        deck: cards,
      })
      if (result.status !== "active") {
        throw new Error("Game is not ready yet.")
      }
      navigate(`/game/${gameIdentifier}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join game")
    } finally {
      setLoading(false)
    }
  }

  async function copyGameId() {
    setError(null)
    setInfo(null)
    const shareValue = waitingSlug ?? waitingGameId
    if (!shareValue) return
    try {
      await navigator.clipboard.writeText(shareValue)
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
    setWaitingSlug(null)
  }

  function openMode(nextMode: Exclude<LobbyMode, null>) {
    setError(null)
    setInfo(null)
    setMode(nextMode)
  }

  const decks = deckList?.decks ?? []

  return (
    <div className={styles.lobbyPage} data-testid="lobby-page">
      <header className={styles.topBar}>
        <div className={styles.topBrand}>
          <img className={styles.logo} src="/auth/codex-frog-logo.png" alt="Codex logo" />
          <h1 className={styles.brandName}>CODEX</h1>
        </div>

        <div className={styles.topTools}>
          <div className={styles.displayName}>
            {editingName ? (
              <input
                className={styles.displayNameInput}
                type="text"
                autoFocus
                value={nicknameInput}
                maxLength={30}
                onChange={(e) => setNicknameInput(e.target.value)}
                onBlur={() => {
                  const trimmed = nicknameInput.trim()
                  if (trimmed) saveNickname(trimmed)
                  setEditingName(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur()
                  if (e.key === "Escape") {
                    setNicknameInput(profileData?.nickname ?? "")
                    setEditingName(false)
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className={styles.displayNameBtn}
                onClick={() => setEditingName(true)}
              >
                <span className={styles.displayNameLabel}>Your display name:</span>
                <span className={styles.displayNameValue}>
                  {nicknameInput ||
                    (profileData?.email ? formatEmailAsName(profileData.email) : "—")}
                </span>
                <svg
                  className={styles.editIcon}
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden
                >
                  <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H3v-2L11.5 2.5Z" />
                </svg>
              </button>
            )}
          </div>
          <MusicPlayer />
          <button className={styles.signOut} type="button" onClick={() => signOut()}>
            Sign Out
          </button>
        </div>
      </header>

      <main className={styles.mainContent}>
        <section className={styles.leftColumn}>
          <div className={styles.hero}>
            <h2 className={styles.heroTitle}>Ready for Battle?</h2>
            <p className={styles.heroSubtitle}>Create a game or join a friend&apos;s match</p>
          </div>

          <div className={styles.actions}>
            <button
              className={styles.actionCard}
              type="button"
              data-testid="create-mode-btn"
              onClick={() => openMode("create")}
            >
              <span className={styles.createIcon} aria-hidden>
                <Plus className={styles.iconGlyph} />
              </span>
              <span className={styles.actionTitle}>Create Game</span>
              <span className={styles.actionHint}>Host a new match</span>
            </button>

            <button
              className={styles.actionCard}
              type="button"
              data-testid="join-mode-btn"
              onClick={() => openMode("join")}
            >
              <span className={styles.joinIcon} aria-hidden>
                <LogIn className={styles.iconGlyph} />
              </span>
              <span className={styles.actionTitle}>Join Game</span>
              <span className={styles.actionHint}>Enter a game code</span>
            </button>
          </div>
        </section>

        <aside className={styles.rightColumn}>
          <h3 className={styles.rightTitle}>
            <Users className={styles.rightTitleIcon} aria-hidden />
            Waiting Lobby
          </h3>

          {!waitingGameId && (
            <div className={styles.emptyState}>
              <Swords className={styles.emptyIcon} aria-hidden />
              <p className={styles.emptyStrong}>No active games</p>
              <p className={styles.emptySub}>Create or join a game to get started</p>
            </div>
          )}

          {waitingGameId && (
            <div className={styles.waitingRoom} data-testid="waiting-room">
              <div className={styles.waitingCard}>
                <p className={styles.waitingLabel}>Your Game</p>

                <label className={styles.field}>
                  <span className={styles.subLabel}>Game ID</span>
                  <input
                    className={styles.input}
                    data-testid="created-game-id-input"
                    value={waitingSlug ?? waitingGameId ?? ""}
                    readOnly
                  />
                </label>

                <button
                  className={styles.secondaryBtn}
                  type="button"
                  data-testid="copy-game-id-btn"
                  onClick={copyGameId}
                >
                  Copy Game ID
                </button>

                <p className={styles.waitingHint}>Waiting for opponent...</p>
                <p className={styles.waitingHint} data-testid="waiting-player-count">
                  Players in room: {lobbyStatus?.playerCount ?? 1}/2
                </p>
                {lobbyStatus?.players && lobbyStatus.players.length > 0 && (
                  <ul className={styles.waitingHint} style={{ listStyle: "none", padding: 0 }}>
                    {lobbyStatus.players.map((p) => (
                      <li key={p.userId}>{p.nickname || p.userId.slice(0, 8)}</li>
                    ))}
                  </ul>
                )}
              </div>

              <button
                className={styles.secondaryBtn}
                type="button"
                data-testid="enter-game-btn"
                disabled={lobbyStatus?.status !== "active"}
                onClick={() => navigate(`/game/${waitingSlug ?? waitingGameId}`)}
              >
                Enter Game
              </button>

              <button className={styles.secondaryBtn} type="button" onClick={resetToMenu}>
                Cancel
              </button>
            </div>
          )}
        </aside>
      </main>

      {mode && !waitingGameId && (
        <div className={styles.modalOverlay} onClick={resetToMenu}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            {mode === "create" && (
              <>
                <h3 className={styles.modalTitle}>Create Game</h3>
                <p className={styles.modalSubtitle}>Set up your match and invite a friend</p>

                <label className={styles.field}>
                  <span className={styles.label}>Choose your deck</span>
                  <select
                    className={styles.select}
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

                <div className={styles.modalActions}>
                  <button className={styles.modalCancelBtn} type="button" onClick={resetToMenu}>
                    Back
                  </button>
                  <button
                    className={styles.modalCreateBtn}
                    data-testid="create-game-btn"
                    onClick={handleCreate}
                    disabled={loading || decks.length === 0}
                  >
                    {loading ? "Creating..." : "Create"}
                  </button>
                </div>
              </>
            )}

            {mode === "join" && (
              <>
                <h3 className={styles.modalTitle}>Join Game</h3>
                <p className={styles.modalSubtitle}>Enter the game code shared by your opponent</p>

                <label className={styles.field}>
                  <span className={styles.label}>Game ID</span>
                  <input
                    className={styles.input}
                    data-testid="join-game-id-input"
                    value={joinGameId}
                    onChange={(e) => setJoinGameId(e.target.value)}
                    placeholder="cursed-dragon-spire"
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>Choose your deck</span>
                  <select
                    className={styles.select}
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

                <div className={styles.modalActions}>
                  <button className={styles.modalCancelBtn} type="button" onClick={resetToMenu}>
                    Back
                  </button>
                  <button
                    className={styles.modalJoinBtn}
                    data-testid="join-game-btn"
                    onClick={handleJoin}
                    disabled={loading || decks.length === 0 || joinGameId.trim().length === 0}
                  >
                    {loading ? "Joining..." : "Join"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className={styles.feedback}>
        {error && (
          <p className={styles.error} data-testid="new-game-error">
            {error}
          </p>
        )}
        {info && (
          <p className={styles.info} data-testid="new-game-info">
            {info}
          </p>
        )}
      </div>
    </div>
  )
}
