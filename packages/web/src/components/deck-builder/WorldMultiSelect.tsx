import { useState, useRef, useEffect } from "react"
import styles from "../../pages/DeckBuilder.module.css"

const WORLDS = [
  { id: 1, label: "Forgotten Realms" },
  { id: 2, label: "Greyhawk" },
  { id: 4, label: "Dark Sun" },
  { id: 5, label: "DragonLance" },
  { id: 7, label: "AD&D" },
] as const

export function WorldMultiSelect({
  selected,
  onChange,
}: {
  selected: Set<number>
  onChange: (next: Set<number>) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  function toggle(id: number) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  const label =
    selected.size === 0
      ? "All"
      : WORLDS.filter((w) => selected.has(w.id))
          .map((w) => w.label)
          .join(", ")

  return (
    <div className={styles.worldFilter} ref={ref} data-testid="world-filter">
      <span className={styles.filterLabel}>World:</span>
      <button className={styles.worldDropdownBtn} onClick={() => setOpen((p) => !p)}>
        <span className={styles.worldDropdownLabel}>{label}</span>
        <span className={styles.worldDropdownArrow}>{open ? "\u25B2" : "\u25BC"}</span>
      </button>
      {open && (
        <div className={styles.worldDropdownMenu}>
          {WORLDS.map((w) => (
            <div key={w.id} className={styles.worldDropdownItem} onClick={() => toggle(w.id)}>
              <input type="checkbox" checked={selected.has(w.id)} readOnly />
              {w.label}
            </div>
          ))}
          {selected.size > 0 && (
            <button
              className={styles.worldDropdownClear}
              onClick={() => {
                onChange(new Set())
                setOpen(false)
              }}
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  )
}
