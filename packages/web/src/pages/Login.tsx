import { useState } from "react"
import { Navigate } from "react-router-dom"
import { useAuth } from "../auth.tsx"

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function Login() {
  const { isAuthenticated, bypass, signInWithPassword, setBypassUserId, identity, configError } =
    useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [bypassUserIdInput, setBypassUserIdInput] = useState(identity?.userId ?? "")

  if (isAuthenticated) return <Navigate to="/" replace />

  async function handlePasswordSignIn() {
    setError(null)
    setLoading(true)
    const result = await signInWithPassword(email.trim(), password)
    setLoading(false)
    if (result.error) {
      setError(result.error)
    }
  }

  function handleBypassContinue() {
    setError(null)
    const value = bypassUserIdInput.trim()
    if (!isUuid(value)) {
      setError("Enter a valid UUID.")
      return
    }
    setBypassUserId(value)
  }

  return (
    <div className="page" data-testid="login-page">
      <h1>Spellfire</h1>
      <h2>{bypass ? "Local Auth (Bypass)" : "Sign In"}</h2>

      {configError && (
        <p className="error" data-testid="login-config-error">
          {configError}
        </p>
      )}

      <div className="form">
        {bypass ? (
          <>
            <label>
              User UUID
              <input
                data-testid="bypass-user-id-input"
                value={bypassUserIdInput}
                onChange={(e) => setBypassUserIdInput(e.target.value)}
              />
            </label>
            <button data-testid="bypass-continue-btn" onClick={handleBypassContinue}>
              Continue
            </button>
          </>
        ) : (
          <>
            <label>
              Email
              <input
                data-testid="login-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                data-testid="login-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
              />
            </label>
            <button
              data-testid="login-password-btn"
              onClick={handlePasswordSignIn}
              disabled={loading || email.trim().length === 0 || password.length === 0}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </>
        )}

        {error && (
          <p className="error" data-testid="login-error">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
