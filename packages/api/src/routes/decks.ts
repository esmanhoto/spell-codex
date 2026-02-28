import { Hono } from "hono"
import path from "path"

const DATA_DIR =
  process.env["DATA_DIR"] ?? path.join(import.meta.dir, "../../../data")

const DECKS_DIR = path.join(DATA_DIR, "decks")
const CARDS_DIR = path.join(DATA_DIR, "cards")

export const decksRouter = new Hono()

// Cache cards per set so we don't re-read the file on every request
const cardCache = new Map<string, Map<number, object>>()

async function getCardsForSet(setId: string): Promise<Map<number, object>> {
  if (cardCache.has(setId)) return cardCache.get(setId)!
  const filePath = path.join(CARDS_DIR, `${setId}.json`)
  const file     = Bun.file(filePath)
  if (!await file.exists()) return new Map()
  const cards: Array<{ cardNumber: number }> = await file.json()
  const map = new Map(cards.map(c => [c.cardNumber, c]))
  cardCache.set(setId, map)
  return map
}

/** GET /decks — list available deck names */
decksRouter.get("/", async (c) => {
  const names = (await Array.fromAsync(
    new Bun.Glob("*.json").scan({ cwd: DECKS_DIR })
  ) as string[])
    .map(f => f.replace(/\.json$/, ""))
    .sort()

  return c.json({ decks: names })
})

/** GET /decks/:name — hydrated deck with full card data */
decksRouter.get("/:name", async (c) => {
  const name = c.req.param("name")
  const file = Bun.file(path.join(DECKS_DIR, `${name}.json`))
  if (!await file.exists()) return c.notFound()

  const raw: { cards?: Array<{ setId: string; cardNumber: number }> } | Array<{ setId: string; cardNumber: number }> = await file.json()
  const refs = Array.isArray(raw) ? raw : raw.cards ?? []

  const hydrated: object[] = []
  for (const ref of refs) {
    const setCards = await getCardsForSet(ref.setId)
    const card     = setCards.get(ref.cardNumber)
    if (card) hydrated.push(card)
  }

  return c.json({ name, cards: hydrated })
})
