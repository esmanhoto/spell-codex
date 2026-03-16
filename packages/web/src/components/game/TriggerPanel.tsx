import { useState, useEffect } from "react"
import type { Move, PendingTriggerInfo, PlayerBoard, CardInfo } from "../../api.ts"
import { CardTooltip } from "./CardTooltip.tsx"
import { cardImageUrl } from "../../utils/card-helpers.ts"
import styles from "./ResolutionPanel.module.css"
import triggerStyles from "./TriggerPanel.module.css"

type ActionType = "peek_draw_pile" | "peek_hand" | "discard_hand" | "other"

export function TriggerPanel({
  trigger,
  allBoards,
  myPlayerId,
  onMove,
}: {
  trigger: PendingTriggerInfo
  allBoards: Record<string, PlayerBoard>
  myPlayerId: string
  onMove: (m: Move) => void
}) {
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null)
  const [peekCount, setPeekCount] = useState(1)
  const [waitingDismissed, setWaitingDismissed] = useState(false)

  const isMyTrigger = trigger.owningPlayerId === myPlayerId
  const playerIds = Object.keys(allBoards)
  const opponents = playerIds.filter((id) => id !== myPlayerId)

  // Find source card info
  const board = allBoards[trigger.owningPlayerId]
  const sourceCard: CardInfo | null =
    board?.pool.find((e) => e.champion.instanceId === trigger.sourceCardInstanceId)?.champion ??
    board?.pool
      .flatMap((e) => e.attachments)
      .find((a) => a.instanceId === trigger.sourceCardInstanceId) ??
    Object.values(board?.formation ?? {})
      .flatMap((s) => (s ? [s.realm, ...s.holdings] : []))
      .find((c) => c.instanceId === trigger.sourceCardInstanceId) ??
    board?.lastingEffects.find((c) => c.instanceId === trigger.sourceCardInstanceId) ??
    null

  const timing = trigger.effect.timing === "start" ? "Start of Turn" : "End of Turn"
  const peek = trigger.peekContext

  // Reset action when trigger changes
  useEffect(() => {
    setSelectedAction(null)
    setPeekCount(1)
  }, [trigger.id])

  // ── Waiting view (non-owning player) ──────────────────────────────────────
  if (!isMyTrigger) {
    if (waitingDismissed) return null
    return (
      <div className={styles.overlayModal}>
        <div className={styles.panelModal}>
          <div className={styles.header}>
            <div className={styles.label}>{timing} Trigger</div>
            {sourceCard && <div className={styles.cardName}>{sourceCard.name}</div>}
            {sourceCard?.description && (
              <div className={styles.cardDesc}>{sourceCard.description}</div>
            )}
          </div>
          <div className={styles.sectionLabel}>Waiting for opponent to resolve...</div>
          <button className={styles.okBtn} onClick={() => setWaitingDismissed(true)}>
            Ok
          </button>
        </div>
      </div>
    )
  }

  // ── Peek results view ────────────────────────────────────────────────────
  if (peek) {
    const isPilePeek = peek.source === "draw_pile"
    return (
      <div className={styles.overlayModal}>
        <div className={styles.panel}>
          <div className={styles.header}>
            <div className={styles.label}>{timing} Trigger</div>
            {sourceCard && <div className={styles.cardName}>{sourceCard.name}</div>}
            {sourceCard?.description && (
              <div className={styles.cardDesc}>{sourceCard.description}</div>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionLabel}>
              {isPilePeek
                ? "If allowed by your card, select a card to discard:"
                : `Opponent's hand (${peek.cards.length} card${peek.cards.length !== 1 ? "s" : ""}):`}
            </div>
            {peek.cards.length === 0 ? (
              <div className={styles.cardContext}>No cards to show.</div>
            ) : (
              <div className={triggerStyles.peekGrid}>
                {peek.cards.map((c) => (
                  <div key={c.instanceId} className={triggerStyles.peekCardCell}>
                    <CardTooltip card={c}>
                      <img
                        src={cardImageUrl(c.setId, c.cardNumber)}
                        alt={c.name}
                        className={triggerStyles.peekCardImg}
                      />
                    </CardTooltip>
                    <span className={triggerStyles.peekCardName}>{c.name}</span>
                    {isPilePeek && (
                      <button
                        className={styles.actionBtn}
                        style={{ padding: "2px 8px", fontSize: "11px" }}
                        onClick={() =>
                          onMove({
                            type: "RESOLVE_TRIGGER_DISCARD_PEEKED",
                            cardInstanceId: c.instanceId,
                          })
                        }
                      >
                        Discard
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            className={styles.doneBtn}
            onClick={() => onMove({ type: "RESOLVE_TRIGGER_DONE" })}
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  // ── Tool selection view ───────────────────────────────────────────────────
  return (
    <div className={styles.overlayModal}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.label}>{timing} Trigger</div>
          {sourceCard && <div className={styles.cardName}>{sourceCard.name}</div>}
          {sourceCard?.description && (
            <div className={styles.cardDesc}>{sourceCard.description}</div>
          )}
        </div>

        <div className={styles.section}>
          <select
            className={styles.categorySelect}
            value={selectedAction ?? ""}
            onChange={(e) => setSelectedAction((e.target.value as ActionType) || null)}
          >
            <option value="">— Select action —</option>
            <option value="peek_draw_pile">Peek Draw Pile</option>
            <option value="peek_hand">Peek Opponent's Hand</option>
            <option value="discard_hand">Discard from Opponent's Hand</option>
            <option value="other">Other effects (manual)</option>
          </select>
        </div>

        {selectedAction === "peek_draw_pile" && (
          <div className={styles.section}>
            <div className={styles.drawRow}>
              <span className={styles.sectionLabel}>Cards to peek:</span>
              <input
                className={styles.drawInput}
                type="number"
                min={1}
                value={peekCount}
                onChange={(e) => setPeekCount(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <div className={styles.actionGrid}>
              {opponents.map((pid) => (
                <button
                  key={pid}
                  className={styles.applyBtn}
                  onClick={() =>
                    onMove({
                      type: "RESOLVE_TRIGGER_PEEK",
                      source: "draw_pile",
                      targetPlayerId: pid,
                      count: peekCount,
                    })
                  }
                >
                  Peek opponent's draw pile
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedAction === "peek_hand" && (
          <div className={styles.section}>
            <div className={styles.actionGrid}>
              {opponents.map((pid) => (
                <button
                  key={pid}
                  className={styles.applyBtn}
                  onClick={() =>
                    onMove({ type: "RESOLVE_TRIGGER_PEEK", source: "hand", targetPlayerId: pid })
                  }
                >
                  Peek opponent's hand
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedAction === "discard_hand" && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>
              A random card from opponent's hand will be discarded.
            </div>
            <div className={styles.actionGrid}>
              {opponents.map((pid) => (
                <button
                  key={pid}
                  className={styles.applyBtn}
                  onClick={() =>
                    onMove({ type: "RESOLVE_TRIGGER_DISCARD_FROM_HAND", targetPlayerId: pid })
                  }
                >
                  Discard random card from opponent's hand
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedAction === "other" && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Manual resolution</div>
            <div className={styles.cardDesc} style={{ fontSize: "12px", color: "#b0a080" }}>
              Use the existing game actions to handle this effect yourself — right-click menus,
              discard cards, return from discard pile, etc. Coordinate with your opponent via chat.
              {trigger.effect.timing === "end" && (
                <>
                  {" "}
                  Click Done to dismiss this overlay; you will still be in Phase 5 and can continue
                  acting before ending your turn.
                </>
              )}
            </div>
          </div>
        )}

        <button className={styles.doneBtn} onClick={() => onMove({ type: "RESOLVE_TRIGGER_DONE" })}>
          Done
        </button>
      </div>
    </div>
  )
}
