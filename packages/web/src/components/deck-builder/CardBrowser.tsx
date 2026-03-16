import type { SetCardData } from "../../api.ts"
import { GridCard } from "./GridCard.tsx"
import { WorldMultiSelect } from "./WorldMultiSelect.tsx"
import { MAX_CHAMPION_LEVELS } from "./deck-constants.ts"
import styles from "../../pages/DeckBuilder.module.css"

export function CardBrowser({
  activeCat,
  activeCards,
  selected,
  sortOrder,
  worldFilter,
  onToggle,
  onSortChange,
  onWorldFilterChange,
}: {
  activeCat: { key: string; label: string; min: number; max: number | null }
  activeCards: SetCardData[]
  selected: Set<number>
  sortOrder: "number" | "name" | "level"
  worldFilter: Set<number>
  onToggle: (cardNumber: number) => void
  onSortChange: (order: "number" | "name" | "level") => void
  onWorldFilterChange: (filter: Set<number>) => void
}) {
  return (
    <div className={styles.browser}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>{activeCat.label}</h3>
        <span className={styles.sectionRange}>
          {activeCat.min}–{activeCat.max ?? "any"} cards
          {activeCat.key === "champions" &&
            ` (max ${MAX_CHAMPION_LEVELS} total levels, 1 free avatar)`}
        </span>
        <div className={styles.sectionControls}>
          <WorldMultiSelect selected={worldFilter} onChange={onWorldFilterChange} />
          <label className={styles.sortLabel}>
            Sort by:
            <select
              className={styles.sortSelect}
              data-testid="sort-select"
              value={sortOrder}
              onChange={(e) => onSortChange(e.target.value as "number" | "name" | "level")}
            >
              <option value="number">Card #</option>
              <option value="name">Name</option>
              <option value="level">Level</option>
            </select>
          </label>
        </div>
      </div>
      <div className={styles.cardGrid}>
        {activeCards.map((card) => (
          <GridCard
            key={card.cardNumber}
            card={card}
            isSelected={selected.has(card.cardNumber)}
            onToggle={() => onToggle(card.cardNumber)}
          />
        ))}
      </div>
    </div>
  )
}
