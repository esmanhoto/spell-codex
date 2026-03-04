import type { Move } from "../api.ts"

export function moveInvolves(m: Move, id: string): boolean {
  switch (m.type) {
    case "PLAY_REALM":
    case "PLAY_HOLDING":
    case "PLACE_CHAMPION":
    case "PLAY_PHASE3_CARD":
    case "PLAY_PHASE5_CARD":
    case "PLAY_RULE_CARD":
    case "PLAY_EVENT":
    case "PLAY_COMBAT_CARD":
    case "DISCARD_CARD":
    case "MANUAL_PLAY_CARD":
      return (m as { cardInstanceId: string }).cardInstanceId === id
    case "ATTACH_ITEM":
      return (
        (m as { cardInstanceId: string; championId: string }).cardInstanceId === id ||
        (m as { cardInstanceId: string; championId: string }).championId === id
      )
    case "DECLARE_ATTACK":
    case "DECLARE_DEFENSE":
    case "CONTINUE_ATTACK":
      return (m as { championId: string }).championId === id
    default:
      return false
  }
}

export function labelMove(m: Move, nameOf: (id: string) => string, phase?: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = m as any
  switch (m.type) {
    case "PASS":
      return phase === "START_OF_TURN" ? "Draw cards" : "Next phase"
    case "END_TURN":
      return "End Turn"
    case "SET_PLAY_MODE":
      return `Set mode: ${a.mode}`
    case "MANUAL_END_TURN":
      return "Manual end turn"
    case "MANUAL_SET_ACTIVE_PLAYER":
      return `Set active: ${a.playerId}`
    case "MANUAL_SET_DRAW_COUNT":
      return `Draw count: ${a.count}`
    case "MANUAL_SET_MAX_HAND_SIZE":
      return `Hand limit: ${a.size}`
    case "MANUAL_PLAY_CARD":
      return `Manual play ${nameOf(a.cardInstanceId)} (${a.resolution})`
    case "PLAY_REALM":
      return `Play ${nameOf(a.cardInstanceId)} \u2192 slot ${a.slot}`
    case "REBUILD_REALM":
      return `Rebuild slot ${a.slot}`
    case "PLAY_HOLDING":
      return `Play ${nameOf(a.cardInstanceId)} \u2192 slot ${a.realmSlot}`
    case "TOGGLE_HOLDING_REVEAL":
      return "Toggle holding reveal"
    case "PLACE_CHAMPION":
      return `Place ${nameOf(a.cardInstanceId)}`
    case "ATTACH_ITEM":
      return `Attach ${nameOf(a.cardInstanceId)} \u2192 ${nameOf(a.championId)}`
    case "PLAY_PHASE3_CARD":
      return `Cast ${nameOf(a.cardInstanceId)}`
    case "PLAY_PHASE5_CARD":
      return `Play ${nameOf(a.cardInstanceId)}`
    case "PLAY_RULE_CARD":
      return `Rule: ${nameOf(a.cardInstanceId)}`
    case "PLAY_EVENT":
      return `Event: ${nameOf(a.cardInstanceId)}`
    case "DECLARE_ATTACK":
      return `Attack slot ${a.targetRealmSlot} with ${nameOf(a.championId)}`
    case "DECLARE_DEFENSE":
      return `Defend with ${nameOf(a.championId)}`
    case "DECLINE_DEFENSE":
      return `Decline defense`
    case "PLAY_COMBAT_CARD":
      return `Play ${nameOf(a.cardInstanceId)}`
    case "STOP_PLAYING":
      return "Stop playing cards"
    case "CONTINUE_ATTACK":
      return `Continue with ${nameOf(a.championId)}`
    case "END_ATTACK":
      return "End attack"
    case "DISCARD_CARD":
      return `Discard ${nameOf(a.cardInstanceId)}`
    case "MANUAL_DISCARD":
      return `Discard ${nameOf(a.cardInstanceId)}`
    case "MANUAL_TO_LIMBO":
      return `Limbo: ${nameOf(a.cardInstanceId)}`
    case "MANUAL_TO_ABYSS":
      return `Abyss: ${nameOf(a.cardInstanceId)}`
    case "MANUAL_TO_HAND":
      return `To hand: ${nameOf(a.cardInstanceId)}`
    case "MANUAL_RAZE_REALM":
      return `Raze realm slot ${a.slot}`
    case "MANUAL_DRAW_CARDS":
      return `Draw ${a.count} card(s)`
    case "MANUAL_RETURN_TO_POOL":
      return `Return to pool: ${nameOf(a.cardInstanceId)}`
    case "MANUAL_AFFECT_OPPONENT":
      return `${a.action} opp. ${nameOf(a.cardInstanceId)}`
    case "MANUAL_SET_COMBAT_LEVEL":
      return `Set level ${a.level}`
    case "MANUAL_SWITCH_COMBAT_SIDE":
      return `Switch side: ${nameOf(a.cardInstanceId)}`
    default:
      return m.type as string
  }
}

export const ANCHOR_FREE_TYPES = new Set([
  "PASS",
  "END_TURN",
  "STOP_PLAYING",
  "CONTINUE_ATTACK",
  "END_ATTACK",
  "DECLINE_DEFENSE",
  "REBUILD_REALM",
  "SET_PLAY_MODE",
  "MANUAL_END_TURN",
  "MANUAL_SET_ACTIVE_PLAYER",
  "MANUAL_SET_DRAW_COUNT",
  "MANUAL_SET_MAX_HAND_SIZE",
])
