import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { createGame, getGame, getGamePlayers, reconstructState } from "@spell/db"
import { getLegalMoves, calculateCombatLevel, hasWorldMatch } from "@spell/engine"
import type { CardData, CardInstance, Formation, GameState, PoolEntry } from "@spell/engine"

// ─── Validation schemas ───────────────────────────────────────────────────────

const CardDataSchema = z.object({
  setId:       z.string(),
  cardNumber:  z.number().int(),
  name:        z.string(),
  typeId:      z.number().int(),
  worldId:     z.number().int(),
  isAvatar:    z.boolean().default(false),
  level:       z.union([z.number(), z.string(), z.null()]),
  description: z.string().default(""),
  attributes:  z.array(z.string()).default([]),
  supportIds:  z.array(z.union([z.number(), z.string()])).default([]),
  effects:     z.array(z.unknown()).default([]),
}).passthrough() as z.ZodType<CardData>

const PlayerInputSchema = z.object({
  userId:       z.string().uuid(),
  deckSnapshot: z.array(CardDataSchema).min(55).max(110),
  isBot:        z.boolean().default(false),
})

const CreateGameSchema = z.object({
  formatId: z.string(),
  seed:     z.number().int(),
  players:  z.tuple([PlayerInputSchema, PlayerInputSchema]),
})

export const gamesRouter = new Hono<{ Variables: { userId: string } }>()

// ─── POST /games ──────────────────────────────────────────────────────────────

gamesRouter.post("/", zValidator("json", CreateGameSchema), async (c) => {
  const userId = c.get("userId")
  const body   = c.req.valid("json")

  // Requester must be one of the two players
  const ids = body.players.map(p => p.userId)
  if (!ids.includes(userId)) {
    return c.json({ error: "You must be one of the two players" }, 400)
  }

  const game = await createGame({
    formatId: body.formatId,
    seed:     body.seed,
    players: body.players.map((p, i) => ({
      userId:       p.userId,
      seatPosition: i,
      deckSnapshot: p.deckSnapshot,
      isBot:        p.isBot,
    })),
  })

  return c.json({ gameId: game.id }, 201)
})

// ─── GET /games/:id ───────────────────────────────────────────────────────────

gamesRouter.get("/:id", async (c) => {
  const userId = c.get("userId")
  const gameId = c.req.param("id")

  const game = await getGame(gameId)
  if (!game) return c.json({ error: "Game not found" }, 404)

  const players = await getGamePlayers(gameId)
  if (!players.some(p => p.userId === userId)) {
    return c.json({ error: "Forbidden" }, 403)
  }

  const { state, errors } = await reconstructState(gameId, game.seed)

  return c.json({
    gameId:         game.id,
    status:         game.status,
    phase:          state.phase,
    activePlayer:   state.activePlayer,
    turnNumber:     state.currentTurn,
    turnDeadline:   game.turnDeadline,
    winner:         state.winner ?? null,
    // Legal moves are always for the active player so the client
    // doesn't need to re-fetch as a different user.
    legalMoves:     getLegalMoves(state, state.activePlayer),
    pendingEffects: state.pendingEffects,
    board:          serializeBoard(state),
    integrityErrors: errors.length > 0 ? errors : undefined,
  })
})

// ─── Board serialisation ──────────────────────────────────────────────────────

function card(inst: CardInstance) {
  return {
    instanceId:  inst.instanceId,
    name:        inst.card.name,
    typeId:      inst.card.typeId,
    worldId:     inst.card.worldId,
    level:       inst.card.level,
    setId:       inst.card.setId,
    cardNumber:  inst.card.cardNumber,
    description: inst.card.description,
  }
}

function serializeFormation(f: Formation) {
  const SLOTS = ["A","B","C","D","E","F","G","H","I","J"].slice(0, f.size)
  return Object.fromEntries(SLOTS.map(s => {
    const slot = f.slots[s as keyof typeof f.slots]
    if (!slot) return [s, null]
    return [s, {
      realm:    card(slot.realm),
      holdings: slot.holdings.map(card),
      isRazed:  slot.isRazed,
    }]
  }))
}

function serializePool(pool: PoolEntry[]) {
  return pool.map(e => ({
    champion:    card(e.champion),
    attachments: e.attachments.map(card),
  }))
}

function serializeCombat(state: GameState) {
  const c = state.combatState!
  const realmSlot = state.players[c.defendingPlayer]?.formation.slots[c.targetRealmSlot]
  const realmWorldId = realmSlot?.realm.card.worldId ?? 0

  const attackerLevel = c.attacker
    ? calculateCombatLevel(c.attacker, c.attackerCards, hasWorldMatch(c.attacker, realmWorldId), c.effectSpecs, "offensive")
    : 0
  const defenderLevel = c.defender
    ? calculateCombatLevel(c.defender, c.defenderCards, hasWorldMatch(c.defender, realmWorldId), c.effectSpecs, "defensive")
    : 0

  return {
    attackingPlayer: c.attackingPlayer,
    defendingPlayer: c.defendingPlayer,
    targetSlot:      c.targetRealmSlot,
    roundPhase:      c.roundPhase,
    attacker:        c.attacker ? card(c.attacker) : null,
    defender:        c.defender ? card(c.defender) : null,
    attackerCards:   c.attackerCards.map(card),
    defenderCards:   c.defenderCards.map(card),
    attackerLevel,
    defenderLevel,
  }
}

function serializeBoard(state: GameState) {
  return {
    players: Object.fromEntries(
      Object.entries(state.players).map(([id, p]) => [id, {
        hand:          p.hand.map(card),
        formation:     serializeFormation(p.formation),
        pool:          serializePool(p.pool),
        drawPileCount: p.drawPile.length,
        discardCount:  p.discardPile.length,
      }])
    ),
    combat: state.combatState ? serializeCombat(state) : null,
  }
}
