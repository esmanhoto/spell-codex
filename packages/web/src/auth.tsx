import { createContext, useContext, useEffect, useMemo, useState } from "react"

const BYPASS_DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"
const BYPASS_STORAGE_KEY = "spell:bypass-user-id"
const TOKEN_STORAGE_KEY = "spell:auth:access-token"

const BYPASS = import.meta.env["VITE_AUTH_BYPASS"] === "true"
const SUPABASE_URL = import.meta.env["VITE_SUPABASE_URL"] as string | undefined
const SUPABASE_ANON_KEY = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined

export interface AuthIdentity {
  userId: string
  accessToken: string | null
}

interface AuthContextType {
  isLoading: boolean
  isAuthenticated: boolean
  identity: AuthIdentity | null
  bypass: boolean
  configError: string | null
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  signInWithGoogle: () => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  setBypassUserId: (userId: string) => void
}

const AuthContext = createContext<AuthContextType>({
  isLoading: true,
  isAuthenticated: false,
  identity: null,
  bypass: false,
  configError: null,
  signInWithPassword: async () => ({ error: "Auth not initialized" }),
  signInWithGoogle: async () => ({ error: "Auth not initialized" }),
  signOut: async () => {},
  setBypassUserId: () => {},
})

function consumeTokenFromUrlHash(): string | null {
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash
  if (!hash) return null
  const params = new URLSearchParams(hash)
  const token = params.get("access_token")
  if (!token) return null
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search)
  return token
}

async function fetchSupabaseUser(token: string): Promise<{ id: string } | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
  })
  if (!response.ok) return null
  const body = (await response.json()) as { id?: unknown }
  if (typeof body.id !== "string" || body.id.length === 0) return null
  return { id: body.id }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<AuthIdentity | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [bypassUserId, setBypassUserIdState] = useState(
    () => localStorage.getItem(BYPASS_STORAGE_KEY) ?? BYPASS_DEFAULT_USER_ID,
  )

  const configError = useMemo(() => {
    if (BYPASS) return null
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY."
    }
    return null
  }, [])

  useEffect(() => {
    if (BYPASS) {
      setIdentity({ userId: bypassUserId, accessToken: null })
      setIsLoading(false)
      return
    }

    let cancelled = false

    async function bootstrap() {
      setIsLoading(true)
      const tokenFromHash = consumeTokenFromUrlHash()
      if (tokenFromHash) {
        sessionStorage.setItem(TOKEN_STORAGE_KEY, tokenFromHash)
      }
      const token = tokenFromHash ?? sessionStorage.getItem(TOKEN_STORAGE_KEY)
      if (!token) {
        if (!cancelled) {
          setIdentity(null)
          setIsLoading(false)
        }
        return
      }

      try {
        const user = await fetchSupabaseUser(token)
        if (!cancelled) {
          if (user) {
            setIdentity({ userId: user.id, accessToken: token })
          } else {
            sessionStorage.removeItem(TOKEN_STORAGE_KEY)
            setIdentity(null)
          }
          setIsLoading(false)
        }
      } catch {
        if (!cancelled) {
          sessionStorage.removeItem(TOKEN_STORAGE_KEY)
          setIdentity(null)
          setIsLoading(false)
        }
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
    }
  }, [bypassUserId])

  async function signInWithPassword(
    email: string,
    password: string,
  ): Promise<{ error: string | null }> {
    if (BYPASS) return { error: null }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { error: "Supabase client not configured" }
    }

    const response = await fetch(
      `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email, password }),
      },
    )

    const body = (await response.json()) as {
      access_token?: unknown
      user?: { id?: unknown }
      msg?: unknown
      error_description?: unknown
      error?: unknown
    }

    if (!response.ok) {
      const msg =
        (typeof body.msg === "string" && body.msg) ||
        (typeof body.error_description === "string" && body.error_description) ||
        (typeof body.error === "string" && body.error) ||
        "Invalid email/password"
      return { error: msg }
    }

    const token = typeof body.access_token === "string" ? body.access_token : null
    const userId = typeof body.user?.id === "string" ? body.user.id : null
    if (!token || !userId) {
      return { error: "Login response missing token or user id" }
    }

    sessionStorage.setItem(TOKEN_STORAGE_KEY, token)
    setIdentity({ userId, accessToken: token })
    return { error: null }
  }

  async function signInWithGoogle(): Promise<{ error: string | null }> {
    if (BYPASS) return { error: null }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { error: "Supabase client not configured" }
    }

    const authUrl = new URL(`${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/authorize`)
    authUrl.searchParams.set("provider", "google")
    authUrl.searchParams.set("redirect_to", `${window.location.origin}/login`)
    window.location.assign(authUrl.toString())
    return { error: null }
  }

  async function signOut() {
    if (BYPASS) return
    const token = sessionStorage.getItem(TOKEN_STORAGE_KEY)
    sessionStorage.removeItem(TOKEN_STORAGE_KEY)
    setIdentity(null)

    if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return

    await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/logout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
    }).catch(() => {})
  }

  function setBypassUserId(userId: string) {
    setBypassUserIdState(userId)
    localStorage.setItem(BYPASS_STORAGE_KEY, userId)
    setIdentity({ userId, accessToken: null })
  }

  const value = useMemo<AuthContextType>(
    () => ({
      isLoading,
      isAuthenticated: identity != null,
      identity,
      bypass: BYPASS,
      configError,
      signInWithPassword,
      signInWithGoogle,
      signOut,
      setBypassUserId,
    }),
    [configError, identity, isLoading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
