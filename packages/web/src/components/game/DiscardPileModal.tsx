import { useCallback } from "react"
import type { CardInfo } from "../../api.ts"
import { cardImageUrl } from "../../utils/card-helpers.ts"
import { isChampion } from "../../utils/type-labels.ts"
import { useEscapeKey } from "../../hooks/useEscapeKey.ts"
import { useMoves } from "../../context/MovesContext.tsx"
import { useGameUI } from "../../context/UIContext.tsx"
import { CardTooltip } from "./CardTooltip.tsx"
import type { ContextMenuAction } from "../../context/types.ts"
import styles from "./DiscardPileModal.module.css"

export function DiscardPileModal({
  ownerId,
  cards,
  onClose,
}: {
  ownerId: string
  cards: CardInfo[]
  onClose: () => void
}) {
  const { onMove } = useMoves()
  const { openContextMenu } = useGameUI()
  useEscapeKey(useCallback(() => onClose(), [onClose]))

  function handleContextMenu(e: React.MouseEvent, card: CardInfo) {
    e.preventDefault()
    const actions: ContextMenuAction[] = [
      {
        label: "To Hand",
        move: {
          type: "RETURN_FROM_DISCARD",
          playerId: ownerId,
          cardInstanceId: card.instanceId,
          destination: "hand",
        },
      },
      {
        label: "To Draw Pile",
        move: {
          type: "RETURN_FROM_DISCARD",
          playerId: ownerId,
          cardInstanceId: card.instanceId,
          destination: "deck",
        },
      },
    ]
    if (isChampion(card.typeId)) {
      actions.push({
        label: "To Pool",
        move: {
          type: "RETURN_FROM_DISCARD",
          playerId: ownerId,
          cardInstanceId: card.instanceId,
          destination: "pool",
        },
      })
    }
    openContextMenu(e.clientX, e.clientY, actions)
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Discard Pile ({cards.length})</span>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>
        {cards.length === 0 ? (
          <div className={styles.empty}>Empty</div>
        ) : (
          <div className={styles.grid}>
            {cards.map((card) => (
              <div
                key={card.instanceId}
                className={styles.card}
                onContextMenu={(e) => handleContextMenu(e, card)}
              >
                <CardTooltip card={card}>
                  <img
                    src={cardImageUrl(card.setId, card.cardNumber)}
                    alt={card.name}
                    className={styles.image}
                  />
                </CardTooltip>
                <div className={styles.name}>{card.name}</div>
              </div>
            ))}
          </div>
        )}
        {cards.length > 0 && (
          <div className={styles.footer}>
            <button
              className={styles.shuffleBtn}
              onClick={() => {
                onMove({
                  type: "SHUFFLE_DISCARD_INTO_DRAW_PILE",
                  playerId: ownerId,
                })
                onClose()
              }}
            >
              Shuffle into draw pile
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
