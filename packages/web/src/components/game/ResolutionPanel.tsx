import { useState } from "react"
import type { Move, ResolutionContextInfo, PlayerBoard } from "../../api.ts"
import { cardImageUrl } from "../../utils/card-helpers.ts"
import styles from "./ResolutionPanel.module.css"

const DEST_LABELS: Record<string, string> = {
  discard: "Discard",
  abyss: "Abyss",
  void: "Void",
  in_play: "Keep in Play",
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
  const [drawCount, setDrawCount] = useState(1)
  const isMyResolution = ctx.resolvingPlayer === myPlayerId

  // Collect all unrazed realms for "Raze realm" section
  const unrazedRealms: { playerId: string; slot: string; realmName: string }[] = []
  for (const [playerId, board] of Object.entries(allBoards)) {
    for (const [slot, slotState] of Object.entries(board.formation)) {
      if (slotState && !slotState.isRazed) {
        unrazedRealms.push({ playerId, slot, realmName: slotState.realm.name })
      }
    }
  }

  // Collect pool champions for "Move card" section
  const poolChampions: { playerId: string; championId: string; championName: string }[] = []
  for (const [playerId, board] of Object.entries(allBoards)) {
    for (const entry of board.pool) {
      poolChampions.push({
        playerId,
        championId: entry.champion.instanceId,
        championName: entry.champion.name,
      })
    }
  }

  if (!isMyResolution) {
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
          <img
            src={cardImageUrl(ctx.pendingCard.setId, ctx.pendingCard.cardNumber)}
            alt={ctx.pendingCard.name}
            style={{ width: "100%", borderRadius: 4, objectFit: "contain" }}
          />
          <div className={styles.sectionLabel}>Waiting for opponent to resolve…</div>
        </div>
      </div>
    )
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
                onClick={() => onMove({ type: "RESOLVE_SET_CARD_DESTINATION", destination: dest })}
              >
                {DEST_LABELS[dest]}
              </button>
            ))}
          </div>
        </div>

        {/* Raze realm */}
        {unrazedRealms.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Raze a realm:</div>
            <div className={styles.actionGrid}>
              {unrazedRealms.map(({ playerId, slot, realmName }) => (
                <button
                  key={`${playerId}-${slot}`}
                  className={styles.actionBtn}
                  onClick={() => onMove({ type: "RESOLVE_RAZE_REALM", playerId, slot })}
                >
                  {realmName} (slot {slot})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Move pool champion */}
        {poolChampions.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Move champion to discard:</div>
            <div className={styles.actionGrid}>
              {poolChampions.map(({ playerId, championId, championName }) => (
                <button
                  key={championId}
                  className={styles.actionBtn}
                  onClick={() =>
                    onMove({
                      type: "RESOLVE_MOVE_CARD",
                      cardInstanceId: championId,
                      destination: { zone: "discard", playerId },
                    })
                  }
                >
                  {championName}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Move pool champion to limbo */}
        {poolChampions.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Send champion to limbo (returns next turn):</div>
            <div className={styles.actionGrid}>
              {poolChampions.map(({ playerId, championId, championName }) => (
                <button
                  key={`limbo-${championId}`}
                  className={styles.actionBtn}
                  onClick={() => {
                    // We can't read currentTurn here directly, so we'll use a sentinel that
                    // gets validated server-side. The legal moves enumerate returnsOnTurn+1.
                    onMove({
                      type: "RESOLVE_MOVE_CARD",
                      cardInstanceId: championId,
                      destination: { zone: "limbo", playerId, returnsOnTurn: 0 },
                    })
                  }}
                >
                  {championName}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Draw cards */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Draw cards:</div>
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
        </div>

        {/* Done */}
        <button className={styles.doneBtn} onClick={() => onMove({ type: "RESOLVE_DONE" })}>
          Done Resolving
        </button>
      </div>
    </div>
  )
}
