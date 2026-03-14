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

export function labelMove(m: Move, nameOf: (id: string) => string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = m as any
  switch (m.type) {
    case "PASS":
      return "Draw cards"
    case "END_TURN":
      return "End Turn"
    case "PLAY_REALM":
      return `Play ${nameOf(a.cardInstanceId)} \u2192 slot ${a.slot}`
    case "REBUILD_REALM":
      return `Rebuild slot ${a.slot} (discard 3)`
    case "DISCARD_RAZED_REALM":
      return `Discard razed realm in slot ${a.slot}`
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
    case "INTERRUPT_COMBAT":
      return "Interrupt combat"
    case "DISCARD_CARD":
      return `Discard ${nameOf(a.cardInstanceId)}`
    case "SET_COMBAT_LEVEL":
      return `Set level ${a.level}`
    case "SWITCH_COMBAT_SIDE":
      return `Switch side: ${nameOf(a.cardInstanceId)}`
    case "RESOLVE_DONE":
      return "Done resolving"
    case "RESOLVE_SET_CARD_DESTINATION":
      return `Set destination: ${a.destination}`
    case "RESOLVE_RAZE_REALM":
      return `Raze slot ${a.slot}`
    case "RESOLVE_REBUILD_REALM":
      return `Rebuild slot ${a.slot}`
    case "RESOLVE_DRAW_CARDS":
      return `Draw ${a.count} card(s)`
    case "RESOLVE_RETURN_TO_POOL":
      return `Return ${nameOf(a.cardInstanceId)} to pool`
    case "RESOLVE_MOVE_CARD":
      return `Move ${nameOf(a.cardInstanceId)} to ${(a.destination as { zone: string }).zone}`
    case "RESOLVE_ATTACH_CARD":
      return `Attach ${nameOf(a.cardInstanceId)} to ${nameOf(a.targetInstanceId)}`
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
  "INTERRUPT_COMBAT",
  "DECLINE_DEFENSE",
  "REBUILD_REALM",
  "DISCARD_RAZED_REALM",
])
