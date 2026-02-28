import { useState, useRef } from "react"
import type { CardInfo } from "../../api.ts"
import { cardImageUrl } from "../../utils/card-helpers.ts"
import { getTypeInfo } from "../../utils/type-labels.ts"
import styles from "./CardTooltip.module.css"

export function CardTooltip({ card, children }: { card: CardInfo; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const placement = () => {
    if (!wrapRef.current) return styles.above
    const rect = wrapRef.current.getBoundingClientRect()
    return rect.top < 200 ? styles.below : styles.above
  }

  const typeInfo = getTypeInfo(card.typeId)

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
          <div className={styles.icon}>
            <img
              src={cardImageUrl(card.setId, card.cardNumber)}
              alt={card.name}
              onError={e => {
                e.currentTarget.style.display = "none"
                const wrap = e.currentTarget.parentElement
                if (wrap) wrap.style.display = "none"
              }}
            />
          </div>
          <div className={styles.content}>
            <div className={styles.header}>
              <div className={styles.name}>{card.name}</div>
              {card.level != null && <div className={styles.level}>{card.level}</div>}
            </div>
            {card.description && <div className={styles.desc}>{card.description}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
