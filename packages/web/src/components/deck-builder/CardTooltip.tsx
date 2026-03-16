import { useState, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import type { SetCardData } from "../../api.ts"
import { cardImageUrl } from "../../utils/card-helpers.ts"
import styles from "../../pages/DeckBuilder.module.css"

export function GridCardTooltip({
  card,
  children,
}: {
  card: SetCardData
  children: React.ReactNode
}) {
  const [show, setShow] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const getStyle = useCallback((): React.CSSProperties => {
    if (!wrapRef.current) return {}
    const rect = wrapRef.current.getBoundingClientRect()
    const above = rect.top > 200
    let left = rect.left + rect.width / 2 - 130
    left = Math.max(8, Math.min(left, window.innerWidth - 268))
    return above
      ? { left, bottom: window.innerHeight - rect.top + 6 }
      : { left, top: rect.bottom + 6 }
  }, [])

  return (
    <div
      ref={wrapRef}
      className={styles.tooltipWrap}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show &&
        createPortal(
          <div className={styles.tooltipBox} style={getStyle()}>
            <CardTooltipContent card={card} />
          </div>,
          document.body,
        )}
    </div>
  )
}

export function MiniCardTooltip({
  card,
  children,
}: {
  card: SetCardData
  children: React.ReactNode
}) {
  const [show, setShow] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const getStyle = useCallback((): React.CSSProperties => {
    if (!wrapRef.current) return {}
    const rect = wrapRef.current.getBoundingClientRect()
    let left = rect.left + rect.width / 2 - 130
    left = Math.max(8, Math.min(left, window.innerWidth - 268))
    return { left, top: rect.bottom + 6 }
  }, [])

  return (
    <div
      ref={wrapRef}
      style={{ display: "inline-flex" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show &&
        createPortal(
          <div className={styles.tooltipBox} style={getStyle()}>
            <CardTooltipContent card={card} />
          </div>,
          document.body,
        )}
    </div>
  )
}

function CardTooltipContent({ card }: { card: SetCardData }) {
  return (
    <div className={styles.tooltipItem}>
      <div className={styles.tooltipIcon}>
        <img
          src={cardImageUrl(card.setId, card.cardNumber)}
          alt={card.name}
          onError={(e) => {
            e.currentTarget.style.display = "none"
          }}
        />
      </div>
      <div className={styles.tooltipContent}>
        <div className={styles.tooltipHeader}>
          <div className={styles.tooltipName}>{card.name}</div>
          {card.level != null && <div className={styles.tooltipLevel}>{card.level}</div>}
        </div>
        {card.description && <div className={styles.tooltipDesc}>{card.description}</div>}
      </div>
    </div>
  )
}
