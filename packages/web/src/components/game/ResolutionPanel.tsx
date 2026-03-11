import { useState, useEffect } from "react"
import type { Move, ResolutionContextInfo, PlayerBoard } from "../../api.ts"
import { cardImageUrl } from "../../utils/card-helpers.ts"
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

const CATEGORY_LABELS: Record<ActionCategory, string> = {
  raze_realm: "Raze a Realm",
  rebuild_realm: "Rebuild a Realm",
  discard_champion: "Discard/Remove a Champion",
  discard_ally: "Discard/Remove an Ally",
  discard_item: "Discard/Remove Magical Item",
  discard_holding: "Discard/Remove a Holding",
  draw_cards: "Draw Cards",
  return_to_play: "Return Champion to Pool",
}

// Card type IDs
const CHAMPION_TYPE_IDS = new Set([5, 7, 10, 12, 14, 16, 20])
const ALLY_TYPE_ID = 1
const MAGICAL_ITEM_TYPE_ID = 9
const ARTIFACT_TYPE_ID = 2
const HOLDING_TYPE_ID = 8

interface TargetCard {
  instanceId: string
  name: string
  playerId: string
  context: string // e.g. "attached to Elminster", "on Waterdeep"
}

function collectTargets(allBoards: Record<string, PlayerBoard>, myPlayerId: string) {
  const unrazedRealms: { playerId: string; slot: string; realmName: string }[] = []
  const razedRealms: { playerId: string; slot: string; realmName: string }[] = []
  const champions: TargetCard[] = []
  const allies: TargetCard[] = []
  const items: TargetCard[] = []
  const holdings: TargetCard[] = []
  const discardChampions: TargetCard[] = []

  for (const [playerId, board] of Object.entries(allBoards)) {
    // Formation
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

    // Pool
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
              : items // fallback to items for unknown attachment types
        target.push({
          instanceId: att.instanceId,
          name: att.name,
          playerId,
          context: `on ${entry.champion.name}`,
        })
      }
    }

    // Discard pile champions
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

function getAvailableCategories(
  targets: ReturnType<typeof collectTargets>,
): ActionCategory[] {
  const cats: ActionCategory[] = []
  if (targets.unrazedRealms.length > 0) cats.push("raze_realm")
  if (targets.razedRealms.length > 0) cats.push("rebuild_realm")
  if (targets.champions.length > 0) cats.push("discard_champion")
  if (targets.allies.length > 0) cats.push("discard_ally")
  if (targets.items.length > 0) cats.push("discard_item")
  if (targets.holdings.length > 0) cats.push("discard_holding")
  cats.push("draw_cards") // always available
  if (targets.discardChampions.length > 0) cats.push("return_to_play")
  return cats
}

function groupByOwner(cards: TargetCard[], myPlayerId: string) {
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
  onMove: (m: Move) => void
}) {
  const [selectedCategory, setSelectedCategory] = useState<ActionCategory | null>(null)
  const [selectedCard, setSelectedCard] = useState<string | null>(null)
  const [selectedCardOwner, setSelectedCardOwner] = useState<string | null>(null)
  const [drawCount, setDrawCount] = useState(1)
  const [waitingDismissed, setWaitingDismissed] = useState(false)
  const isMyResolution = ctx.resolvingPlayer === myPlayerId

  // Reset state when resolution context changes
  useEffect(() => {
    setSelectedCategory(null)
    setSelectedCard(null)
    setSelectedCardOwner(null)
    setDrawCount(1)
    setWaitingDismissed(false)
  }, [ctx.cardInstanceId])

  // Waiting view for non-resolving player
  if (!isMyResolution) {
    if (waitingDismissed) return null
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
          <div className={styles.sectionLabel}>Waiting for opponent to resolve...</div>
          <button className={styles.okBtn} onClick={() => setWaitingDismissed(true)}>
            Ok
          </button>
        </div>
      </div>
    )
  }

  const targets = collectTargets(allBoards, myPlayerId)
  const availableCategories = getAvailableCategories(targets)

  // Auto-select if only one category
  const effectiveCategory =
    selectedCategory ?? (availableCategories.length === 1 ? availableCategories[0]! : null)

  function handleCategoryChange(value: string) {
    setSelectedCategory(value === "" ? null : (value as ActionCategory))
    setSelectedCard(null)
    setSelectedCardOwner(null)
  }

  function selectCard(instanceId: string, playerId: string) {
    setSelectedCard(instanceId)
    setSelectedCardOwner(playerId)
  }

  function goBack() {
    setSelectedCard(null)
    setSelectedCardOwner(null)
  }

  function fireMoveCard(destination: "discard" | "abyss" | "limbo") {
    if (!selectedCard || !selectedCardOwner) return
    const dest =
      destination === "limbo"
        ? { zone: "limbo" as const, playerId: selectedCardOwner, returnsOnTurn: 0 }
        : { zone: destination, playerId: selectedCardOwner }
    onMove({ type: "RESOLVE_MOVE_CARD", cardInstanceId: selectedCard, destination: dest })
    setSelectedCard(null)
    setSelectedCardOwner(null)
  }

  // Render target list grouped by owner, with optional "step 2" dest picker
  function renderCardTargets(cards: TargetCard[], showLimbo: boolean) {
    if (selectedCard) {
      const card = cards.find((c) => c.instanceId === selectedCard)
      if (!card) return null
      return (
        <div className={styles.subStep}>
          <div className={styles.sectionLabel}>
            {card.name} {card.context && <span className={styles.cardContext}>{card.context}</span>}
          </div>
          <div className={styles.destRow}>
            <button className={styles.actionBtn} onClick={() => fireMoveCard("discard")}>
              Discard
            </button>
            <button className={styles.actionBtn} onClick={() => fireMoveCard("abyss")}>
              Abyss
            </button>
            {showLimbo && (
              <button className={styles.actionBtn} onClick={() => fireMoveCard("limbo")}>
                Limbo
              </button>
            )}
          </div>
          <button className={styles.backLink} onClick={goBack}>
            &larr; Back
          </button>
        </div>
      )
    }

    const { mine, theirs } = groupByOwner(cards, myPlayerId)
    return (
      <>
        {mine.length > 0 && (
          <div>
            <div className={styles.playerGroupLabel}>Your cards</div>
            <div className={styles.actionGrid}>
              {mine.map((c) => (
                <button
                  key={c.instanceId}
                  className={styles.actionBtn}
                  onClick={() => selectCard(c.instanceId, c.playerId)}
                >
                  {c.name}
                  {c.context && <span className={styles.cardContext}> {c.context}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        {theirs.length > 0 && (
          <div>
            <div className={styles.playerGroupLabel}>Opponent's cards</div>
            <div className={styles.actionGrid}>
              {theirs.map((c) => (
                <button
                  key={c.instanceId}
                  className={styles.actionBtn}
                  onClick={() => selectCard(c.instanceId, c.playerId)}
                >
                  {c.name}
                  {c.context && <span className={styles.cardContext}> {c.context}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </>
    )
  }

  function renderCategoryContent() {
    if (!effectiveCategory) return null

    switch (effectiveCategory) {
      case "raze_realm":
        return (
          <div className={styles.actionGrid}>
            {targets.unrazedRealms.map(({ playerId, slot, realmName }) => (
              <button
                key={`${playerId}-${slot}`}
                className={styles.actionBtn}
                onClick={() => onMove({ type: "RESOLVE_RAZE_REALM", playerId, slot })}
              >
                {realmName} (slot {slot})
              </button>
            ))}
          </div>
        )

      case "rebuild_realm":
        return (
          <div className={styles.actionGrid}>
            {targets.razedRealms.map(({ playerId, slot, realmName }) => (
              <button
                key={`${playerId}-${slot}`}
                className={styles.actionBtn}
                onClick={() => onMove({ type: "RESOLVE_REBUILD_REALM", playerId, slot })}
              >
                {realmName} (slot {slot})
              </button>
            ))}
          </div>
        )

      case "discard_champion":
        return renderCardTargets(targets.champions, true)

      case "discard_ally":
        return renderCardTargets(targets.allies, false)

      case "discard_item":
        return renderCardTargets(targets.items, false)

      case "discard_holding":
        return renderCardTargets(targets.holdings, false)

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
                  onChange={(e) =>
                    setDrawCount(Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                  className={styles.drawInput}
                />
                <button
                  className={styles.actionBtn}
                  onClick={() =>
                    onMove({ type: "RESOLVE_DRAW_CARDS", playerId, count: drawCount })
                  }
                >
                  {playerId === myPlayerId ? "Draw for me" : "Draw for opponent"}
                </button>
              </div>
            ))}
          </>
        )

      case "return_to_play":
        return (
          <div className={styles.actionGrid}>
            {targets.discardChampions.map((c) => (
              <button
                key={c.instanceId}
                className={styles.actionBtn}
                onClick={() =>
                  onMove({ type: "RESOLVE_RETURN_TO_POOL", cardInstanceId: c.instanceId })
                }
              >
                {c.name}
              </button>
            ))}
          </div>
        )
    }
  }

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

        {/* Destination choice */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Card destination:</div>
          <div className={styles.destRow}>
            {(["discard", "abyss", "void", "in_play"] as const).map((dest) => (
              <button
                key={dest}
                className={dest === ctx.cardDestination ? styles.destBtnActive : styles.destBtn}
                onClick={() =>
                  onMove({ type: "RESOLVE_SET_CARD_DESTINATION", destination: dest })
                }
              >
                {DEST_LABELS[dest]}
              </button>
            ))}
          </div>
        </div>

        {/* Action category selector */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Action:</div>
          <select
            className={styles.categorySelect}
            value={effectiveCategory ?? ""}
            onChange={(e) => handleCategoryChange(e.target.value)}
          >
            {availableCategories.length > 1 && (
              <option value="">Select action...</option>
            )}
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>

        {/* Dynamic content */}
        {effectiveCategory && (
          <div className={styles.section}>{renderCategoryContent()}</div>
        )}

        {/* Done */}
        <button className={styles.doneBtn} onClick={() => onMove({ type: "RESOLVE_DONE" })}>
          Done Resolving
        </button>
      </div>
    </div>
  )
}
