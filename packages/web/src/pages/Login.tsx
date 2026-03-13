import { useState } from "react"
import { Navigate } from "react-router-dom"
import { useAuth } from "../auth.tsx"
import styles from "./Login.module.css"

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

type AuthMode = "sign-in" | "sign-up"

export function Login() {
  const {
    isAuthenticated,
    bypass,
    signInWithPassword,
    signUpWithPassword,
    setBypassUserId,
    identity,
    configError,
  } = useAuth()
  const [mode, setMode] = useState<AuthMode>("sign-in")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [bypassUserIdInput, setBypassUserIdInput] = useState(identity?.userId ?? "")

  if (isAuthenticated) return <Navigate to="/" replace />

  async function handlePasswordSubmit() {
    setError(null)
    const safeEmail = email.trim()

    if (mode === "sign-up") {
      if (password !== confirmPassword) {
        setError("Passwords do not match.")
        return
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters.")
        return
      }
    }

    setLoading(true)
    const result =
      mode === "sign-up"
        ? await signUpWithPassword(safeEmail, password)
        : await signInWithPassword(safeEmail, password)
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

  function handleToggleMode() {
    setError(null)
    setMode((current) => (current === "sign-in" ? "sign-up" : "sign-in"))
    setPassword("")
    setConfirmPassword("")
  }

  const canSubmit =
    email.trim().length > 0 &&
    password.length > 0 &&
    (mode === "sign-in" || confirmPassword.length > 0)

  if (bypass) {
    return (
      <div className={styles.loginPage} data-testid="login-page">
        <div className={styles.authCard}>
          <div className={styles.brand}>
            <h1 className={styles.title}>CODEX</h1>
            <p className={styles.subtitle}>Local auth bypass</p>
          </div>
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault()
              handleBypassContinue()
            }}
          >
            <label className={styles.field}>
              <span className={styles.label}>User UUID</span>
              <input
                className={styles.input}
                data-testid="bypass-user-id-input"
                value={bypassUserIdInput}
                onChange={(e) => setBypassUserIdInput(e.target.value)}
              />
            </label>
            <button className={styles.primaryBtn} data-testid="bypass-continue-btn" type="submit">
              Continue
            </button>
            {error && (
              <p className={styles.error} data-testid="login-error">
                {error}
              </p>
            )}
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.loginPage} data-testid="login-page">
      <div className={styles.authCard}>
        <div className={styles.logoWrap}>
          <img className={styles.logo} src="/auth/codex-frog-logo.png" alt="Codex logo" />
        </div>

        <div className={styles.brand}>
          <h1 className={styles.title}>CODEX</h1>
          <p className={styles.subtitle}>
            {mode === "sign-up" ? "Join the realm" : "Enter the realm"}
          </p>
        </div>

        {configError && (
          <p className={styles.error} data-testid="login-config-error">
            {configError}
          </p>
        )}

        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault()
            if (canSubmit && !loading) handlePasswordSubmit()
          }}
        >
          <label className={styles.field}>
            <span className={styles.label}>Email</span>
            <input
              className={styles.input}
              data-testid="login-email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="archmage@codex.gg"
              autoComplete="email"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Password</span>
            <input
              className={styles.input}
              data-testid="login-password-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            />
          </label>

          {mode === "sign-up" && (
            <label className={styles.field}>
              <span className={styles.label}>Confirm password</span>
              <input
                className={styles.input}
                data-testid="signup-confirm-password-input"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="********"
                autoComplete="new-password"
              />
            </label>
          )}

          <button
            className={styles.primaryBtn}
            data-testid="login-password-btn"
            onClick={handlePasswordSubmit}
            disabled={loading || !canSubmit}
          >
            {loading
              ? mode === "sign-up"
                ? "Creating..."
                : "Signing in..."
              : mode === "sign-up"
                ? "Create Account"
                : "Sign In"}
          </button>

          <p className={styles.orRow}>
            <span>OR</span>
          </p>

          <button
            className={styles.googleBtn}
            type="button"
            disabled
            data-testid="login-google-btn"
          >
            <span className={styles.googleG} aria-hidden>
              G
            </span>
            <span>Sign in with Google</span>
          </button>

          <p className={styles.footerRow}>
            {mode === "sign-up" ? "Already have an account?" : "Don't have an account?"}
            <button
              className={styles.toggleBtn}
              type="button"
              data-testid="auth-toggle-mode-btn"
              onClick={handleToggleMode}
            >
              {mode === "sign-up" ? "Sign in" : "Create one"}
            </button>
          </p>

          {error && (
            <p className={styles.error} data-testid="login-error">
              {error}
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
