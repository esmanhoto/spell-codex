import { Hono } from "hono"
import path from "path"

const ASSETS_DIR = process.env["ASSETS_DIR"] ?? path.join(import.meta.dir, "../../../data/assets")

export const cardsRouter = new Hono()

/** GET /cards/cardback.jpg */
cardsRouter.get("/cardback.jpg", async (c) => {
  const filePath = path.join(ASSETS_DIR, "cards", "cardback.jpg")
  const file = Bun.file(filePath)
  if (!(await file.exists())) return c.notFound()
  return new Response(file, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
})

// Allowlist: setId is alphanumeric (e.g. "1st", "2nd"), filename is digits + .jpg
const SAFE_SET_ID = /^[a-zA-Z0-9_-]+$/
const SAFE_FILENAME = /^[a-zA-Z0-9_-]+\.jpg$/

/** GET /cards/:setId/:cardNumber.jpg */
cardsRouter.get("/:setId/:filename", async (c) => {
  const { setId, filename } = c.req.param()
  if (!SAFE_SET_ID.test(setId) || !SAFE_FILENAME.test(filename)) return c.notFound()

  const filePath = path.join(ASSETS_DIR, "cards", setId, filename)
  const file = Bun.file(filePath)

  if (!(await file.exists())) return c.notFound()

  return new Response(file, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
})
