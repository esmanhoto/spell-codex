import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { getProfile, upsertNickname } from "@spell/db"
import type { AppVariables } from "../auth.ts"

export const profileRouter = new Hono<{ Variables: AppVariables }>()

// ─── GET /me ──────────────────────────────────────────────────────────────────

profileRouter.get("/me", async (c) => {
  const userId = c.get("userId")
  const email = c.get("email")
  const profile = await getProfile(userId)
  return c.json({ userId, nickname: profile?.nickname ?? "", email })
})

// ─── PATCH /me/nickname ───────────────────────────────────────────────────────

profileRouter.patch(
  "/me/nickname",
  zValidator(
    "json",
    z.object({
      nickname: z
        .string()
        .min(1)
        .max(30)
        .regex(
          /^[a-zA-Z0-9 _-]+$/,
          "Alphanumeric characters, spaces, hyphens, and underscores only",
        ),
    }),
  ),
  async (c) => {
    const userId = c.get("userId")
    const { nickname } = c.req.valid("json")
    const profile = await upsertNickname(userId, nickname)
    return c.json({ userId, nickname: profile.nickname })
  },
)
