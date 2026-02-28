import { useGame } from "../../context/GameContext.tsx"
import type { GameEvent } from "../../api.ts"
import { PlayerHand } from "./PlayerHand.tsx"
import { PlayerArea } from "./PlayerArea.tsx"
import { Divider } from "./Divider.tsx"
import { CombatZone } from "./CombatZone.tsx"
import { PendingEffects } from "./PendingEffects.tsx"
import { ResponseWindowOverlay } from "./ResponseWindow.tsx"
import { EventLog } from "./EventLog.tsx"
import { MovePanel } from "./MovePanel.tsx"
import { CardContextMenu } from "./CardContextMenu.tsx"
import styles from "./GameBoard.module.css"

export function GameBoard({ events, wsError }: {
  events:  GameEvent[]
  wsError: string | null
}) {
  const { playerA, playerB, allBoards, combat, pendingEffects, responseWindow, contextMenu, closeContextMenu, onMove } = useGame()

  const boardA = allBoards[playerA]
  const boardB = allBoards[playerB]
  const attackedSlotB = combat?.defendingPlayer === playerB ? combat.targetSlot : undefined
  const attackedSlotA = combat?.defendingPlayer === playerA ? combat.targetSlot : undefined

  return (
    <div className={styles.table}>
      <div className={styles.content}>
        {wsError && <p className={styles.error}>{wsError}</p>}

        {/* Opponent hand (top) */}
        {boardB && (
          <PlayerHand
            cards={boardB.hand}
            drawPileCount={boardB.drawPileCount}
            discardCount={boardB.discardCount}
            isOpponent={false}
          />
        )}

        {/* Opponent area */}
        {boardB && (
          <PlayerArea board={boardB} playerId={playerB} isOpponent attackedSlot={attackedSlotB} />
        )}

        {/* Move panel for player B (when they have moves) */}
        <MovePanel playerId={playerB} />

        {/* Overlays: combat, pending effects, response window */}
        <div className={styles.overlays}>
          {responseWindow && <ResponseWindowOverlay />}
          {pendingEffects.length > 0 && !responseWindow && <PendingEffects />}
          {combat && <CombatZone />}
        </div>

        {/* Divider with phase tracker */}
        <Divider />

        {/* Move panel for player A */}
        <MovePanel playerId={playerA} />

        {/* Own area */}
        {boardA && (
          <PlayerArea board={boardA} playerId={playerA} isOpponent={false} attackedSlot={attackedSlotA} />
        )}

        {/* Own hand (bottom) */}
        {boardA && (
          <PlayerHand
            cards={boardA.hand}
            drawPileCount={boardA.drawPileCount}
            discardCount={boardA.discardCount}
            isOpponent={false}
          />
        )}

        {/* Event log sidebar */}
        <EventLog events={events} />

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
      </div>
    </div>
  )
}
