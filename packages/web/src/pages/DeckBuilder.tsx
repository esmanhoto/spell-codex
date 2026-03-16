import { useState, useMemo, useRef, useCallback } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { createPortal } from "react-dom"
import { getSetCards, type SetCardData } from "../api.ts"
import { cardImageUrl } from "../utils/card-helpers.ts"
import styles from "./DeckBuilder.module.css"

// ─── Constants ──────────────────────────────────────────────────────────────

const CHAMPION_TYPE_IDS = new Set([5, 7, 10, 12, 14, 16, 20])

const MAX_CHAMPION_LEVELS = 90
const DECK_SIZE = 55

/** Category definitions with 55-card deck limits from Spellfire rules */
const CATEGORIES = [
  { key: "realms", label: "Realms", typeIds: [13], min: 8, max: 15 },
  { key: "holdings", label: "Holdings", typeIds: [8], min: 0, max: 6 },
  { key: "champions", label: "Champions", typeIds: [5, 7, 10, 12, 14, 16, 20], min: 1, max: 20 },
  { key: "artifacts", label: "Artifacts", typeIds: [2], min: 0, max: 10 },
  { key: "magicalItems", label: "Magical Items", typeIds: [9], min: 0, max: 12 },
  { key: "events", label: "Events", typeIds: [6], min: 0, max: 10 },
  { key: "allies", label: "Allies", typeIds: [1], min: 0, max: null },
  { key: "rules", label: "Rule Cards", typeIds: [15], min: 0, max: 3 },
  {
    key: "spells",
    label: "Spells & Abilities",
    typeIds: [4, 11, 17, 18, 19, 3],
    min: 0,
    max: null,
  },
] as const

type CardRef = { setId: string; cardNumber: number }

// ─── localStorage helpers ───────────────────────────────────────────────────

const STORAGE_KEY = "spell_custom_decks"

interface SavedDeck {
  name: string
  cards: CardRef[]
}

function loadSavedDecks(): SavedDeck[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedDeck[]) : []
  } catch {
    return []
  }
}

function persistDecks(decks: SavedDeck[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decks))
}

export function getCustomDecks(): SavedDeck[] {
  return loadSavedDecks()
}

// ─── DeckBuilder ────────────────────────────────────────────────────────────

export function DeckBuilder() {
  const [searchParams] = useSearchParams()
  const editName = searchParams.get("edit")

  const { data, isLoading } = useQuery({
    queryKey: ["set-cards", "1st"],
    queryFn: () => getSetCards("1st"),
  })

  const allCards = data?.cards ?? []

  const [selected, setSelected] = useState<Set<number>>(() => {
    if (editName) {
      const saved = loadSavedDecks().find((d) => d.name === editName)
      if (saved) return new Set(saved.cards.map((c) => c.cardNumber))
    }
    return new Set()
  })
  const [activeTab, setActiveTab] = useState("realms")
  const [deckName, setDeckName] = useState(editName ?? "")
  const [toast, setToast] = useState<string | null>(null)

  // Group cards by category
  const cardsByCategory = useMemo(() => {
    const map = new Map<string, SetCardData[]>()
    for (const cat of CATEGORIES) {
      const typeSet: Set<number> = new Set(cat.typeIds)
      map.set(
        cat.key,
        allCards.filter((c) => typeSet.has(c.typeId)).sort((a, b) => a.cardNumber - b.cardNumber),
      )
    }
    return map
  }, [allCards])

  // Selected cards per category
  const countByCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const cat of CATEGORIES) {
      const typeSet: Set<number> = new Set(cat.typeIds)
      const count = allCards.filter(
        (c) => selected.has(c.cardNumber) && typeSet.has(c.typeId),
      ).length
      map.set(cat.key, count)
    }
    return map
  }, [allCards, selected])

  // Champion level total
  const championLevelTotal = useMemo(() => {
    let total = 0
    let hasAvatar = false
    let avatarLevel = 0
    for (const c of allCards) {
      if (!selected.has(c.cardNumber)) continue
      if (!CHAMPION_TYPE_IDS.has(c.typeId)) continue
      const lvl = typeof c.level === "number" ? c.level : 0
      if (c.isAvatar && !hasAvatar) {
        hasAvatar = true
        avatarLevel = lvl
      }
      total += lvl
    }
    // One free avatar
    return total - avatarLevel
  }, [allCards, selected])

  const totalSelected = selected.size

  function toggleCard(cardNumber: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(cardNumber)) {
        next.delete(cardNumber)
      } else {
        next.add(cardNumber)
      }
      return next
    })
  }

  function clearDeck() {
    setSelected(new Set())
  }

  // Validation errors
  const validationErrors = useMemo(() => {
    const errs: string[] = []
    if (totalSelected !== DECK_SIZE) {
      errs.push(`Deck must have exactly ${DECK_SIZE} cards (currently ${totalSelected})`)
    }
    for (const cat of CATEGORIES) {
      const count = countByCategory.get(cat.key) ?? 0
      if (count < cat.min) errs.push(`${cat.label}: need at least ${cat.min} (have ${count})`)
      if (cat.max !== null && count > cat.max)
        errs.push(`${cat.label}: max ${cat.max} (have ${count})`)
    }
    if (championLevelTotal > MAX_CHAMPION_LEVELS) {
      errs.push(`Champion levels: max ${MAX_CHAMPION_LEVELS} (have ${championLevelTotal})`)
    }
    return errs
  }, [totalSelected, countByCategory, championLevelTotal])

  function saveDeck() {
    const name = deckName.trim()
    if (!name) return
    const cards: CardRef[] = allCards
      .filter((c) => selected.has(c.cardNumber))
      .map((c) => ({ setId: c.setId, cardNumber: c.cardNumber }))
    const decks = loadSavedDecks().filter((d) => d.name !== name)
    decks.push({ name, cards })
    persistDecks(decks)
    setToast(`Deck "${name}" saved`)
    setTimeout(() => setToast(null), 2500)
  }

  const activeCat = CATEGORIES.find((c) => c.key === activeTab) ?? CATEGORIES[0]
  const activeCards = cardsByCategory.get(activeTab) ?? []

  // Sort selected cards for the strip display
  const selectedCards = useMemo(
    () =>
      allCards
        .filter((c) => selected.has(c.cardNumber))
        .sort((a, b) => a.typeId - b.typeId || a.cardNumber - b.cardNumber),
    [allCards, selected],
  )

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.topBar}>
          <div className={styles.topLeft}>
            <Link to="/" className={styles.backBtn}>
              Back
            </Link>
            <h1 className={styles.pageTitle}>Deck Builder</h1>
          </div>
        </div>
        <div className={styles.browser} style={{ display: "grid", placeItems: "center" }}>
          <p>Loading cards...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <div className={styles.topLeft}>
          <Link to="/" className={styles.backBtn}>
            Back
          </Link>
          <h1 className={styles.pageTitle}>Deck Builder</h1>
        </div>
        <div className={styles.topRight}>
          <input
            className={styles.deckNameInput}
            type="text"
            placeholder="Deck name..."
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
          />
          <button
            className={styles.saveBtn}
            disabled={!deckName.trim() || validationErrors.length > 0}
            onClick={saveDeck}
          >
            Save
          </button>
          <button className={styles.clearBtn} onClick={clearDeck}>
            Clear
          </button>
        </div>
      </div>

      {/* My deck strip */}
      <div className={styles.myDeckStrip}>
        <div className={styles.myDeckHeader}>
          <h2 className={styles.myDeckTitle}>My Deck</h2>
          <div>
            <span
              data-testid="deck-count"
              className={
                totalSelected === DECK_SIZE
                  ? styles.deckCountOk
                  : totalSelected > DECK_SIZE
                    ? styles.deckCountOver
                    : styles.deckCountUnder
              }
            >
              {totalSelected}/{DECK_SIZE}
            </span>
            <span
              className={`${styles.levelInfo} ${championLevelTotal > MAX_CHAMPION_LEVELS ? styles.levelWarn : ""}`}
            >
              Champion levels: {championLevelTotal}/{MAX_CHAMPION_LEVELS}
            </span>
          </div>
        </div>
        <div className={styles.myDeckCards}>
          {selectedCards.length === 0 && (
            <span className={styles.myDeckEmpty}>Select cards below to build your deck</span>
          )}
          {selectedCards.map((c) => (
            <MiniCardTooltip key={c.cardNumber} card={c}>
              <div
                className={styles.miniCard}
                data-testid={`mini-card-${c.cardNumber}`}
                onClick={() => toggleCard(c.cardNumber)}
              >
                <img
                  className={styles.miniCardImg}
                  src={cardImageUrl(c.setId, c.cardNumber)}
                  alt={c.name}
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = "none"
                  }}
                />
              </div>
            </MiniCardTooltip>
          ))}
        </div>
      </div>

      {/* Category tabs */}
      <div className={styles.tabBar}>
        {CATEGORIES.map((cat) => {
          const count = countByCategory.get(cat.key) ?? 0
          const total = cardsByCategory.get(cat.key)?.length ?? 0
          return (
            <button
              key={cat.key}
              className={`${styles.tab} ${activeTab === cat.key ? styles.tabActive : ""}`}
              onClick={() => setActiveTab(cat.key)}
            >
              {cat.label}
              <span className={styles.tabCount}>
                {count}/{total}
              </span>
            </button>
          )
        })}
      </div>

      {/* Card browser */}
      <div className={styles.browser}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>{activeCat.label}</h3>
          <span className={styles.sectionRange}>
            {activeCat.min}–{activeCat.max ?? "any"} cards
            {activeCat.key === "champions" &&
              ` (max ${MAX_CHAMPION_LEVELS} total levels, 1 free avatar)`}
          </span>
        </div>
        <div className={styles.cardGrid}>
          {activeCards.map((card) => (
            <GridCard
              key={card.cardNumber}
              card={card}
              isSelected={selected.has(card.cardNumber)}
              onToggle={() => toggleCard(card.cardNumber)}
            />
          ))}
        </div>
      </div>

      {/* Validation bar */}
      {(validationErrors.length > 0 || totalSelected === DECK_SIZE) && (
        <div className={styles.validationBar}>
          {validationErrors.length === 0 && <span className={styles.validOk}>Deck is valid</span>}
          {validationErrors.map((err, i) => (
            <span key={i} className={styles.validErr}>
              {err}
            </span>
          ))}
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}

// ─── Grid card with tooltip ─────────────────────────────────────────────────

function GridCard({
  card,
  isSelected,
  onToggle,
}: {
  card: SetCardData
  isSelected: boolean
  onToggle: () => void
}) {
  return (
    <GridCardTooltip card={card}>
      <div
        className={`${styles.gridCard} ${isSelected ? styles.gridCardSelected : ""}`}
        data-testid={`grid-card-${card.cardNumber}`}
        onClick={onToggle}
      >
        <div className={styles.gridCardImg}>
          <img
            className={styles.gridCardImgInner}
            src={cardImageUrl(card.setId, card.cardNumber)}
            alt={card.name}
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = "none"
            }}
          />
        </div>
        <span className={styles.gridCardName}>{card.name}</span>
        {card.level != null && <span className={styles.gridCardLevel}>lv {card.level}</span>}
      </div>
    </GridCardTooltip>
  )
}

// ─── Tooltip components ─────────────────────────────────────────────────────

function GridCardTooltip({ card, children }: { card: SetCardData; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const getStyle = useCallback((): React.CSSProperties => {
    if (!wrapRef.current) return {}
    const rect = wrapRef.current.getBoundingClientRect()
    const above = rect.top > 200
    let left = rect.left + rect.width / 2 - 130
    left = Math.max(8, Math.min(left, window.innerWidth - 268))
    return above
      ? { left, bottom: window.innerHeight - rect.top + 6 }
      : { left, top: rect.bottom + 6 }
  }, [])

  return (
    <div
      ref={wrapRef}
      className={styles.tooltipWrap}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show &&
        createPortal(
          <div className={styles.tooltipBox} style={getStyle()}>
            <CardTooltipContent card={card} />
          </div>,
          document.body,
        )}
    </div>
  )
}

function MiniCardTooltip({ card, children }: { card: SetCardData; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const getStyle = useCallback((): React.CSSProperties => {
    if (!wrapRef.current) return {}
    const rect = wrapRef.current.getBoundingClientRect()
    let left = rect.left + rect.width / 2 - 130
    left = Math.max(8, Math.min(left, window.innerWidth - 268))
    return { left, top: rect.bottom + 6 }
  }, [])

  return (
    <div
      ref={wrapRef}
      style={{ display: "inline-flex" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show &&
        createPortal(
          <div className={styles.tooltipBox} style={getStyle()}>
            <CardTooltipContent card={card} />
          </div>,
          document.body,
        )}
    </div>
  )
}

function CardTooltipContent({ card }: { card: SetCardData }) {
  return (
    <div className={styles.tooltipItem}>
      <div className={styles.tooltipIcon}>
        <img
          src={cardImageUrl(card.setId, card.cardNumber)}
          alt={card.name}
          onError={(e) => {
            e.currentTarget.style.display = "none"
          }}
        />
      </div>
      <div className={styles.tooltipContent}>
        <div className={styles.tooltipHeader}>
          <div className={styles.tooltipName}>{card.name}</div>
          {card.level != null && <div className={styles.tooltipLevel}>{card.level}</div>}
        </div>
        {card.description && <div className={styles.tooltipDesc}>{card.description}</div>}
      </div>
    </div>
  )
}
