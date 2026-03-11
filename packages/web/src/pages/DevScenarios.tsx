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
      setBypassUserId(result.p1UserId)
      navigate(`/game/${slug}`)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoadingScenario(null)
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
