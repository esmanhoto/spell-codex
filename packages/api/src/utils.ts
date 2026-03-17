import { getGame, getGameBySlug } from "@spell/db"

export function formatEmailAsName(email: string): string {
  const prefix = email.split("@")[0] ?? email
  return prefix
    .split(/[._\-+]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

// ─── Game resolution ────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Resolves a game by UUID or slug. */
export async function resolveGame(idOrSlug: string) {
  if (UUID_RE.test(idOrSlug)) return getGame(idOrSlug)
  return getGameBySlug(idOrSlug)
}
