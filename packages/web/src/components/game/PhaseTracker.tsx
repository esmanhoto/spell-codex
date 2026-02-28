import styles from "./PhaseTracker.module.css"

const PHASES = [
  { key: "PHASE_ONE",   label: "Draw" },
  { key: "PHASE_TWO",   label: "Realm" },
  { key: "PHASE_THREE", label: "Pool" },
  { key: "PHASE_FOUR",  label: "Combat" },
  { key: "PHASE_FIVE",  label: "End" },
]

export function PhaseTracker({ phase }: { phase: string }) {
  const activeIndex = PHASES.findIndex(p => p.key === phase)

  return (
    <div className={styles.tracker}>
      {PHASES.map((p, i) => (
        <span key={p.key}>
          {i > 0 && <span className={styles.arrow}>&rarr;</span>}
          <span
            className={[
              styles.pill,
              i === activeIndex ? styles.active : "",
              i < activeIndex ? styles.past : "",
            ].filter(Boolean).join(" ")}
          >
            {p.label}
          </span>
        </span>
      ))}
    </div>
  )
}
