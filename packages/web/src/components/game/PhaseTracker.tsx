import styles from "./PhaseTracker.module.css"

const PHASES = [
  { key: "START_OF_TURN",   label: "Draw" },
  { key: "PLAY_REALM",   label: "Realm" },
  { key: "POOL", label: "Pool" },
  { key: "COMBAT",  label: "Combat" },
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
