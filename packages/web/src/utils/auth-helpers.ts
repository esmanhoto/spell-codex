/** Extract meaningful error message from Supabase auth response body. */
export function authErrorMessage(
  body: { msg?: unknown; error_description?: unknown; error?: unknown },
  fallback: string,
): string {
  return (
    (typeof body.msg === "string" && body.msg) ||
    (typeof body.error_description === "string" && body.error_description) ||
    (typeof body.error === "string" && body.error) ||
    fallback
  )
}

/** Build auth headers: prefer Bearer token, fall back to X-User-Id. */
export function authHeaders(identity: {
  accessToken: string | null
  userId: string
}): Record<string, string> {
  if (identity.accessToken) return { Authorization: `Bearer ${identity.accessToken}` }
  return { "X-User-Id": identity.userId }
}
