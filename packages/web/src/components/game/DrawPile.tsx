import { useEffect, useRef, useState } from "react"
import { useGame } from "../../context/GameContext.tsx"
import styles from "./DrawPile.module.css"

export function DrawPile({ count, disabled = false }: { count: number; disabled?: boolean }) {
  const { legalMoves, onMove, playMode, manualSettings } = useGame()
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [drawCount, setDrawCount] = useState(String(manualSettings.drawCount))
  const [handSize, setHandSize] = useState(String(manualSettings.maxHandSize))
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDrawCount(String(manualSettings.drawCount))
    setHandSize(String(manualSettings.maxHandSize))
  }, [manualSettings.drawCount, manualSettings.maxHandSize])

  useEffect(() => {
    if (!menuPos) return
    function closeOnOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuPos(null)
      }
    }
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuPos(null)
    }
    document.addEventListener("mousedown", closeOnOutside)
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("mousedown", closeOnOutside)
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [menuPos])

  function handleClick() {
    if (disabled) return
    if (playMode === "full_manual") {
      onMove({ type: "MANUAL_DRAW_CARDS", count: manualSettings.drawCount })
      return
    }
    // Default left-click: draw via the standard draw mechanism (PASS in draw phase)
    const passMove = legalMoves.find((m) => m.type === "PASS")
    if (passMove) onMove(passMove)
  }

  function handleContextMenu(e: React.MouseEvent) {
    if (disabled || playMode !== "full_manual") return
    e.preventDefault()
    setMenuPos({ x: e.clientX, y: e.clientY })
  }

  function readPositiveInt(raw: string, fallback: number): number {
    const n = parseInt(raw, 10)
    return !isNaN(n) && n > 0 ? n : fallback
  }

  function submitDraw() {
    const value = readPositiveInt(drawCount, manualSettings.drawCount)
    onMove({ type: "MANUAL_DRAW_CARDS", count: value })
    setMenuPos(null)
  }

  function submitDrawSetting() {
    const value = readPositiveInt(drawCount, manualSettings.drawCount)
    onMove({ type: "MANUAL_SET_DRAW_COUNT", count: value })
  }

  function submitHandSize() {
    const parsed = parseInt(handSize, 10)
    const value = !isNaN(parsed) ? Math.max(0, parsed) : manualSettings.maxHandSize
    onMove({ type: "MANUAL_SET_MAX_HAND_SIZE", size: value })
  }

  return (
    <div>
      <div
        className={styles.pile}
        title={`${count} cards in draw pile`}
        data-testid={disabled ? "draw-pile-opponent" : "draw-pile-self"}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <div className={styles.cardBack} />
        <div className={styles.cardBack} />
        <div className={styles.cardBack} />
        <div className={styles.count}>{count}</div>
      </div>
      <div className={styles.label}>Draw ({count})</div>
      {menuPos && (
        <div
          ref={menuRef}
          className={styles.menu}
          style={{
            top: Math.min(menuPos.y, window.innerHeight - 220),
            left: Math.min(menuPos.x, window.innerWidth - 230),
          }}
        >
          <div className={styles.menuTitle}>Draw Pile</div>
          <label className={styles.menuRow}>
            <span>Draw</span>
            <input
              type="number"
              min={1}
              value={drawCount}
              onChange={(e) => setDrawCount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitDraw()}
              autoFocus
            />
            <button className={styles.menuBtn} onClick={submitDraw}>
              Draw
            </button>
          </label>
          <label className={styles.menuRow}>
            <span>Default</span>
            <input
              type="number"
              min={1}
              max={20}
              value={drawCount}
              onChange={(e) => setDrawCount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitDrawSetting()}
            />
            <button className={styles.menuBtn} onClick={submitDrawSetting}>
              Set
            </button>
          </label>
          <label className={styles.menuRow}>
            <span>Hand</span>
            <input
              type="number"
              min={0}
              max={30}
              value={handSize}
              onChange={(e) => setHandSize(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitHandSize()}
            />
            <button className={styles.menuBtn} onClick={submitHandSize}>
              Set
            </button>
          </label>
          <button
            className={`${styles.menuBtn} ${styles.closeBtn}`}
            onClick={() => setMenuPos(null)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  )
}
