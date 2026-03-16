import { useState, useMemo } from "react"
import { Link, useSearchParams, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { getSetCards, type SetCardData } from "../api.ts"
import { CustomDecksPanel } from "../components/deck-builder/CustomDecksPanel.tsx"
import { DeckStrip } from "../components/deck-builder/DeckStrip.tsx"
import { CardBrowser } from "../components/deck-builder/CardBrowser.tsx"
import {
  CATEGORIES,
  CHAMPION_TYPE_IDS,
  DECK_SIZE,
  MAX_CHAMPION_LEVELS,
  parseLevel,
} from "../components/deck-builder/deck-constants.ts"
import { loadSavedDecks, persistDecks } from "../components/deck-builder/deck-storage.ts"
import type { CardRef } from "../components/deck-builder/deck-storage.ts"
import styles from "./DeckBuilder.module.css"

export function DeckBuilder() {
  const [searchParams] = useSearchParams()
  const editName = searchParams.get("edit")
  return <DeckBuilderInner key={editName ?? ""} />
}

function DeckBuilderInner() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
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
  const [sortOrder, setSortOrder] = useState<"number" | "name" | "level">("number")
  const [worldFilter, setWorldFilter] = useState<Set<number>>(new Set())
  const [deckName, setDeckName] = useState(editName ?? "")
  const [toast, setToast] = useState<string | null>(null)
  const [savedDecks, setSavedDecks] = useState(loadSavedDecks)

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
    return total - avatarLevel
  }, [allCards, selected])

  const totalSelected = selected.size

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

  const activeCat = CATEGORIES.find((c) => c.key === activeTab) ?? CATEGORIES[0]

  const activeCards = useMemo(() => {
    let cards = [...(cardsByCategory.get(activeTab) ?? [])]
    if (worldFilter.size > 0) {
      cards = cards.filter((c) => worldFilter.has(c.worldId))
    }
    if (sortOrder === "name") {
      cards.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortOrder === "level") {
      cards.sort((a, b) => {
        const la = parseLevel(a.level)
        const lb = parseLevel(b.level)
        if (la != null && lb != null) return lb - la
        if (la != null) return -1
        if (lb != null) return 1
        return a.cardNumber - b.cardNumber
      })
    }
    return cards
  }, [cardsByCategory, activeTab, sortOrder, worldFilter])

  const selectedCards = useMemo(
    () =>
      allCards
        .filter((c) => selected.has(c.cardNumber))
        .sort((a, b) => a.typeId - b.typeId || a.cardNumber - b.cardNumber),
    [allCards, selected],
  )

  function toggleCard(cardNumber: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(cardNumber)) next.delete(cardNumber)
      else next.add(cardNumber)
      return next
    })
  }

  function clearDeck() {
    setSelected(new Set())
  }

  function deleteDeck(name: string) {
    const decks = loadSavedDecks().filter((d) => d.name !== name)
    persistDecks(decks)
    setSavedDecks(decks)
    if (editName === name) {
      navigate("/deck-builder", { replace: true })
      setDeckName("")
      setSelected(new Set())
    }
    setToast(`Deck "${name}" deleted`)
    setTimeout(() => setToast(null), 2500)
  }

  function saveDeck() {
    const name = deckName.trim()
    if (!name) return
    const cards: CardRef[] = allCards
      .filter((c) => selected.has(c.cardNumber))
      .map((c) => ({ setId: c.setId, cardNumber: c.cardNumber }))
    const decks = loadSavedDecks().filter((d) => d.name !== name)
    decks.push({ name, cards })
    persistDecks(decks)
    setSavedDecks(decks)
    setToast(`Deck "${name}" saved`)
    setTimeout(() => setToast(null), 2500)
  }

  const deckTitle = deckName.trim() ? `${deckName.trim()} deck` : "My new custom deck"

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

      <CustomDecksPanel savedDecks={savedDecks} editName={editName} onDelete={deleteDeck} />

      <DeckStrip
        title={deckTitle}
        selectedCards={selectedCards}
        totalSelected={totalSelected}
        championLevelTotal={championLevelTotal}
        onToggle={toggleCard}
      />

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

      <CardBrowser
        activeCat={activeCat}
        activeCards={activeCards}
        selected={selected}
        sortOrder={sortOrder}
        worldFilter={worldFilter}
        onToggle={toggleCard}
        onSortChange={setSortOrder}
        onWorldFilterChange={setWorldFilter}
      />

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
