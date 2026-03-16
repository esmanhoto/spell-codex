import { Link } from "react-router-dom"
import type { SavedDeck } from "./deck-storage.ts"
import styles from "../../pages/DeckBuilder.module.css"

export function CustomDecksPanel({
  savedDecks,
  editName,
  onDelete,
}: {
  savedDecks: SavedDeck[]
  editName: string | null
  onDelete: (name: string) => void
}) {
  return (
    <div className={styles.customDecksPanel}>
      <h2 className={styles.customDecksTitle}>My Custom Decks</h2>
      <div className={styles.customDecksList}>
        <Link
          to="/deck-builder"
          className={`${styles.customDeckRow} ${!editName ? styles.customDeckRowActive : ""}`}
        >
          <span className={styles.customDeckName}>+ new custom deck</span>
        </Link>
        {savedDecks.map((d) => (
          <div
            key={d.name}
            className={`${styles.customDeckRow} ${editName === d.name ? styles.customDeckRowActive : ""}`}
          >
            <Link
              to={`/deck-builder?edit=${encodeURIComponent(d.name)}`}
              className={styles.customDeckName}
            >
              {d.name}
            </Link>
            <div className={styles.customDeckActions}>
              <button
                className={styles.customDeckActionBtn}
                onClick={() => onDelete(d.name)}
                title="Delete"
              >
                &#128465;
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
