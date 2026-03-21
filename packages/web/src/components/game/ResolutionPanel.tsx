import { useState, useEffect, useMemo, useRef } from "react"
import type { Move, ResolutionContextInfo, ResolutionDeclarationInfo, PlayerBoard } from "../../api.ts"
import { CHAMPION_TYPE_IDS } from "@spell/engine"
import styles from "./ResolutionPanel.module.css"

const DEST_LABELS: Record<string, string> = {
  discard: "Discard",
  abyss: "Abyss",
  void: "Void",
  in_play: "Keep in Play",
}

type ActionCategory =
  | "raze_realm"
  | "rebuild_realm"
  | "discard_champion"
  | "discard_ally"
  | "discard_item"
  | "discard_holding"
  | "draw_cards"
  | "return_to_play"
  | "other"

const CATEGORY_LABELS: Record<ActionCategory, string> = {
  raze_realm: "Raze a Realm",
  rebuild_realm: "Rebuild a Realm",
  discard_champion: "Discard/Remove Champion",
  discard_ally: "Discard/Remove Ally",
  discard_item: "Discard/Remove Item or Artifact",
  discard_holding: "Discard/Remove Holding",
  draw_cards: "Draw Cards",
  return_to_play: "Return Champion to Pool",
  other: "Other Effects",
}

const ALLY_TYPE_ID = 1
const MAGICAL_ITEM_TYPE_ID = 9
const ARTIFACT_TYPE_ID = 2

interface TargetCard {
  instanceId: string
  name: string
  playerId: string
  context: string
}

interface RealmTarget {
  playerId: string
  slot: string
  realmName: string
}

function collectTargets(allBoards: Record<string, PlayerBoard>) {
  const unrazedRealms: RealmTarget[] = []
  const razedRealms: RealmTarget[] = []
  const champions: TargetCard[] = []
  const allies: TargetCard[] = []
  const items: TargetCard[] = []
  const holdings: TargetCard[] = []
  const discardChampions: TargetCard[] = []

  for (const [playerId, board] of Object.entries(allBoards)) {
    for (const [slot, slotState] of Object.entries(board.formation)) {
      if (!slotState) continue
      if (slotState.isRazed) {
        razedRealms.push({ playerId, slot, realmName: slotState.realm.name })
      } else {
        unrazedRealms.push({ playerId, slot, realmName: slotState.realm.name })
      }
      for (const h of slotState.holdings) {
        holdings.push({
          instanceId: h.instanceId,
          name: h.name,
          playerId,
          context: `on ${slotState.realm.name}`,
        })
      }
    }

    for (const entry of board.pool) {
      champions.push({
        instanceId: entry.champion.instanceId,
        name: entry.champion.name,
        playerId,
        context: "",
      })
      for (const att of entry.attachments) {
        const target =
          att.typeId === ALLY_TYPE_ID
            ? allies
            : att.typeId === MAGICAL_ITEM_TYPE_ID || att.typeId === ARTIFACT_TYPE_ID
              ? items
              : items
        target.push({
          instanceId: att.instanceId,
          name: att.name,
          playerId,
          context: `on ${entry.champion.name}`,
        })
      }
    }

    for (const card of board.discardPile) {
      if (CHAMPION_TYPE_IDS.has(card.typeId)) {
        discardChampions.push({
          instanceId: card.instanceId,
          name: card.name,
          playerId,
          context: "",
        })
      }
    }
  }

  return { unrazedRealms, razedRealms, champions, allies, items, holdings, discardChampions }
}

function getAvailableCategories(targets: ReturnType<typeof collectTargets>): ActionCategory[] {
  const cats: ActionCategory[] = []
  if (targets.unrazedRealms.length > 0) cats.push("raze_realm")
  if (targets.razedRealms.length > 0) cats.push("rebuild_realm")
  if (targets.champions.length > 0) cats.push("discard_champion")
  if (targets.allies.length > 0) cats.push("discard_ally")
  if (targets.items.length > 0) cats.push("discard_item")
  if (targets.holdings.length > 0) cats.push("discard_holding")
  cats.push("draw_cards")
  if (targets.discardChampions.length > 0) cats.push("return_to_play")
  cats.push("other")
  return cats
}

function groupByOwner<T extends { playerId: string }>(cards: T[], myPlayerId: string) {
  const mine = cards.filter((c) => c.playerId === myPlayerId)
  const theirs = cards.filter((c) => c.playerId !== myPlayerId)
  return { mine, theirs }
}

export function ResolutionPanel({
  ctx,
  allBoards,
  myPlayerId,
  onMove,
}: {
  ctx: ResolutionContextInfo
  allBoards: Record<string, PlayerBoard>
  myPlayerId: string
  onMove: (m: Move | Move[]) => void
}) {
  const [selectedCategory, setSelectedCategory] = useState<ActionCategory | null>(null)
  const [checkedCards, setCheckedCards] = useState<Set<string>>(new Set())
  const [checkedRealms, setCheckedRealms] = useState<Set<string>>(new Set())
  const [drawCount, setDrawCount] = useState(1)
  const [otherText, setOtherText] = useState("")
  const [pendingDone, setPendingDone] = useState(false)
  const [localDestination, setLocalDestination] = useState<string | null>(null)
  // Declarations accumulated from draw_cards actions
  const [declarations, setDeclarations] = useState<ResolutionDeclarationInfo[]>([])
  // Self-affecting moves collected at Done time, sent with final batch
  const pendingSelfMovesRef = useRef<Move[]>([])
  const isMyResolution = ctx.resolvingPlayer === myPlayerId
  const targets = useMemo(() => collectTargets(allBoards), [allBoards])
  const availableCategories = getAvailableCategories(targets)

  useEffect(() => {
    setSelectedCategory(null)
    setCheckedCards(new Set())
    setCheckedRealms(new Set())
    setDrawCount(1)
    setPendingDone(false)
    setLocalDestination(null)
    setDeclarations([])
    pendingSelfMovesRef.current = []
  }, [ctx.cardInstanceId])

  // Non-resolving player: nothing to show (they'll get a notification modal via events)
  if (!isMyResolution) {
    return null
  }

  // ── Post-Done: card destination picker ──────────────────────────────────
  if (pendingDone) {
    return (
      <div className={styles.overlay}>
        <div className={styles.panel}>
          <div className={styles.header}>
            <div className={styles.label}>Card Destination</div>
            <div className={styles.cardName}>{ctx.pendingCard.name}</div>
            <div className={styles.cardDesc}>Where should the card you played go?</div>
          </div>
          <div className={styles.destRow}>
            {(["discard", "abyss", "void", "in_play"] as const).map((dest) => (
              <button
                key={dest}
                className={
                  (localDestination ?? ctx.cardDestination) === dest
                    ? styles.destBtnActive
                    : styles.destBtn
                }
                onClick={() => setLocalDestination(dest)}
              >
                {DEST_LABELS[dest]}
              </button>
            ))}
          </div>
          <button
            className={styles.doneBtn}
            onClick={() => {
              const dest = localDestination ?? ctx.cardDestination
              const moves: Move[] = [...pendingSelfMovesRef.current]
              if (dest !== ctx.cardDestination) {
                moves.push({ type: "RESOLVE_SET_CARD_DESTINATION", destination: dest })
              }
              const allDecls = declarations.length > 0 ? declarations : undefined
              moves.push({ type: "RESOLVE_DONE", declarations: allDecls })
              onMove(moves.length === 1 ? moves[0]! : moves)
            }}
          >
            Confirm
          </button>
          <button className={styles.backLink} onClick={() => setPendingDone(false)}>
            &larr; Back to actions
          </button>
        </div>
      </div>
    )
  }

  // ── Main resolution panel ───────────────────────────────────────────────
  const effectiveCategory =
    selectedCategory ?? (availableCategories.length === 1 ? availableCategories[0]! : null)

  function handleCategoryChange(value: string) {
    setSelectedCategory(value === "" ? null : (value as ActionCategory))
  }

  function toggleCard(instanceId: string) {
    setCheckedCards((prev) => {
      const next = new Set(prev)
      if (next.has(instanceId)) next.delete(instanceId)
      else next.add(instanceId)
      return next
    })
  }

  function toggleRealm(key: string) {
    setCheckedRealms((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function isOpponent(playerId: string) {
    return playerId !== myPlayerId
  }

  /** Collect all checked items across all categories, split into self moves + opponent declarations */
  function collectAllChecked(): { selfMoves: Move[]; opponentDecls: ResolutionDeclarationInfo[] } {
    const selfMoves: Move[] = []
    const opponentDecls: ResolutionDeclarationInfo[] = []

    const allCardTargets = [
      ...targets.champions,
      ...targets.allies,
      ...targets.items,
      ...targets.holdings,
    ]
    for (const c of allCardTargets) {
      if (!checkedCards.has(c.instanceId)) continue
      if (isOpponent(c.playerId)) {
        opponentDecls.push({
          action: "discard_card",
          playerId: c.playerId,
          cardInstanceId: c.instanceId,
          cardName: c.name,
        })
      } else {
        selfMoves.push({
          type: "RESOLVE_MOVE_CARD",
          cardInstanceId: c.instanceId,
          destination: { zone: "discard", playerId: c.playerId },
        })
      }
    }

    for (const c of targets.discardChampions) {
      if (!checkedCards.has(c.instanceId)) continue
      if (isOpponent(c.playerId)) {
        opponentDecls.push({
          action: "return_to_pool",
          playerId: c.playerId,
          cardInstanceId: c.instanceId,
          cardName: c.name,
        })
      } else {
        selfMoves.push({ type: "RESOLVE_RETURN_TO_POOL", cardInstanceId: c.instanceId })
      }
    }

    for (const r of targets.unrazedRealms) {
      const key = `${r.playerId}-${r.slot}`
      if (!checkedRealms.has(key)) continue
      if (isOpponent(r.playerId)) {
        opponentDecls.push({
          action: "raze_realm",
          playerId: r.playerId,
          slot: r.slot,
          realmName: r.realmName,
        })
      } else {
        selfMoves.push({ type: "RESOLVE_RAZE_REALM", playerId: r.playerId, slot: r.slot })
      }
    }
    for (const r of targets.razedRealms) {
      const key = `${r.playerId}-${r.slot}`
      if (!checkedRealms.has(key)) continue
      if (isOpponent(r.playerId)) {
        opponentDecls.push({
          action: "rebuild_realm",
          playerId: r.playerId,
          slot: r.slot,
          realmName: r.realmName,
        })
      } else {
        selfMoves.push({ type: "RESOLVE_REBUILD_REALM", playerId: r.playerId, slot: r.slot })
      }
    }

    return { selfMoves, opponentDecls }
  }

  function handleDoneResolving() {
    const { selfMoves, opponentDecls } = collectAllChecked()
    const allDecls = [...declarations, ...opponentDecls]
    if (otherText.trim()) {
      allDecls.push({ action: "other", text: otherText.trim() })
    }
    setDeclarations(allDecls)
    pendingSelfMovesRef.current = selfMoves
    setPendingDone(true)
  }

  // ── Checkbox list renderer ──────────────────────────────────────────────

  function renderOwnerGroup<T extends { playerId: string }>(
    items: T[],
    label: string,
    renderItem: (item: T) => {
      key: string
      checked: boolean
      toggle: () => void
      label: React.ReactNode
    },
  ) {
    if (items.length === 0) return null
    return (
      <div>
        <div className={styles.playerGroupLabel}>{label}</div>
        {items.map((item) => {
          const r = renderItem(item)
          return (
            <label key={r.key} className={styles.checkboxRow}>
              <input type="checkbox" checked={r.checked} onChange={r.toggle} />
              <span>{r.label}</span>
            </label>
          )
        })}
      </div>
    )
  }

  function renderCheckboxList(cards: TargetCard[]) {
    const { theirs } = groupByOwner(cards, myPlayerId)
    const cardItem = (c: TargetCard) => ({
      key: c.instanceId,
      checked: checkedCards.has(c.instanceId),
      toggle: () => toggleCard(c.instanceId),
      label: (
        <>
          {c.name}
          {c.context && <span className={styles.cardContext}> {c.context}</span>}
        </>
      ),
    })
    return renderOwnerGroup(theirs, "Opponent's cards", cardItem)
  }

  function renderRealmCheckboxList(realms: RealmTarget[]) {
    const { theirs } = groupByOwner(realms, myPlayerId)
    const realmItem = (r: RealmTarget) => ({
      key: `${r.playerId}-${r.slot}`,
      checked: checkedRealms.has(`${r.playerId}-${r.slot}`),
      toggle: () => toggleRealm(`${r.playerId}-${r.slot}`),
      label: (
        <>
          {r.realmName} (slot {r.slot})
        </>
      ),
    })
    return renderOwnerGroup(theirs, "Opponent's realms", realmItem)
  }

  // ── Category content ────────────────────────────────────────────────────

  function renderCategoryContent() {
    if (!effectiveCategory) return null

    switch (effectiveCategory) {
      case "raze_realm":
        return renderRealmCheckboxList(targets.unrazedRealms)
      case "rebuild_realm":
        return renderRealmCheckboxList(targets.razedRealms)
      case "discard_champion":
        return renderCheckboxList(targets.champions)
      case "discard_ally":
        return renderCheckboxList(targets.allies)
      case "discard_item":
        return renderCheckboxList(targets.items)
      case "discard_holding":
        return renderCheckboxList(targets.holdings)
      case "draw_cards":
        return (
          <>
            {Object.keys(allBoards).map((pid) => (
              <div key={pid} className={styles.drawRow}>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={drawCount}
                  onChange={(e) => setDrawCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className={styles.drawInput}
                />
                <button
                  className={styles.actionBtn}
                  onClick={() => {
                    if (pid === myPlayerId) {
                      onMove({ type: "RESOLVE_DRAW_CARDS", playerId: pid, count: drawCount })
                    } else {
                      setDeclarations((prev) => [
                        ...prev,
                        { action: "draw_cards", playerId: pid, count: drawCount },
                      ])
                    }
                  }}
                >
                  {pid === myPlayerId ? "Draw for me" : "Declare draw for opponent"}
                </button>
              </div>
            ))}
          </>
        )
      case "return_to_play":
        return renderCheckboxList(targets.discardChampions)
      case "other":
        return (
          <div>
            <div className={styles.cardDesc} style={{ fontSize: "12px", color: "#b0a080", marginBottom: 6 }}>
              Describe what should happen. Your opponent will see this in the notification.
            </div>
            <textarea
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              placeholder="e.g. Discard 2 cards from hand..."
              rows={2}
              style={{
                width: "100%",
                background: "#1a1410",
                color: "#eadfcb",
                border: "1px solid #845a4f",
                borderRadius: 4,
                padding: "6px 8px",
                fontSize: 12,
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
          </div>
        )
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.label}>Resolving Effect</div>
          <div className={styles.cardName}>{ctx.pendingCard.name}</div>
          {ctx.pendingCard.description && (
            <div className={styles.cardDesc}>{ctx.pendingCard.description}</div>
          )}
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>Action:</div>
          <select
            className={styles.categorySelect}
            value={effectiveCategory ?? ""}
            onChange={(e) => handleCategoryChange(e.target.value)}
          >
            {availableCategories.length > 1 && <option value="">Select action...</option>}
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>

        {effectiveCategory && (
          <div className={styles.section}>{renderCategoryContent()}</div>
        )}

        <button className={styles.doneBtn} onClick={handleDoneResolving}>
          Done Resolving
        </button>
      </div>
    </div>
  )
}
