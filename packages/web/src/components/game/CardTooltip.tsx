import { useState, useRef } from "react"
import type { CardInfo } from "../../api.ts"
import { cardImageUrl } from "../../utils/card-helpers.ts"
import styles from "./CardTooltip.module.css"

export function CardTooltip({
  card,
  cards,
  children,
}: {
  card?: CardInfo
  cards?: CardInfo[]
  children: React.ReactNode
}) {
  const [show, setShow] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const list = cards ?? (card ? [card] : [])

  const placement = () => {
    if (!wrapRef.current) return styles.above
    const rect = wrapRef.current.getBoundingClientRect()
    return rect.top < 200 ? styles.below : styles.above
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
      {show && (
        <div className={`${styles.tooltip} ${placement()}`}>
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
                  <div className={styles.name}>{c.name}</div>
                  {c.level != null && <div className={styles.level}>{c.level}</div>}
                </div>
                {c.description && <div className={styles.desc}>{c.description}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
