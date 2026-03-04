import { Hono } from "hono"
import path from "path"

const DATA_DIR = process.env["DATA_DIR"] ?? path.join(import.meta.dir, "../../../data")

const DECKS_DIR = path.join(DATA_DIR, "decks")
const CARDS_DIR = path.join(DATA_DIR, "cards")

export const decksRouter = new Hono()

// Cache cards per set so we don't re-read the file on every request
const cardCache = new Map<string, Map<number, object>>()

async function getCardsForSet(setId: string): Promise<Map<number, object>> {
  if (cardCache.has(setId)) return cardCache.get(setId)!
  const filePath = path.join(CARDS_DIR, `${setId}.json`)
  const file = Bun.file(filePath)
  if (!(await file.exists())) return new Map()
  const cards: Array<{ cardNumber: number }> = await file.json()
  const map = new Map(cards.map((c) => [c.cardNumber, c]))
  cardCache.set(setId, map)
  return map
}

type DeckRef = { setId: string; cardNumber: number }

async function loadDeckRefs(name: string): Promise<DeckRef[] | null> {
  const file = Bun.file(path.join(DECKS_DIR, `${name}.json`))
  if (!(await file.exists())) return null
  const raw: { cards?: DeckRef[] } | DeckRef[] = await file.json()
  return Array.isArray(raw) ? raw : (raw.cards ?? [])
}

async function hydrateDeck(refs: DeckRef[]): Promise<object[]> {
  const hydrated: object[] = []
  for (const ref of refs) {
    const setCards = await getCardsForSet(ref.setId)
    const card = setCards.get(ref.cardNumber)
    if (card) hydrated.push(card)
  }
  return hydrated
}

/** GET /decks — list available deck names */
decksRouter.get("/", async (c) => {
  const allNames = (
    (await Array.fromAsync(new Bun.Glob("*.json").scan({ cwd: DECKS_DIR }))) as string[]
  )
    .map((f) => f.replace(/\.json$/, ""))
    .sort()

  // Show only playable 55-card decks (exactly 55 refs and all refs resolvable).
  const checks = await Promise.all(
    allNames.map(async (name) => {
      const refs = await loadDeckRefs(name)
      if (!refs || refs.length !== 55) return null
      const hydrated = await hydrateDeck(refs)
      return hydrated.length === 55 ? name : null
    }),
  )

  return c.json({ decks: checks.filter((name): name is string => name !== null) })
})

/** GET /decks/:name — hydrated deck with full card data */
decksRouter.get("/:name", async (c) => {
  const name = c.req.param("name")
  const refs = await loadDeckRefs(name)
  if (!refs) return c.notFound()

  const hydrated = await hydrateDeck(refs)
  if (refs.length !== 55 || hydrated.length !== 55) {
    return c.json(
      {
        error: "Deck is not playable in current format (requires exactly 55 resolvable cards).",
        requested: name,
        refCount: refs.length,
        hydratedCount: hydrated.length,
      },
      422,
    )
  }

  return c.json({ name, cards: hydrated })
})
