import type {
  GameState,
  CardInstance,
  PlayerState,
  CombatState,
  FormationSlot,
  ResolutionContext,
} from "@spell/engine"
import {
  Phase,
  calculateCombatLevel,
  hasWorldMatch,
  getLosingPlayer,
  populateTriggers,
} from "@spell/engine"
import type { GameEvent } from "@spell/engine"
import { lookupCard } from "./card-lookup.ts"
import type { ScenarioDef, CardRef, CombatDef, ResolutionContextSeed } from "./scenarios.ts"

// ─── Fixed dev player UUIDs ───────────────────────────────────────────────────
// These match the web's BYPASS_DEFAULT_USER_ID so the dev page works out of
// the box in AUTH_BYPASS=true mode without any extra identity configuration.

export const DEV_P1_ID = "00000000-0000-0000-0000-000000000001"
export const DEV_P2_ID = "00000000-0000-0000-0000-000000000002"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolve(ref: CardRef, instanceId: string): CardInstance {
  return { instanceId, card: lookupCard(ref.setId, ref.cardNumber) }
}

function buildPlayerState(def: ScenarioDef["p1"], prefix: string, userId: string): PlayerState {
  const hand = (def.hand ?? []).map((ref, i) => resolve(ref, `${prefix}-hand-${i}`))
  const drawPile = (def.drawPile ?? []).map((ref, i) => resolve(ref, `${prefix}-draw-${i}`))
  const discardPile = (def.discardPile ?? []).map((ref, i) => resolve(ref, `${prefix}-disc-${i}`))

  const pool = (def.pool ?? []).map((entry, i) => ({
    champion: resolve(entry.card, `${prefix}-pool-${i}`),
    attachments: (entry.attachments ?? []).map((ref, j) =>
      resolve(ref, `${prefix}-pool-${i}-att-${j}`),
    ),
  }))

  const slots: Partial<
    Record<FormationSlot, { realm: CardInstance; isRazed: boolean; holdings: CardInstance[] }>
  > = {}
  for (const [slotKey, slotDef] of Object.entries(def.formation ?? {})) {
    if (!slotDef) continue
    slots[slotKey as FormationSlot] = {
      realm: resolve(slotDef.realm, `${prefix}-realm-${slotKey}`),
      isRazed: slotDef.isRazed ?? false,
      holdings: (slotDef.holdings ?? []).map((ref, i) =>
        resolve(ref, `${prefix}-holding-${slotKey}-${i}`),
      ),
    }
  }

  return {
    id: userId,
    hand,
    drawPile,
    discardPile,
    limbo: [],
    abyss: [],
    formation: { size: 6, slots },
    dungeon: null,
    pool,
    lastingEffects: [],
  }
}

function buildCombatState(
  combat: CombatDef,
  p1State: PlayerState,
  p2State: PlayerState,
): CombatState {
  const attackerState = combat.attackingPlayer === "p1" ? p1State : p2State
  const defenderState = combat.attackingPlayer === "p1" ? p2State : p1State

  const attacker = attackerState.pool[0]?.champion ?? null

  // Defender is only pre-set in CARD_PLAY (both players already committed).
  // In AWAITING_DEFENDER it must be null — the player picks it in the UI.
  const targetRealmSlot = defenderState.formation.slots[combat.targetSlot]
  const poolDefender = defenderState.pool[0]?.champion ?? null
  const defender =
    combat.roundPhase === "CARD_PLAY"
      ? (poolDefender ?? (targetRealmSlot?.realm.card.level != null ? targetRealmSlot.realm : null))
      : null

  return {
    attackingPlayer: attackerState.id,
    defendingPlayer: defenderState.id,
    targetRealmSlot: combat.targetSlot,
    roundPhase: combat.roundPhase,
    attacker,
    defender,
    attackerCards: [],
    defenderCards: [],
    championsUsedThisBattle: [
      ...(attacker ? [attacker.instanceId] : []),
      ...(defender ? [defender.instanceId] : []),
    ],
    attackerWins: 0,
    attackerManualLevel: null,
    defenderManualLevel: null,
  }
}

function buildResolutionContext(
  seed: ResolutionContextSeed,
  _p1State: PlayerState,
  _p2State: PlayerState,
): ResolutionContext {
  const initiatingId = seed.initiatingPlayer === "p1" ? DEV_P1_ID : DEV_P2_ID
  const instanceId = `${seed.initiatingPlayer}-pending-card`
  const pendingCard: CardInstance = resolve(seed.pendingCard, instanceId)
  return {
    cardInstanceId: instanceId,
    pendingCard,
    initiatingPlayer: initiatingId,
    resolvingPlayer: initiatingId,
    cardDestination: seed.cardDestination,
    counterWindowOpen: seed.counterWindowOpen ?? true,
  }
}

// ─── Main builder ─────────────────────────────────────────────────────────────

/**
 * Builds a complete GameState from a ScenarioDef using real card data.
 * The returned state's `id` is a placeholder — `createDevGame` overwrites it
 * with the actual DB game UUID after insertion.
 */
export function buildScenarioState(scenario: ScenarioDef): GameState {
  const p1State = buildPlayerState(scenario.p1, "p1", DEV_P1_ID)
  const p2State = buildPlayerState(scenario.p2, "p2", DEV_P2_ID)

  const combatState = scenario.combat ? buildCombatState(scenario.combat, p1State, p2State) : null

  // Active player depends on the combat phase.
  let activePlayer = DEV_P1_ID
  if (combatState?.roundPhase === "AWAITING_DEFENDER") {
    // Defender picks their champion
    activePlayer = combatState.defendingPlayer
  } else if (combatState?.roundPhase === "AWAITING_ATTACKER") {
    activePlayer = combatState.attackingPlayer
  } else if (
    combatState &&
    combatState.roundPhase === "CARD_PLAY" &&
    combatState.attacker &&
    combatState.defender
  ) {
    const defenderState = p1State.id === combatState.defendingPlayer ? p1State : p2State
    const realmSlot = defenderState.formation.slots[combatState.targetRealmSlot]
    const realmWorldId = realmSlot?.realm.card.worldId ?? 0
    const attackerState2 = p1State.id === combatState.attackingPlayer ? p1State : p2State
    const attackerPool = attackerState2.pool.find(
      (e) => e.champion.instanceId === combatState.attacker!.instanceId,
    )
    const defenderPool = defenderState.pool.find(
      (e) => e.champion.instanceId === combatState.defender!.instanceId,
    )
    const attackerLevel = calculateCombatLevel(
      combatState.attacker,
      combatState.attackerCards,
      hasWorldMatch(combatState.attacker, realmWorldId),
      "offensive",
      attackerPool?.attachments ?? [],
    )
    const defenderIsRealm = realmSlot?.realm.instanceId === combatState.defender.instanceId
    const defenderLevel = calculateCombatLevel(
      combatState.defender,
      combatState.defenderCards,
      !defenderIsRealm && hasWorldMatch(combatState.defender, realmWorldId),
      "defensive",
      defenderPool?.attachments ?? [],
    )
    activePlayer = getLosingPlayer(attackerLevel, defenderLevel, combatState)
  }

  const phase = combatState ? Phase.Combat : scenario.phase ? (scenario.phase as Phase) : Phase.Pool

  const resolutionContext = scenario.resolutionContext
    ? buildResolutionContext(scenario.resolutionContext, p1State, p2State)
    : null

  // When a resolution context is pre-seeded, the resolving player is "active"
  // (they're waiting on the counter window). The counter player (p1 in these scenarios)
  // sends PASS_COUNTER / PLAY_EVENT as an out-of-turn move.
  if (resolutionContext) {
    activePlayer = resolutionContext.initiatingPlayer === DEV_P1_ID ? DEV_P1_ID : DEV_P2_ID
  }

  let state: GameState = {
    id: "dev-placeholder",
    players: {
      [DEV_P1_ID]: p1State,
      [DEV_P2_ID]: p2State,
    },
    currentTurn: 5,
    activePlayer,
    playerOrder: [DEV_P1_ID, DEV_P2_ID],
    phase,
    combatState,
    resolutionContext,
    pendingTriggers: [],
    endTriggersPopulated: false,
    winner: null,
    events: [],
    deckSize: 55,
    hasAttackedThisTurn: !!combatState,
    hasPlayedRealmThisTurn: false,
    pendingSpoil: null,
  }

  // Pre-populate start-of-turn triggers so they appear immediately in START_OF_TURN scenarios.
  if (phase === Phase.StartOfTurn) {
    const events: GameEvent[] = []
    state = populateTriggers(state, "start", events)
    state = { ...state, events }
  }

  return state
}
