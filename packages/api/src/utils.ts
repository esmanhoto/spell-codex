import { getGame, getGameBySlug } from "@spell/db"

export { formatEmailAsName } from "@spell/engine"

// ─── Game resolution ────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Resolves a game by UUID or slug. */
export async function resolveGame(idOrSlug: string) {
  if (UUID_RE.test(idOrSlug)) return getGame(idOrSlug)
  return getGameBySlug(idOrSlug)
}
