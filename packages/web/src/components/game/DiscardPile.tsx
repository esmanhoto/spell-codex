import styles from "./DiscardPile.module.css"

export function DiscardPile({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <div onClick={onOpen} style={{ cursor: "pointer" }}>
      <div className={styles.pile} title={`${count} cards in discard pile — click to view`}>
        <div className={styles.cardBack} />
        <div className={styles.count}>{count}</div>
      </div>
      <div className={styles.label}>Discard ({count})</div>
    </div>
  )
}
