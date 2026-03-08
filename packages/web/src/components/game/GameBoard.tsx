import { useEffect, useRef, useState, useCallback } from "react"
import { useGame } from "../../context/GameContext.tsx"
import type { GameEvent } from "../../api.ts"
import { PlayerHand } from "./PlayerHand.tsx"
import { PlayerArea } from "./PlayerArea.tsx"
import { Divider } from "./Divider.tsx"
import { CombatZone } from "./CombatZone.tsx"
import { EventLog } from "./EventLog.tsx"
import { MovePanel } from "./MovePanel.tsx"
import { CardContextMenu } from "./CardContextMenu.tsx"
import { WarningModal } from "./WarningModal.tsx"
import styles from "./GameBoard.module.css"

function AttackLine() {
  const [line, setLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const rafRef = useRef<number>(0)

  const updateLine = useCallback(() => {
    const champEl = document.querySelector("[data-combat-champion]")
    const slotEl = document.querySelector("[data-targeted-slot]")

    if (champEl && slotEl) {
      const champRect = champEl.getBoundingClientRect()
      const slotRect = slotEl.getBoundingClientRect()
      setLine({
        x1: champRect.left + champRect.width / 2,
        y1: champRect.top + champRect.height / 2,
        x2: slotRect.left + slotRect.width / 2,
        y2: slotRect.top + slotRect.height / 2,
      })
    } else {
      setLine(null)
    }
  }, [])

  useEffect(() => {
    function tick() {
      updateLine()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [updateLine])

  if (!line) return null

  return (
    <svg className={styles.attackLineSvg}>
      <defs>
        <linearGradient id="attackLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e05566" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#e08844" stopOpacity="0.9" />
        </linearGradient>
        <filter id="attackLineGlow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <line
        x1={line.x1}
        y1={line.y1}
        x2={line.x2}
        y2={line.y2}
        stroke="url(#attackLineGrad)"
        strokeWidth="3"
        strokeDasharray="12 8"
        strokeLinecap="round"
        filter="url(#attackLineGlow)"
        opacity="0.8"
      />
    </svg>
  )
}

export function GameBoard({ events, wsError }: { events: GameEvent[]; wsError: string | null }) {
  const {
    playerA,
    playerB,
    allBoards,
    combat,
    contextMenu,
    closeContextMenu,
    onMove,
    warningMessage,
    warningCode,
    warningSuppressible,
    warningProceedLabel,
    warningConfirmAction,
    suppressWarningCode,
    clearWarning,
  } = useGame()
  const showMovePanel = import.meta.env["VITE_SHOW_MOVE_PANEL"] === "true"

  const boardA = allBoards[playerA]
  const boardB = allBoards[playerB]
  const attackedSlotB = combat?.defendingPlayer === playerB ? combat.targetSlot : undefined
  const attackedSlotA = combat?.defendingPlayer === playerA ? combat.targetSlot : undefined

  return (
    <div className={styles.table} data-testid="game-board">
      <div className={styles.content}>
        {wsError && (
          <p className={styles.error} data-testid="ws-error">
            {wsError}
          </p>
        )}

        {/* Opponent hand (top) */}
        {boardB && (
          <div data-testid="hand-top">
            <PlayerHand
              cards={boardB.hand}
              hiddenCount={boardB.handCount}
              drawPileCount={boardB.drawPileCount}
              discardCount={boardB.discardCount}
              isOpponent
            />
          </div>
        )}

        {/* Opponent area */}
        {boardB && (
          <PlayerArea
            board={boardB}
            playerId={playerB}
            isOpponent
            {...(attackedSlotB ? { attackedSlot: attackedSlotB } : {})}
          />
        )}

        {/* Divider with phase tracker */}
        <Divider />

        {/* Own area */}
        {boardA && (
          <PlayerArea
            board={boardA}
            playerId={playerA}
            isOpponent={false}
            {...(attackedSlotA ? { attackedSlot: attackedSlotA } : {})}
          />
        )}

        {/* Own hand (bottom) */}
        {boardA && (
          <div data-testid="hand-bottom">
            <PlayerHand
              cards={boardA.hand}
              drawPileCount={boardA.drawPileCount}
              discardCount={boardA.discardCount}
              isOpponent={false}
            />
          </div>
        )}

        {/* Move panel kept as explicit debug/dev tool during migration */}
        {showMovePanel && <MovePanel playerId={playerA} />}

        {/* Event log sidebar */}
        <EventLog events={events} />

        {/* Combat panel — fixed right-side overlay */}
        {combat && <CombatZone />}

        {/* SVG attack line from attacker to targeted realm */}
        {combat && <AttackLine />}

        {/* Context menu */}
        {contextMenu && (
          <CardContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            actions={contextMenu.actions}
            onAction={onMove}
            onClose={closeContextMenu}
          />
        )}

        {warningMessage && (
          <WarningModal
            message={warningMessage}
            suppressible={warningSuppressible}
            {...(warningProceedLabel ? { proceedLabel: warningProceedLabel } : {})}
            onCancel={(suppress) => {
              if (suppress && warningCode) suppressWarningCode(warningCode)
              clearWarning()
            }}
            {...(warningConfirmAction
              ? {
                  onProceed: (suppress: boolean) => {
                    if (suppress && warningCode) suppressWarningCode(warningCode)
                    const proceed = warningConfirmAction
                    clearWarning()
                    proceed()
                  },
                }
              : {})}
          />
        )}
      </div>
    </div>
  )
}
