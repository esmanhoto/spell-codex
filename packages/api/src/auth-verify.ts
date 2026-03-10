function getSupabaseUrl(): string {
  const url = process.env["SUPABASE_URL"]
  if (!url) {
    throw new Error("SUPABASE_URL is required when AUTH_BYPASS is not enabled")
  }
  return url.replace(/\/$/, "")
}

function getSupabaseAnonKey(): string {
  const key = process.env["SUPABASE_ANON_KEY"]
  if (!key) {
    throw new Error("SUPABASE_ANON_KEY is required when AUTH_BYPASS is not enabled")
  }
  return key
}

export function authBypassEnabled(): boolean {
  return process.env["AUTH_BYPASS"] === "true"
}

export async function verifySupabaseAccessToken(token: string): Promise<string> {
  const { id } = await verifySupabaseAccessTokenFull(token)
  return id
}

export async function verifySupabaseAccessTokenFull(
  token: string,
): Promise<{ id: string; email: string | null }> {
  const response = await fetch(`${getSupabaseUrl()}/auth/v1/user`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: getSupabaseAnonKey(),
    },
  })
  if (!response.ok) {
    throw new Error("Invalid access token")
  }
  const user = (await response.json()) as { id?: unknown; email?: unknown }
  if (typeof user.id !== "string" || user.id.length === 0) {
    throw new Error("Missing user id in token payload")
  }
  const email = typeof user.email === "string" && user.email.length > 0 ? user.email : null
  return { id: user.id, email }
}
