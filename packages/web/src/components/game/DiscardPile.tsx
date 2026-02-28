import styles from "./DiscardPile.module.css"

export function DiscardPile({ count }: { count: number }) {
  return (
    <div>
      <div className={styles.pile} title={`${count} cards in discard pile`}>
        <div className={styles.cardBack} />
        <div className={styles.count}>{count}</div>
      </div>
      <div className={styles.label}>Discard ({count})</div>
    </div>
  )
}
