import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../auth.tsx"
import { listDevScenarios, loadDevScenario } from "../api.ts"
import type { DevScenarioInfo } from "../api.ts"

export function DevScenarios() {
  const { setBypassUserId } = useAuth()
  const navigate = useNavigate()

  const [scenarios, setScenarios] = useState<DevScenarioInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingScenario, setLoadingScenario] = useState<string | null>(null)

  useEffect(() => {
    listDevScenarios()
      .then(setScenarios)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  async function handleLoad(scenarioId: string) {
    setLoadingScenario(scenarioId)
    setError(null)
    try {
      const result = await loadDevScenario(scenarioId)
      const slug = result.slug ?? result.gameId
      setBypassUserId(result.p2UserId)
      navigate(`/game/${slug}`)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoadingScenario(null)
    }
  }

  return (
    <div className="page" style={{ maxWidth: 700, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ marginBottom: "0.25rem" }}>Dev Scenarios</h1>
      <p style={{ color: "#888", marginBottom: "2rem", fontSize: "0.9rem" }}>
        Load a pre-built game state with real cards to explore a specific rule in the UI. Only
        available when AUTH_BYPASS=true.
      </p>

      {loading && <p>Loading scenarios…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {scenarios.map((s) => (
          <div
            key={s.id}
            style={{
              border: "1px solid #333",
              borderRadius: 6,
              padding: "1rem 1.25rem",
              background: "#111",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: "0.3rem" }}>{s.name}</div>
            <div style={{ color: "#aaa", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
              {s.description}
            </div>

            <button
              onClick={() => handleLoad(s.id)}
              disabled={loadingScenario === s.id}
              style={{ padding: "0.4rem 1rem", cursor: "pointer" }}
            >
              {loadingScenario === s.id ? "Loading…" : "Load"}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
