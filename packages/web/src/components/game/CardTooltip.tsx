import { useState, useRef } from "react"
import { createPortal } from "react-dom"
import type { CardInfo } from "../../api.ts"
import { cardImageUrl } from "../../utils/card-helpers.ts"
import styles from "./CardTooltip.module.css"

const TOOLTIP_WIDTH = 260

export function CardTooltip({
  card,
  cards,
  children,
  razed,
}: {
  card?: CardInfo
  cards?: CardInfo[]
  children: React.ReactNode
  razed?: boolean
}) {
  const [show, setShow] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const list = cards ?? (card ? [card] : [])

  function getTooltipStyle(): React.CSSProperties {
    if (!wrapRef.current) return {}
    const rect = wrapRef.current.getBoundingClientRect()
    const above = rect.top > 200
    let left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2
    left = Math.max(8, Math.min(left, window.innerWidth - TOOLTIP_WIDTH - 8))
    return above
      ? { left, bottom: window.innerHeight - rect.top + 6 }
      : { left, top: rect.bottom + 6 }
  }

  if (list.length === 0) return <>{children}</>

  return (
    <div
      ref={wrapRef}
      className={styles.wrap}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show &&
        createPortal(
          <div className={styles.tooltip} style={{ ...getTooltipStyle(), zIndex: 500 }}>
            {list.map((c) => (
              <div key={c.instanceId} className={styles.item}>
                <div className={styles.icon}>
                  <img
                    src={cardImageUrl(c.setId, c.cardNumber)}
                    alt={c.name}
                    onError={(e) => {
                      e.currentTarget.style.display = "none"
                      const wrap = e.currentTarget.parentElement
                      if (wrap) wrap.style.display = "none"
                    }}
                  />
                </div>
                <div className={styles.content}>
                  <div className={styles.header}>
                    <div className={styles.name}>
                      {c.name}
                      {razed && <span className={styles.razedBadge}> RAZED</span>}
                    </div>
                    {c.level != null && <div className={styles.level}>{c.level}</div>}
                  </div>
                  {c.description && <div className={styles.desc}>{c.description}</div>}
                </div>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
