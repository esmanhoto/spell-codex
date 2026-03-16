import { useState, useEffect, useMemo } from "react"
import type { Move, ResolutionContextInfo, PlayerBoard, CardInfo } from "../../api.ts"
import { cardImageUrl } from "../../utils/card-helpers.ts"
import { CardTooltip } from "./CardTooltip.tsx"
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
  other: "Other / Manual Effect",
}

// Card type IDs
const CHAMPION_TYPE_IDS = new Set([5, 7, 10, 12, 14, 16, 20])
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
  counterOptions,
  onMove,
}: {
  ctx: ResolutionContextInfo
  allBoards: Record<string, PlayerBoard>
  myPlayerId: string
  /** Counter cards available to use (hand + pool), derived from legalMoves in Game.tsx */
  counterOptions?: Array<{ card: CardInfo; move: Move }>
  onMove: (m: Move | Move[]) => void
}) {
  const [selectedCategory, setSelectedCategory] = useState<ActionCategory | null>(null)
  const [checkedCards, setCheckedCards] = useState<Set<string>>(new Set())
  const [checkedRealms, setCheckedRealms] = useState<Set<string>>(new Set())
  const [drawCount, setDrawCount] = useState(1)
  const [waitingDismissed, setWaitingDismissed] = useState(false)
  const [pendingDone, setPendingDone] = useState(false)
  const [localDestination, setLocalDestination] = useState<string | null>(null)
  const [selectedCounterIdx, setSelectedCounterIdx] = useState(0)
  const isMyResolution = ctx.resolvingPlayer === myPlayerId
  const targets = useMemo(() => collectTargets(allBoards), [allBoards])
  const availableCategories = getAvailableCategories(targets)

  useEffect(() => {
    setSelectedCategory(null)
    setCheckedCards(new Set())
    setCheckedRealms(new Set())
    setDrawCount(1)
    setWaitingDismissed(false)
    setPendingDone(false)
    setLocalDestination(null)
    setSelectedCounterIdx(0)
  }, [ctx.cardInstanceId])

  // Waiting view for non-resolving player
  if (!isMyResolution) {
    if (waitingDismissed) return null
    const hasCounterWindow = ctx.counterWindowOpen && (counterOptions?.length ?? 0) > 0
    const selectedCounter = counterOptions?.[selectedCounterIdx] ?? counterOptions?.[0]
    return (
      <div className={styles.overlayModal}>
        <div className={styles.panelModal}>
          <div className={styles.header}>
            <div className={styles.label}>Resolving Effect</div>
            <div className={styles.cardName}>{ctx.pendingCard.name}</div>
            {ctx.pendingCard.description && (
              <div className={styles.cardDesc}>{ctx.pendingCard.description}</div>
            )}
          </div>
          <img
            src={cardImageUrl(ctx.pendingCard.setId, ctx.pendingCard.cardNumber)}
            alt={ctx.pendingCard.name}
            className={styles.cardImgSmall}
          />
          {hasCounterWindow && counterOptions && (
            <div className={styles.counterSection}>
              <div className={styles.counterLabel}>You MAY be able to counter with:</div>
              {counterOptions.map((opt, i) => (
                <CardTooltip key={i} card={opt.card}>
                  <div
                    className={
                      i === selectedCounterIdx
                        ? styles.counterCardNameSelected
                        : styles.counterCardName
                    }
                    onClick={() => setSelectedCounterIdx(i)}
                  >
                    {opt.card.name}
                  </div>
                </CardTooltip>
              ))}
            </div>
          )}
          <div className={styles.counterActions}>
            {hasCounterWindow ? (
              <>
                <button
                  className={styles.counterBtn}
                  onClick={() => selectedCounter && onMove(selectedCounter.move)}
                >
                  Counter
                </button>
                <button
                  className={styles.allowBtn}
                  onClick={() => onMove({ type: "PASS_COUNTER" })}
                >
                  Allow
                </button>
              </>
            ) : ctx.counterWindowOpen ? (
              // Counter window open but no usable cards — must allow
              <button className={styles.allowBtn} onClick={() => onMove({ type: "PASS_COUNTER" })}>
                Allow
              </button>
            ) : (
              <button className={styles.okBtn} onClick={() => setWaitingDismissed(true)}>
                Ok
              </button>
            )}
          </div>
        </div>
      </div>
    )
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
              const moves: Move[] = []
              if (dest !== ctx.cardDestination) {
                moves.push({ type: "RESOLVE_SET_CARD_DESTINATION", destination: dest })
              }
              moves.push({ type: "RESOLVE_DONE" })
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
    setCheckedCards(new Set())
    setCheckedRealms(new Set())
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

  // ── Apply handlers ──────────────────────────────────────────────────────

  function applyMoveCards(cards: TargetCard[]) {
    const moves: Move[] = cards
      .filter((c) => checkedCards.has(c.instanceId))
      .map((c) => ({
        type: "RESOLVE_MOVE_CARD" as const,
        cardInstanceId: c.instanceId,
        destination: { zone: "discard", playerId: c.playerId },
      }))
    if (moves.length > 0) onMove(moves)
    setCheckedCards(new Set())
  }

  function applyRaze() {
    const moves: Move[] = targets.unrazedRealms
      .filter((r) => checkedRealms.has(`${r.playerId}-${r.slot}`))
      .map((r) => ({ type: "RESOLVE_RAZE_REALM" as const, playerId: r.playerId, slot: r.slot }))
    if (moves.length > 0) onMove(moves)
    setCheckedRealms(new Set())
  }

  function applyRebuild() {
    const moves: Move[] = targets.razedRealms
      .filter((r) => checkedRealms.has(`${r.playerId}-${r.slot}`))
      .map((r) => ({ type: "RESOLVE_REBUILD_REALM" as const, playerId: r.playerId, slot: r.slot }))
    if (moves.length > 0) onMove(moves)
    setCheckedRealms(new Set())
  }

  function applyReturnToPool() {
    const moves: Move[] = targets.discardChampions
      .filter((c) => checkedCards.has(c.instanceId))
      .map((c) => ({ type: "RESOLVE_RETURN_TO_POOL" as const, cardInstanceId: c.instanceId }))
    if (moves.length > 0) onMove(moves)
    setCheckedCards(new Set())
  }

  // ── Checkbox list renderer ──────────────────────────────────────────────

  function renderCheckboxList(cards: TargetCard[]) {
    const { mine, theirs } = groupByOwner(cards, myPlayerId)
    return (
      <>
        {mine.length > 0 && (
          <div>
            <div className={styles.playerGroupLabel}>Your cards</div>
            {mine.map((c) => (
              <label key={c.instanceId} className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={checkedCards.has(c.instanceId)}
                  onChange={() => toggleCard(c.instanceId)}
                />
                <span>
                  {c.name}
                  {c.context && <span className={styles.cardContext}> {c.context}</span>}
                </span>
              </label>
            ))}
          </div>
        )}
        {theirs.length > 0 && (
          <div>
            <div className={styles.playerGroupLabel}>Opponent's cards</div>
            {theirs.map((c) => (
              <label key={c.instanceId} className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={checkedCards.has(c.instanceId)}
                  onChange={() => toggleCard(c.instanceId)}
                />
                <span>
                  {c.name}
                  {c.context && <span className={styles.cardContext}> {c.context}</span>}
                </span>
              </label>
            ))}
          </div>
        )}
      </>
    )
  }

  function renderRealmCheckboxList(realms: RealmTarget[]) {
    const { mine, theirs } = groupByOwner(realms, myPlayerId)
    return (
      <>
        {mine.length > 0 && (
          <div>
            <div className={styles.playerGroupLabel}>Your realms</div>
            {mine.map((r) => {
              const key = `${r.playerId}-${r.slot}`
              return (
                <label key={key} className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={checkedRealms.has(key)}
                    onChange={() => toggleRealm(key)}
                  />
                  <span>
                    {r.realmName} (slot {r.slot})
                  </span>
                </label>
              )
            })}
          </div>
        )}
        {theirs.length > 0 && (
          <div>
            <div className={styles.playerGroupLabel}>Opponent's realms</div>
            {theirs.map((r) => {
              const key = `${r.playerId}-${r.slot}`
              return (
                <label key={key} className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={checkedRealms.has(key)}
                    onChange={() => toggleRealm(key)}
                  />
                  <span>
                    {r.realmName} (slot {r.slot})
                  </span>
                </label>
              )
            })}
          </div>
        )}
      </>
    )
  }

  // ── Category content ────────────────────────────────────────────────────

  function renderCategoryContent() {
    if (!effectiveCategory) return null

    switch (effectiveCategory) {
      case "raze_realm":
        return (
          <>
            {renderRealmCheckboxList(targets.unrazedRealms)}
            <button
              className={styles.applyBtn}
              disabled={checkedRealms.size === 0}
              onClick={applyRaze}
            >
              Apply Effect
            </button>
          </>
        )

      case "rebuild_realm":
        return (
          <>
            {renderRealmCheckboxList(targets.razedRealms)}
            <button
              className={styles.applyBtn}
              disabled={checkedRealms.size === 0}
              onClick={applyRebuild}
            >
              Apply Effect
            </button>
          </>
        )

      case "discard_champion":
        return (
          <>
            {renderCheckboxList(targets.champions)}
            <button
              className={styles.applyBtn}
              disabled={checkedCards.size === 0}
              onClick={() => applyMoveCards(targets.champions)}
            >
              Apply Effect
            </button>
          </>
        )

      case "discard_ally":
        return (
          <>
            {renderCheckboxList(targets.allies)}
            <button
              className={styles.applyBtn}
              disabled={checkedCards.size === 0}
              onClick={() => applyMoveCards(targets.allies)}
            >
              Apply Effect
            </button>
          </>
        )

      case "discard_item":
        return (
          <>
            {renderCheckboxList(targets.items)}
            <button
              className={styles.applyBtn}
              disabled={checkedCards.size === 0}
              onClick={() => applyMoveCards(targets.items)}
            >
              Apply Effect
            </button>
          </>
        )

      case "discard_holding":
        return (
          <>
            {renderCheckboxList(targets.holdings)}
            <button
              className={styles.applyBtn}
              disabled={checkedCards.size === 0}
              onClick={() => applyMoveCards(targets.holdings)}
            >
              Apply Effect
            </button>
          </>
        )

      case "draw_cards":
        return (
          <>
            {Object.keys(allBoards).map((playerId) => (
              <div key={playerId} className={styles.drawRow}>
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
                  onClick={() => onMove({ type: "RESOLVE_DRAW_CARDS", playerId, count: drawCount })}
                >
                  {playerId === myPlayerId ? "Draw for me" : "Draw for opponent"}
                </button>
              </div>
            ))}
          </>
        )

      case "return_to_play":
        return (
          <>
            {renderCheckboxList(targets.discardChampions)}
            <button
              className={styles.applyBtn}
              disabled={checkedCards.size === 0}
              onClick={applyReturnToPool}
            >
              Apply Effect
            </button>
          </>
        )

      case "other":
        return (
          <div className={styles.cardDesc} style={{ fontSize: "12px", color: "#b0a080" }}>
            Use right-click menus and game board actions to apply this effect manually. Coordinate
            with your opponent via chat if needed. Click &ldquo;Done Resolving&rdquo; when finished.
          </div>
        )
    }
  }

  const counterBlocked = ctx.counterWindowOpen

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        {/* Card being resolved */}
        <div className={styles.header}>
          <div className={styles.label}>Resolving Effect</div>
          <div className={styles.cardName}>{ctx.pendingCard.name}</div>
          {ctx.pendingCard.description && (
            <div className={styles.cardDesc}>{ctx.pendingCard.description}</div>
          )}
        </div>

        {/* Counter window waiting indicator */}
        {counterBlocked && (
          <div className={styles.counterWaitBanner}>Waiting for opponent&hellip;</div>
        )}

        {/* Action category selector */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Action:</div>
          <select
            className={styles.categorySelect}
            value={effectiveCategory ?? ""}
            onChange={(e) => handleCategoryChange(e.target.value)}
            disabled={counterBlocked}
          >
            {availableCategories.length > 1 && <option value="">Select action...</option>}
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>

        {/* Dynamic content */}
        {effectiveCategory && !counterBlocked && (
          <div className={styles.section}>{renderCategoryContent()}</div>
        )}

        {/* Done → goes to card destination step */}
        <button
          className={styles.doneBtn}
          disabled={counterBlocked}
          onClick={() => setPendingDone(true)}
        >
          Done Resolving
        </button>
      </div>
    </div>
  )
}
