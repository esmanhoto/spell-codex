import { useRef, useEffect } from "react"
import type { Move } from "../../api.ts"
import type { ContextMenuAction } from "../../context/GameContext.tsx"
import styles from "./CardContextMenu.module.css"

export function CardContextMenu({
  x,
  y,
  actions,
  onAction,
  onClose,
}: {
  x: number
  y: number
  actions: ContextMenuAction[]
  onAction: (m: Move) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [onClose])

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    top: Math.min(y, window.innerHeight - 200),
    left: Math.min(x, window.innerWidth - 160),
  }

  return (
    <div ref={ref} className={styles.menu} style={menuStyle}>
      {actions.map((a, i) => (
        <button
          key={i}
          className={styles.item}
          onClick={() => {
            if (a.action) a.action()
            else if (a.move) onAction(a.move)
            onClose()
          }}
        >
          {a.label}
        </button>
      ))}
      <button className={`${styles.item} ${styles.cancel}`} onClick={onClose}>
        Cancel
      </button>
    </div>
  )
}
