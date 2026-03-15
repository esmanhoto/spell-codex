import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../auth.tsx"
import { listDevScenarios, loadDevScenario } from "../api.ts"
import type { DevScenarioInfo } from "../api.ts"

type LoadedScenario = {
  scenarioId: string
  slug: string
  p1UserId: string
  p2UserId: string
}

export function DevScenarios() {
  const { setBypassUserId } = useAuth()
  const navigate = useNavigate()

  const [scenarios, setScenarios] = useState<DevScenarioInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingScenario, setLoadingScenario] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<LoadedScenario | null>(null)

  useEffect(() => {
    listDevScenarios()
      .then(setScenarios)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  async function handleLoad(scenarioId: string) {
    setLoadingScenario(scenarioId)
    setLoaded(null)
    setError(null)
    try {
      const result = await loadDevScenario(scenarioId)
      const slug = result.slug ?? result.gameId
      setLoaded({ scenarioId, slug, p1UserId: result.p1UserId, p2UserId: result.p2UserId })
      // Broadcast so any open game tabs can sync to the new game
      localStorage.setItem(
        "spell:dev-restart",
        JSON.stringify({ scenarioId, slug, p1UserId: result.p1UserId, p2UserId: result.p2UserId, ts: Date.now() }),
      )
    } catch (e) {
      setError(String(e))
    } finally {
      setLoadingScenario(null)
    }
  }

  function playAs(userId: string, slug: string, scenarioId: string, asP2: boolean) {
    if (asP2) {
      window.open(`/game/${slug}?devAs=${userId}&scenario=${scenarioId}`, "_blank")
    } else {
      setBypassUserId(userId)
      navigate(`/game/${slug}?scenario=${scenarioId}`)
    }
  }

  return (
    <div className="page" style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ marginBottom: "0.25rem" }}>Dev Scenarios</h1>
      <p style={{ color: "#888", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
        Load a pre-built game state to test a specific rule.
      </p>

      {loading && <p>Loading scenarios…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {loaded && (
        <div
          style={{
            marginBottom: "1.5rem",
            padding: "1rem",
            background: "#0d1a0d",
            border: "1px solid #3a6030",
            borderRadius: 8,
            display: "flex",
            gap: "0.75rem",
            alignItems: "center",
          }}
        >
          <span style={{ color: "#9aaa70", fontSize: "0.85rem", flex: 1 }}>Scenario loaded — choose your seat:</span>
          <button
            onClick={() => playAs(loaded.p1UserId, loaded.slug, loaded.scenarioId, false)}
            style={{
              border: "1px solid #5a8030",
              borderRadius: 5,
              padding: "0.5rem 1rem",
              background: "#1e2e10",
              color: "#b0d488",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.85rem",
            }}
          >
            ▶ Play as P1
          </button>
          <button
            onClick={() => playAs(loaded.p2UserId, loaded.slug, loaded.scenarioId, true)}
            style={{
              border: "1px solid #4a3a32",
              borderRadius: 5,
              padding: "0.5rem 1rem",
              background: "#2a211f",
              color: "#c9b99a",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.85rem",
            }}
          >
            ▶ Play as P2 ↗
          </button>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "0.75rem",
        }}
      >
        {scenarios.map((s) => (
          <button
            key={s.id}
            onClick={() => handleLoad(s.id)}
            disabled={loadingScenario === s.id}
            style={{
              border: "1px solid #333",
              borderRadius: 6,
              padding: "0.75rem 1rem",
              background: loadingScenario === s.id ? "#1a1a1a" : "#111",
              color: "#ddd",
              cursor: loadingScenario === s.id ? "wait" : "pointer",
              textAlign: "left",
              fontSize: "0.85rem",
              fontWeight: 500,
              lineHeight: 1.3,
            }}
          >
            {loadingScenario === s.id ? "Loading…" : s.name}
          </button>
        ))}
      </div>
    </div>
  )
}
