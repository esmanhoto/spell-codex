import { useState, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import type { CardInfo } from "../../api.ts"
import { cardImageUrl } from "../../utils/card-helpers.ts"
import { getTypeInfo } from "../../utils/type-labels.ts"
import styles from "./CombatTooltip.module.css"

export function CombatTooltip({ card, children }: { card: CardInfo; children: React.ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const typeInfo = getTypeInfo(card.typeId)

  const show = useCallback(() => {
    if (!wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    // Find the combat panel to position tooltip to its left
    const panel = wrapRef.current.closest("[data-combat-panel]")
    const panelLeft = panel ? panel.getBoundingClientRect().left : rect.left
    setPos({
      x: panelLeft - 10, // 10px gap to the left of the combat panel
      y: Math.max(8, Math.min(rect.top, window.innerHeight - 200)),
    })
  }, [])

  const hide = useCallback(() => setPos(null), [])

  return (
    <div
      ref={wrapRef}
      className={styles.wrap}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {pos && createPortal(
        <div
          className={styles.tooltip}
          style={{ top: pos.y, right: window.innerWidth - pos.x }}
        >
          <div className={styles.icon}>
            <img
              src={cardImageUrl(card.setId, card.cardNumber)}
              alt={card.name}
              onError={e => { e.currentTarget.style.display = "none" }}
            />
          </div>
          <div className={styles.content}>
            <div className={styles.header}>
              <div className={styles.name}>{card.name}</div>
              {card.level != null && <div className={styles.level}>{card.level}</div>}
            </div>
            <div className={styles.type} style={{ color: typeInfo.color }}>{typeInfo.label}</div>
            {card.description && <div className={styles.desc}>{card.description}</div>}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
