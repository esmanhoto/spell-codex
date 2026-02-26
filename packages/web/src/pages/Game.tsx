import React, { useState, useRef } from "react"
import { useParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getGameState, submitMove } from "../api.ts"
import type { GameState, Move, CardInfo, PlayerBoard, SlotState, PoolEntry, PendingEffect } from "../api.ts"

// ─── DnD context ──────────────────────────────────────────────────────────────

interface DnDCtxType {
  legalMoves: Move[]
  onMove:     (m: Move) => void
}
const DndCtx = React.createContext<DnDCtxType>({ legalMoves: [], onMove: () => {} })

// ─── Card image ───────────────────────────────────────────────────────────────

function cardImageUrl(setId: string, cardNumber: number) {
  return `/api/cards/${setId}/${cardNumber}.jpg`
}

// ─── Deck pile widget ─────────────────────────────────────────────────────────

function DeckPile({ count }: { count: number }) {
  return (
    <div className="deck-pile" title={`${count} cards in draw pile`}>
      <div className="deck-pile-card" />
      <div className="deck-pile-card" />
      <div className="deck-pile-card" />
      <div className="deck-pile-count">{count}</div>
    </div>
  )
}

// ─── Does a move reference a given instanceId? ────────────────────────────────

function moveInvolves(m: Move, id: string): boolean {
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
      return (m as { cardInstanceId: string; championId: string }).cardInstanceId === id ||
             (m as { cardInstanceId: string; championId: string }).championId === id
    case "DECLARE_ATTACK":
    case "DECLARE_DEFENSE":
    case "CONTINUE_ATTACK":
      return (m as { championId: string }).championId === id
    default:
      return false
  }
}

// ─── Game page ────────────────────────────────────────────────────────────────

export function Game() {
  const { id: gameId } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const playerA = sessionStorage.getItem(`game:${gameId}:playerA`) ?? ""
  const playerB = sessionStorage.getItem(`game:${gameId}:playerB`) ?? ""

  const { data, error, isLoading } = useQuery<GameState>({
    queryKey:        ["game", gameId],
    queryFn:         () => getGameState(gameId!, playerA),
    refetchInterval: 3000,
    enabled:         !!gameId,
  })

  const moveMutation = useMutation({
    mutationFn: (m: Move) => {
      const asUser = data?.activePlayer === playerA ? playerA : playerB
      return submitMove(gameId!, asUser, m)
    },
    onSuccess: () => {
      setSelectedId(null)
      qc.invalidateQueries({ queryKey: ["game", gameId] })
    },
  })

  if (isLoading) return <div className="page"><p>Loading…</p></div>
  if (error)     return <div className="page"><p className="error">{String(error)}</p></div>
  if (!data)     return null

  const activeLabel = data.activePlayer === playerA ? "Player A" : "Player B"
  const boardA      = data.board.players[playerA]
  const boardB      = data.board.players[playerB]

  // Moves filtered by selection — "anchor-free" moves always show
  const anchorFree  = (m: Move) => ["PASS","STOP_PLAYING","CONTINUE_ATTACK","END_ATTACK","DECLINE_DEFENSE","REBUILD_REALM"].includes(m.type)
  const visibleMoves = selectedId
    ? data.legalMoves.filter(m => anchorFree(m) || moveInvolves(m, selectedId))
    : data.legalMoves

  return (
    <DndCtx.Provider value={{ legalMoves: data.legalMoves, onMove: m => moveMutation.mutate(m) }}>
    <div className="page wide">
      <header className="game-header">
        <span>Turn {data.turnNumber} · <strong>{data.phase.replace(/_/g, " ")}</strong></span>
        {data.winner
          ? <span className="winner">🏆 {data.winner === playerA ? "Player A" : "Player B"} wins!</span>
          : <span className="active-player">Active: <strong>{activeLabel}</strong></span>
        }
      </header>

      {moveMutation.error && <p className="error">{String(moveMutation.error)}</p>}

      {data.pendingEffects.length > 0 && (
        <PendingEffectsPanel
          effects={data.pendingEffects}
          legalMoves={data.legalMoves}
          onMove={m => moveMutation.mutate(m)}
          busy={moveMutation.isPending}
          allBoards={data.board.players}
          combat={data.board.combat}
        />
      )}

      {data.board.combat && <CombatPanel combat={data.board.combat} playerA={playerA} playerB={playerB} />}

      <div className="board">
        <PlayerPanel
          label="Player A" playerId={playerA} board={boardA} isOpponent={false}
          selectedId={selectedId} onSelect={setSelectedId}
        />
        <PlayerPanel
          label="Player B" playerId={playerB} board={boardB} isOpponent={true}
          selectedId={selectedId} onSelect={setSelectedId}
        />
      </div>

      {!data.winner && (
        <MovePanel
          moves={visibleMoves}
          allMoves={data.legalMoves}
          phase={data.phase}
          selectedId={selectedId}
          onClearSelection={() => setSelectedId(null)}
          allBoards={data.board.players}
          onMove={m => moveMutation.mutate(m)}
          busy={moveMutation.isPending}
        />
      )}
    </div>
    </DndCtx.Provider>
  )
}

// ─── Player panel ─────────────────────────────────────────────────────────────

function PlayerPanel({ label, playerId, board, isOpponent, selectedId, onSelect }: {
  label:      string
  playerId:   string
  board?:     PlayerBoard
  isOpponent: boolean
  selectedId: string | null
  onSelect:   (id: string | null) => void
}) {
  const { legalMoves, onMove } = React.useContext(DndCtx)
  const [poolDragOver, setPoolDragOver] = useState(false)

  if (!board) return null

  function handlePoolDrop(e: React.DragEvent) {
    e.preventDefault()
    setPoolDragOver(false)
    const id = e.dataTransfer.getData("drag-id")
    const move = legalMoves.find(m => m.type === "PLACE_CHAMPION" && (m as { cardInstanceId: string }).cardInstanceId === id)
    if (move) onMove(move)
  }

  return (
    <section className="player-panel">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <h3 style={{ margin: 0 }}>{label}</h3>
        <DeckPile count={board.drawPileCount} />
        <span style={{ fontSize: 11, color: "#666" }}>Discard: {board.discardCount}</span>
      </div>
      <Formation slots={board.formation} formationOwnerId={playerId} isOpponent={isOpponent} selectedId={selectedId} onSelect={onSelect} />
      <div
        className={`zone drop-zone ${poolDragOver ? "drag-over" : ""}`}
        onDragOver={e => { e.preventDefault(); setPoolDragOver(true) }}
        onDragLeave={() => setPoolDragOver(false)}
        onDrop={handlePoolDrop}
      >
        <span className="zone-label">Pool {poolDragOver ? "— drop to place champion" : ""}</span>
        {board.pool.length > 0 && (
          <div className="card-row" style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
            {board.pool.map(e => (
              <PoolEntryDisplay
                key={e.champion.instanceId}
                entry={e}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
      <div className="zone">
        <span className="zone-label">Hand ({board.hand.length})</span>
        <div className="card-row">
          {board.hand.map(c => (
            <CardDisplay
              key={c.instanceId}
              card={c}
              selected={selectedId === c.instanceId}
              onClick={() => onSelect(selectedId === c.instanceId ? null : c.instanceId)}
              draggable
            />
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Formation ────────────────────────────────────────────────────────────────

function Formation({ slots, formationOwnerId, isOpponent, selectedId, onSelect }: {
  slots:             Record<string, SlotState | null>
  formationOwnerId:  string
  isOpponent:        boolean
  selectedId:        string | null
  onSelect:          (id: string | null) => void
}) {
  const { legalMoves, onMove } = React.useContext(DndCtx)
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null)

  const rows = [["A"], ["B", "C"], ["D", "E", "F"]]

  function handleSlotDrop(e: React.DragEvent, slot: string) {
    e.preventDefault()
    setDragOverSlot(null)
    const id       = e.dataTransfer.getData("drag-id")
    const source   = e.dataTransfer.getData("drag-source")
    if (!id) return

    if (source === "hand") {
      // Try PLAY_REALM (empty or razed slot)
      const realmMove = legalMoves.find(m =>
        m.type === "PLAY_REALM" &&
        (m as { cardInstanceId: string; slot: string }).cardInstanceId === id &&
        (m as { cardInstanceId: string; slot: string }).slot === slot
      )
      if (realmMove) { onMove(realmMove); return }

      // Try PLAY_HOLDING
      const holdingMove = legalMoves.find(m =>
        m.type === "PLAY_HOLDING" &&
        (m as { cardInstanceId: string; realmSlot: string }).cardInstanceId === id &&
        (m as { cardInstanceId: string; realmSlot: string }).realmSlot === slot
      )
      if (holdingMove) { onMove(holdingMove); return }
    }

    if (source === "pool") {
      // Try DECLARE_ATTACK (pool champion → opponent filled slot)
      const attackMove = legalMoves.find(m =>
        m.type === "DECLARE_ATTACK" &&
        (m as { championId: string; targetRealmSlot: string; targetPlayerId: string }).championId === id &&
        (m as { championId: string; targetRealmSlot: string; targetPlayerId: string }).targetRealmSlot === slot &&
        (m as { championId: string; targetRealmSlot: string; targetPlayerId: string }).targetPlayerId === formationOwnerId
      )
      if (attackMove) { onMove(attackMove); return }
    }
  }

  return (
    <div className="zone">
      <span className="zone-label">Formation</span>
      <div className="formation">
        {rows.map((row, ri) => (
          <div key={ri} className="formation-row">
            {row.map(slot => {
              const s = slots[slot]
              const isSelected  = !!s && selectedId === s.realm.instanceId
              const isDragTarget = dragOverSlot === slot
              return (
                <div
                  key={slot}
                  className={`realm-slot ${s ? (s.isRazed ? "razed" : "filled") : "empty"} ${isSelected ? "selected" : ""} ${isDragTarget ? "drag-over" : ""}`}
                  onClick={() => s && onSelect(isSelected ? null : s.realm.instanceId)}
                  onDragOver={e => { e.preventDefault(); setDragOverSlot(slot) }}
                  onDragLeave={() => setDragOverSlot(null)}
                  onDrop={e => handleSlotDrop(e, slot)}
                >
                  <span className="slot-label">{slot}</span>
                  {s ? (
                    <>
                      {s.isRazed ? (
                        <div className="card-back" title={`${s.realm.name} (razed)`}>☽</div>
                      ) : (
                        <CardTooltip card={s.realm}>
                          <img
                            src={cardImageUrl(s.realm.setId, s.realm.cardNumber)}
                            alt={s.realm.name}
                            className="formation-img"
                            onError={e => { (e.target as HTMLImageElement).style.display = "none" }}
                          />
                        </CardTooltip>
                      )}
                      <span className="realm-name">{s.realm.name}{s.isRazed ? " (razed)" : ""}</span>
                      {s.holdings.map(h => (
                        isOpponent
                          ? <span key={h.instanceId} className="holding">Holding</span>
                          : <span key={h.instanceId} className="holding" title={h.description}>{h.name}</span>
                      ))}
                    </>
                  ) : (
                    <span className="empty-label">— empty —</span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Pool entry (champion + stacked attachments) ──────────────────────────────

const STACK_OFFSET = 14  // px per level of stack

function PoolEntryDisplay({ entry, selectedId, onSelect }: {
  entry:      PoolEntry
  selectedId: string | null
  onSelect:   (id: string | null) => void
}) {
  const { legalMoves, onMove } = React.useContext(DndCtx)
  const [showPopup, setShowPopup]         = useState(false)
  const [attachDragOver, setAttachDragOver] = useState(false)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Render order: attachments first (bottom of visual stack), champion last (front/top)
  const stackCards = [...entry.attachments, entry.champion]
  const n = stackCards.length

  function handleEnter() {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
    setShowPopup(true)
  }
  function handleLeave() {
    leaveTimer.current = setTimeout(() => setShowPopup(false), 120)
  }

  function handleAttachDrop(e: React.DragEvent) {
    e.preventDefault()
    setAttachDragOver(false)
    const id = e.dataTransfer.getData("drag-id")
    const move = legalMoves.find(m =>
      m.type === "ATTACH_ITEM" &&
      (m as { cardInstanceId: string; championId: string }).cardInstanceId === id &&
      (m as { cardInstanceId: string; championId: string }).championId === entry.champion.instanceId
    )
    if (move) onMove(move)
  }

  return (
    <div
      style={{ position: "relative", flexShrink: 0 }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className={attachDragOver ? "drag-over" : ""}
      onDragOver={e => { e.preventDefault(); setAttachDragOver(true) }}
      onDragLeave={() => setAttachDragOver(false)}
      onDrop={handleAttachDrop}
    >
      {/* Diagonal stack */}
      <div
        style={{
          position: "relative",
          width:    `${68 + (n - 1) * STACK_OFFSET}px`,
          height:   `${95 + (n - 1) * STACK_OFFSET}px`,
        }}
      >
        {stackCards.map((c, i) => {
          const isChampion = c.instanceId === entry.champion.instanceId
          return (
          <div
            key={c.instanceId}
            style={{ position: "absolute", top: `${i * STACK_OFFSET}px`, left: `${i * STACK_OFFSET}px`, zIndex: i }}
            draggable={isChampion}
            onDragStart={isChampion ? e => {
              e.dataTransfer.setData("drag-id", entry.champion.instanceId)
              e.dataTransfer.setData("drag-source", "pool")
              e.dataTransfer.effectAllowed = "move"
            } : undefined}
          >
            <CardDisplay
              card={c}
              selected={selectedId === c.instanceId}
              onClick={() => onSelect(selectedId === c.instanceId ? null : c.instanceId)}
              label={null}
            />
          </div>
        )})}
      </div>
      {/* Name + level below stack */}
      <div style={{ paddingLeft: `${(n - 1) * STACK_OFFSET}px`, marginTop: 3 }}>
        <div className="card-name-label">{entry.champion.name}</div>
        <div className="card-level">lv {entry.champion.level ?? "?"}</div>
      </div>

      {/* Hover popup — shows all cards in stack with details */}
      {showPopup && n > 1 && (
        <div
          className="stack-popup"
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          {stackCards.map(c => (
            <div key={c.instanceId} className="stack-popup-row">
              <img
                src={cardImageUrl(c.setId, c.cardNumber)}
                alt={c.name}
                className="stack-popup-img"
                onError={e => { (e.target as HTMLImageElement).style.display = "none" }}
              />
              <div className="stack-popup-info">
                <strong>{c.name}</strong>
                {c.level != null && <span className="card-level"> lv {c.level}</span>}
                {c.description && <p className="stack-popup-desc">{c.description}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Card tooltip wrapper ─────────────────────────────────────────────────────

function CardTooltip({ card, children }: { card: CardInfo; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  return (
    <div
      className="card-tooltip-wrap"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="card-tooltip">
          <img
            src={cardImageUrl(card.setId, card.cardNumber)}
            alt={card.name}
            onError={e => { (e.target as HTMLImageElement).style.display = "none" }}
          />
          <div className="card-tooltip-name">{card.name}</div>
          {card.level != null && <div className="card-tooltip-level">Level {card.level}</div>}
          {card.description && <div className="card-tooltip-desc">{card.description}</div>}
        </div>
      )}
    </div>
  )
}

// ─── Card display ─────────────────────────────────────────────────────────────

function CardDisplay({ card, selected, onClick, badge, label, draggable }: {
  card:       CardInfo
  selected:   boolean
  onClick?:   () => void
  badge?:     string
  /** Override the name label. Pass undefined to show card.name, null to hide entirely. */
  label?:     string | null
  draggable?: boolean
}) {
  return (
    <CardTooltip card={card}>
      <div
        className={`card-display ${selected ? "selected" : ""} ${onClick ? "clickable" : ""}`}
        onClick={onClick}
        draggable={draggable}
        onDragStart={draggable ? e => {
          e.dataTransfer.setData("drag-id", card.instanceId)
          e.dataTransfer.setData("drag-source", "hand")
          e.dataTransfer.effectAllowed = "move"
        } : undefined}
      >
        <div className="card-img-wrap">
          <img
            src={cardImageUrl(card.setId, card.cardNumber)}
            alt={card.name}
            className="card-img"
            onError={e => { (e.target as HTMLImageElement).style.display = "none" }}
          />
          {badge && <span className="card-badge">{badge}</span>}
        </div>
        {label !== null && (
          <span className="card-name-label">{label ?? card.name}</span>
        )}
        {label !== null && card.level != null && <span className="card-level">lv {card.level}</span>}
      </div>
    </CardTooltip>
  )
}

// ─── Pending effects panel ────────────────────────────────────────────────────

function PendingEffectsPanel({ effects, legalMoves, onMove, busy, allBoards, combat }: {
  effects:    PendingEffect[]
  legalMoves: Move[]
  onMove:     (m: Move) => void
  busy:       boolean
  allBoards:  Record<string, PlayerBoard>
  combat:     GameState["board"]["combat"]
}) {
  const effect = effects[0]!

  // Build a name lookup from all combat cards (for labelling RESOLVE_EFFECT buttons)
  const nameOf = (id: string): string => {
    if (combat) {
      const all = [...combat.attackerCards, ...combat.defenderCards,
        ...(combat.attacker ? [combat.attacker] : []),
        ...(combat.defender ? [combat.defender] : [])]
      const found = all.find(c => c.instanceId === id)
      if (found) return found.name
    }
    for (const board of Object.values(allBoards)) {
      const all = [...board.hand, ...board.pool.map(e => e.champion), ...board.pool.flatMap(e => e.attachments)]
      const found = all.find(c => c.instanceId === id)
      if (found) return found.name
    }
    return id.slice(0, 8)
  }

  const resolveMoves = legalMoves.filter(m => m.type === "RESOLVE_EFFECT")
  const skipMove     = legalMoves.find(m => m.type === "SKIP_EFFECT")
  const isWaiting    = !skipMove  // this player is not the triggering player

  return (
    <div className="pending-effect-panel">
      <div className="pending-effect-header">
        <span>⚡ <strong>{effect.cardName}</strong> — manual resolution required</span>
        {effects.length > 1 && <span className="pending-effect-count">+{effects.length - 1} more</span>}
      </div>
      {effect.cardDescription && (
        <p className="pending-effect-text">{effect.cardDescription}</p>
      )}
      {isWaiting ? (
        <p className="hint">Waiting for the other player to resolve this effect…</p>
      ) : (
        <div className="pending-effect-actions">
          {resolveMoves.length > 0 && (
            <div className="pending-effect-targets">
              <span className="zone-label">Remove from combat:</span>
              <div className="move-buttons" style={{ marginTop: 4 }}>
                {resolveMoves.map((m, i) => (
                  <button
                    key={i}
                    className="move-btn action"
                    onClick={() => onMove(m)}
                    disabled={busy}
                  >
                    ✕ {nameOf((m as { targetId: string }).targetId)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            className="move-btn pass"
            onClick={() => onMove({ type: "SKIP_EFFECT" })}
            disabled={busy}
            style={{ marginTop: resolveMoves.length > 0 ? 8 : 0 }}
          >
            No effect / Skip
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Combat panel ─────────────────────────────────────────────────────────────

function CombatPanel({ combat, playerA, playerB }: {
  combat:  GameState["board"]["combat"]
  playerA: string
  playerB: string
}) {
  if (!combat) return null
  const atk = combat.attackingPlayer === playerA ? "Player A" : "Player B"
  const def = combat.defendingPlayer === playerA ? "Player A" : "Player B"

  const hasLevels = combat.attacker !== null && combat.defender !== null
  const atkWinning = combat.attackerLevel > combat.defenderLevel
  const defWinning = combat.defenderLevel >= combat.attackerLevel

  return (
    <div className="combat-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>
          <strong>⚔ Combat</strong> — {atk} attacks {def}'s slot <strong>{combat.targetSlot}</strong>
          <span className="combat-phase"> · {combat.roundPhase.replace(/_/g, " ")}</span>
        </span>
        {hasLevels && (
          <span className="combat-score">
            <span style={{ color: atkWinning ? "#faa" : "#888" }}>{combat.attackerLevel}</span>
            <span style={{ color: "#666", margin: "0 6px" }}>vs</span>
            <span style={{ color: defWinning ? "#7ec8e3" : "#888" }}>{combat.defenderLevel}</span>
          </span>
        )}
      </div>
      <div className="combat-combatants">
        {combat.attacker && (
          <div className="combatant">
            <span>ATK</span>
            <div className="combatant-col">
              <img src={cardImageUrl(combat.attacker.setId, combat.attacker.cardNumber)} alt={combat.attacker.name} className="combatant-champion-img" onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
              {combat.attackerCards.length > 0 && (
                <div className="combatant-extras">
                  {combat.attackerCards.map(c => (
                    <img key={c.instanceId} src={cardImageUrl(c.setId, c.cardNumber)} alt={c.name} className="combatant-extra-img" title={c.description} onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
                  ))}
                </div>
              )}
            </div>
            <div>
              <div>{combat.attacker.name}</div>
              <div className="combat-level-detail">
                base {combat.attacker.level ?? 0}
                {combat.attackerCards.map(c => (
                  <span key={c.instanceId} title={c.description}> +{c.name}</span>
                ))}
                {" "}= <strong>{combat.attackerLevel}</strong>
              </div>
            </div>
          </div>
        )}
        {combat.defender && (
          <div className="combatant">
            <span>DEF</span>
            <div className="combatant-col">
              <img src={cardImageUrl(combat.defender.setId, combat.defender.cardNumber)} alt={combat.defender.name} className="combatant-champion-img" onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
              {combat.defenderCards.length > 0 && (
                <div className="combatant-extras">
                  {combat.defenderCards.map(c => (
                    <img key={c.instanceId} src={cardImageUrl(c.setId, c.cardNumber)} alt={c.name} className="combatant-extra-img" title={c.description} onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
                  ))}
                </div>
              )}
            </div>
            <div>
              <div>{combat.defender.name}</div>
              <div className="combat-level-detail">
                base {combat.defender.level ?? 0}
                {combat.defenderCards.map(c => (
                  <span key={c.instanceId} title={c.description}> +{c.name}</span>
                ))}
                {" "}= <strong>{combat.defenderLevel}</strong>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Move panel ───────────────────────────────────────────────────────────────

function MovePanel({ moves, allMoves, phase, selectedId, onClearSelection, allBoards, onMove, busy }: {
  moves:            Move[]
  allMoves:         Move[]
  phase:            string
  selectedId:       string | null
  onClearSelection: () => void
  allBoards:        Record<string, PlayerBoard>
  onMove:           (m: Move) => void
  busy:             boolean
}) {
  // Build name lookup from all players' cards
  const nameOf = (id: string) => {
    for (const board of Object.values(allBoards)) {
      const all = [
        ...board.hand,
        ...board.pool.map(e => e.champion),
        ...board.pool.flatMap(e => e.attachments),
        ...Object.values(board.formation).flatMap(s => s ? [s.realm, ...s.holdings] : []),
      ]
      const found = all.find(c => c.instanceId === id)
      if (found) return found.name
    }
    return id.slice(0, 8)
  }

  return (
    <div className="move-panel">
      <div className="move-panel-header">
        <strong>
          {selectedId
            ? `Moves for selected card (${moves.length} of ${allMoves.length})`
            : `All legal moves (${moves.length})`
          }
        </strong>
        {selectedId && (
          <button className="clear-btn" onClick={onClearSelection}>
            ✕ Clear selection
          </button>
        )}
      </div>
      {selectedId && moves.length === 1 && moves[0]!.type === "PASS" && (
        <p className="hint">No moves available for this card — only PASS is shown.</p>
      )}
      <div className="move-buttons">
        {moves.map((m, i) => (
          <button
            key={i}
            className={`move-btn ${m.type === "PASS" ? "pass" : "action"}`}
            onClick={() => onMove(m)}
            disabled={busy}
          >
            {labelMove(m, nameOf, phase)}
          </button>
        ))}
      </div>
    </div>
  )
}

function labelMove(m: Move, nameOf: (id: string) => string, phase?: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = m as any
  switch (m.type) {
    case "PASS":             return phase === "PHASE_FIVE" ? "Pass turn" : "Next phase"
    case "PLAY_REALM":       return `▶ Play ${nameOf(a.cardInstanceId)} → slot ${a.slot}`
    case "REBUILD_REALM":    return `▶ Rebuild slot ${a.slot}`
    case "PLAY_HOLDING":     return `▶ Play ${nameOf(a.cardInstanceId)} → slot ${a.realmSlot}`
    case "PLACE_CHAMPION":   return `▶ Place ${nameOf(a.cardInstanceId)}`
    case "ATTACH_ITEM":      return `▶ Attach ${nameOf(a.cardInstanceId)} → ${nameOf(a.championId)}`
    case "PLAY_PHASE3_CARD": return `▶ Cast ${nameOf(a.cardInstanceId)}`
    case "PLAY_PHASE5_CARD": return `▶ Play ${nameOf(a.cardInstanceId)}`
    case "PLAY_RULE_CARD":   return `▶ Rule: ${nameOf(a.cardInstanceId)}`
    case "PLAY_EVENT":       return `▶ Event: ${nameOf(a.cardInstanceId)}`
    case "DECLARE_ATTACK":   return `⚔ Attack slot ${a.targetRealmSlot} with ${nameOf(a.championId)}`
    case "DECLARE_DEFENSE":  return `🛡 Defend with ${nameOf(a.championId)}`
    case "DECLINE_DEFENSE":  return `🛡 Decline defense`
    case "PLAY_COMBAT_CARD": return `▶ Play ${nameOf(a.cardInstanceId)}`
    case "STOP_PLAYING":     return "⏹ Stop playing cards"
    case "CONTINUE_ATTACK":  return `⚔ Continue with ${nameOf(a.championId)}`
    case "END_ATTACK":       return "⏹ End attack"
    case "DISCARD_CARD":     return `✕ Discard ${nameOf(a.cardInstanceId)}`
    case "RESOLVE_EFFECT":   return `✕ Remove ${nameOf(a.targetId)} from combat`
    case "SKIP_EFFECT":      return `No effect / Skip`
    default:                 return m.type as string
  }
}
