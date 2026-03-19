import type { CardInfo, CombatInfo, Move, PlayerBoard, SlotState } from "../api.ts"
import type { ContextMenuAction } from "../context/types.ts"
import { isChampionType } from "@spell/engine"
import { isSpellCard, spellCastersInPool, spellCasterInCombat, getCastPhases, phaseToCastPhase } from "./spell-casting.ts"

function findCardMove(legalMoves: Move[], type: Move["type"], cardInstanceId: string): Move | null {
  return (
    legalMoves.find(
      (m) =>
        m.type === type && (m as { cardInstanceId?: string }).cardInstanceId === cardInstanceId,
    ) ?? null
  )
}

function findAllCardMoves(legalMoves: Move[], type: Move["type"], cardInstanceId: string): Move[] {
  return legalMoves.filter(
    (m) => m.type === type && (m as { cardInstanceId?: string }).cardInstanceId === cardInstanceId,
  )
}

// Card type IDs
const TYPE_REALM = 13
const TYPE_HOLDING = 8
const TYPE_ARTIFACT = 2
const TYPE_MAGICAL_ITEM = 9
const TYPE_EVENT = 6
const TYPE_ALLY = 1

// Types that can be played as combat support cards
const COMBAT_SUPPORT_TYPES = new Set([TYPE_ALLY, TYPE_ARTIFACT, TYPE_MAGICAL_ITEM])

export function buildHandContextActions(args: {
  card: CardInfo
  isOpponent: boolean
  legalMoves: Move[]
  requestSpellCast: (spellInstanceId: string) => void
  combat?: CombatInfo | null
  openTargetPicker?: (title: string, targets: { label: string; move: Move }[]) => void
  myBoard: PlayerBoard
  myPlayerId: string
  allBoards: Record<string, PlayerBoard>
  phase: string
}): ContextMenuAction[] {
  const { card, isOpponent, legalMoves, requestSpellCast, combat, openTargetPicker, myBoard, myPlayerId, allBoards, phase } = args
  if (isOpponent) return []

  const inCombat = !!combat
  const actions: ContextMenuAction[] = []
  const id = card.instanceId

  // ─── Spell cards: Cast Spell (disabled when no caster available) ───────
  if (isSpellCard(card)) {
    let canCast: boolean
    if (inCombat) {
      canCast = spellCasterInCombat(card, combat!, myPlayerId, myBoard, allBoards).length > 0
    } else {
      const hasCaster = spellCastersInPool(card, myBoard).length > 0
      const castPhase = phaseToCastPhase(phase)
      const validPhase = castPhase != null && getCastPhases(card).includes(castPhase)
      canCast = hasCaster && validPhase
    }
    actions.push(
      canCast
        ? { label: "Cast Spell", action: () => requestSpellCast(id) }
        : { label: "Cast Spell", disabled: true },
    )
  }

  // ─── Combat support: Play in Combat ────────────────────────────────────
  if (COMBAT_SUPPORT_TYPES.has(card.typeId) || isSpellCard(card)) {
    const move = findCardMove(legalMoves, "PLAY_COMBAT_CARD", id)
    actions.push(move ? { label: "Play in Combat", move } : { label: "Play in Combat", disabled: true })
  }

  // ─── Event cards: Play Event (events work in and out of combat) ─────────
  if (card.typeId === TYPE_EVENT) {
    const move = findCardMove(legalMoves, "PLAY_EVENT", id)
    actions.push(move ? { label: "Play Event", move } : { label: "Play Event", disabled: true })
  }

  // ─── Champion cards: Place in Pool ─────────────────────────────────────
  if (isChampionType(card.typeId)) {
    const move = findCardMove(legalMoves, "PLACE_CHAMPION", id)
    const disabled = !move || inCombat
    actions.push(disabled ? { label: "Place in Pool", disabled: true } : { label: "Place in Pool", move })
  }

  // ─── Realm cards: Play Realm ───────────────────────────────────────────
  if (card.typeId === TYPE_REALM) {
    const moves = findAllCardMoves(legalMoves, "PLAY_REALM", id)
    if (inCombat || moves.length === 0) {
      actions.push({ label: "Play Realm", disabled: true })
    } else if (moves.length === 1) {
      actions.push({ label: "Play Realm", move: moves[0] })
    } else if (openTargetPicker) {
      const targets = moves.map((m) => {
        const slot = (m as { slot: string }).slot
        return { label: `Slot ${slot}`, move: m }
      })
      actions.push({ label: "Play Realm...", action: () => openTargetPicker("Play Realm in slot", targets) })
    } else {
      // fallback: use first move
      actions.push({ label: "Play Realm", move: moves[0] })
    }
  }

  // ─── Holding cards: Play Holding ───────────────────────────────────────
  if (card.typeId === TYPE_HOLDING) {
    const moves = findAllCardMoves(legalMoves, "PLAY_HOLDING", id)
    if (inCombat || moves.length === 0) {
      actions.push({ label: "Play Holding", disabled: true })
    } else if (moves.length === 1) {
      actions.push({ label: "Play Holding", move: moves[0] })
    } else if (openTargetPicker) {
      const targets = moves.map((m) => {
        const realmSlot = (m as { realmSlot: string }).realmSlot
        const realmName = myBoard?.formation[realmSlot]?.realm.name ?? realmSlot
        return { label: realmName, move: m }
      })
      actions.push({ label: "Play Holding...", action: () => openTargetPicker("Attach Holding to", targets) })
    } else {
      actions.push({ label: "Play Holding", move: moves[0] })
    }
  }

  // ─── Artifact / Magical Item: Attach to Champion ───────────────────────
  if (card.typeId === TYPE_ARTIFACT || card.typeId === TYPE_MAGICAL_ITEM) {
    const moves = findAllCardMoves(legalMoves, "ATTACH_ITEM", id)
    if (inCombat || moves.length === 0) {
      actions.push({ label: "Attach to Champion", disabled: true })
    } else if (moves.length === 1) {
      actions.push({ label: "Attach to Champion", move: moves[0] })
    } else if (openTargetPicker) {
      const targets = moves.map((m) => {
        const championId = (m as { championId: string }).championId
        const champName = myBoard?.pool.find((e) => e.champion.instanceId === championId)?.champion.name ?? championId
        return { label: champName, move: m }
      })
      actions.push({ label: "Attach to Champion...", action: () => openTargetPicker("Attach to", targets) })
    } else {
      // fallback: use first move
      actions.push({ label: "Attach to Champion", move: moves[0] })
    }
  }

  // ─── Discard (always available) ─────────────────────────────────────────
  const discardMove = findCardMove(legalMoves, "DISCARD_CARD", id)
  actions.push(discardMove ? { label: "Discard", move: discardMove } : { label: "Discard", disabled: true })

  return actions
}

export type HandDropTarget =
  | { zone: "pool" }
  | { zone: "champion"; owner: "self" | "opponent"; championId: string }
  | {
      zone: "formation_slot"
      owner: "self" | "opponent"
      slot: string
      slotState: SlotState | null
    }

export function resolveHandDropMove(args: {
  legalMoves: Move[]
  cardInstanceId: string
  target: HandDropTarget
}): Move | null {
  const { legalMoves, cardInstanceId, target } = args

  if (target.zone === "pool") {
    return findCardMove(legalMoves, "PLACE_CHAMPION", cardInstanceId)
  }

  if (target.zone === "champion") {
    return (
      legalMoves.find(
        (m) =>
          m.type === "ATTACH_ITEM" &&
          (m as { cardInstanceId: string; championId: string }).cardInstanceId === cardInstanceId &&
          (m as { cardInstanceId: string; championId: string }).championId === target.championId,
      ) ?? null
    )
  }

  if (target.slotState) {
    const realmMove = legalMoves.find(
      (m) =>
        m.type === "PLAY_REALM" &&
        (m as { cardInstanceId: string; slot: string }).cardInstanceId === cardInstanceId &&
        (m as { cardInstanceId: string; slot: string }).slot === target.slot,
    )
    if (realmMove) return realmMove

    return (
      legalMoves.find(
        (m) =>
          m.type === "PLAY_HOLDING" &&
          (m as { cardInstanceId: string; realmSlot: string }).cardInstanceId === cardInstanceId &&
          (m as { cardInstanceId: string; realmSlot: string }).realmSlot === target.slot,
      ) ?? null
    )
  }

  return (
    legalMoves.find(
      (m) =>
        m.type === "PLAY_REALM" &&
        (m as { cardInstanceId: string; slot: string }).cardInstanceId === cardInstanceId &&
        (m as { cardInstanceId: string; slot: string }).slot === target.slot,
    ) ?? null
  )
}
