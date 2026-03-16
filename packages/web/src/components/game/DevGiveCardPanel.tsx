import { useState, useEffect, useRef } from "react"
import { devSearchCards, devGiveCard } from "../../api.ts"
import type { DevCardResult } from "../../api.ts"

// Card type groupings matching engine/src/constants.ts
const TYPE_GROUPS: Array<{ label: string; typeIds: number[] }> = [
  { label: "Champions", typeIds: [5, 7, 10, 12, 14, 16, 20] },
  { label: "Allies", typeIds: [1] },
  { label: "Events", typeIds: [6] },
  { label: "Realms", typeIds: [13] },
  { label: "Holdings", typeIds: [8] },
  { label: "Artifacts", typeIds: [2] },
  { label: "Magical Items", typeIds: [9] },
  { label: "Spells", typeIds: [4, 11, 17, 18, 19] },
]

const TYPE_LABEL: Record<number, string> = {
  1: "Ally",
  2: "Artifact",
  4: "Cleric Spell",
  5: "Cleric",
  6: "Event",
  7: "Hero",
  8: "Holding",
  9: "Magical Item",
  10: "Monster",
  11: "Psionic Power",
  12: "Psionicist",
  13: "Realm",
  14: "Regent",
  16: "Thief",
  17: "Thief Ability",
  18: "Unarmed Combat",
  19: "Wizard Spell",
  20: "Wizard",
}

interface Props {
  gameId: string
  myPlayerId: string
  opponentId: string
  onGiven: () => void
}

export function DevGiveCardPanel({ gameId, myPlayerId, opponentId, onGiven }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null) // index into TYPE_GROUPS
  const [results, setResults] = useState<DevCardResult[]>([])
  const [targetPlayer, setTargetPlayer] = useState<"me" | "opponent">("me")
  const [loading, setLoading] = useState(false)
  const [giving, setGiving] = useState<string | null>(null) // key of card being given
  const [toast, setToast] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const typeIds = selectedGroup !== null ? TYPE_GROUPS[selectedGroup]!.typeIds : null
      if (!query.trim() && !typeIds) {
        setResults([])
        return
      }
      setLoading(true)
      devSearchCards(query.trim(), typeIds)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, selectedGroup, open])

  async function handleGive(card: DevCardResult) {
    const key = `${card.setId}-${card.cardNumber}`
    setGiving(key)
    const playerId = targetPlayer === "me" ? myPlayerId : opponentId
    try {
      await devGiveCard(gameId, playerId, card.setId, card.cardNumber)
      setToast(`✓ ${card.name} → ${targetPlayer === "me" ? "your" : "opponent's"} hand`)
      setTimeout(() => setToast(null), 2500)
      onGiven()
    } catch (e) {
      setToast(`✗ ${e instanceof Error ? e.message : "Failed"}`)
      setTimeout(() => setToast(null), 3000)
    } finally {
      setGiving(null)
    }
  }

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Dev: Give card to hand"
        style={{
          position: "fixed",
          bottom: 16,
          left: 16,
          zIndex: 1200,
          background: open ? "#233020" : "#1a1a1a",
          border: `1px solid ${open ? "#7b9c5a" : "#444"}`,
          color: open ? "#b0d488" : "#888",
          borderRadius: 6,
          padding: "5px 10px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          letterSpacing: "0.04em",
        }}
      >
        DEV
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 48,
            left: 16,
            zIndex: 1200,
            width: 300,
            background: "#151818",
            border: "2px solid #7b9c5a",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.7)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: 12,
            maxHeight: "calc(100vh - 120px)",
          }}
        >
          <div
            style={{
              color: "#9aaa70",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Give Card
          </div>

          {/* Target player toggle */}
          <div style={{ display: "flex", gap: 6 }}>
            {(["me", "opponent"] as const).map((side) => (
              <button
                key={side}
                onClick={() => setTargetPlayer(side)}
                style={{
                  flex: 1,
                  border: `1px solid ${targetPlayer === side ? "#7b9c5a" : "#333"}`,
                  background: targetPlayer === side ? "#233020" : "#1e1e1e",
                  color: targetPlayer === side ? "#b0d488" : "#777",
                  borderRadius: 4,
                  padding: "4px 8px",
                  fontSize: 11,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {side === "me" ? "My hand" : "Opp hand"}
              </button>
            ))}
          </div>

          {/* Type filter */}
          <select
            value={selectedGroup ?? ""}
            onChange={(e) =>
              setSelectedGroup(e.target.value === "" ? null : Number(e.target.value))
            }
            style={{
              background: "#1e1a17",
              border: "1px solid #4a3a32",
              color: "#eadfcb",
              borderRadius: 4,
              padding: "4px 6px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <option value="">All types</option>
            {TYPE_GROUPS.map((g, i) => (
              <option key={g.label} value={i}>
                {g.label}
              </option>
            ))}
          </select>

          {/* Name search */}
          <input
            type="text"
            placeholder="Search by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            style={{
              background: "#1e1a17",
              border: "1px solid #4a3a32",
              color: "#eadfcb",
              borderRadius: 4,
              padding: "5px 8px",
              fontSize: 12,
              outline: "none",
            }}
          />

          {/* Results */}
          <div
            style={{
              overflowY: "auto",
              maxHeight: 280,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {loading && (
              <div style={{ color: "#666", fontSize: 11, padding: "4px 0" }}>Searching…</div>
            )}
            {!loading && results.length === 0 && (query.trim() || selectedGroup !== null) && (
              <div style={{ color: "#555", fontSize: 11, padding: "4px 0" }}>No results</div>
            )}
            {!loading && results.length === 0 && !query.trim() && selectedGroup === null && (
              <div style={{ color: "#555", fontSize: 11, padding: "4px 0" }}>
                Type a name or pick a type
              </div>
            )}
            {results.map((card) => {
              const key = `${card.setId}-${card.cardNumber}`
              return (
                <button
                  key={key}
                  onClick={() => handleGive(card)}
                  disabled={giving === key}
                  style={{
                    background: giving === key ? "#1a2a14" : "#1e1e1e",
                    border: "1px solid #2a2a2a",
                    borderRadius: 4,
                    padding: "5px 8px",
                    textAlign: "left",
                    cursor: giving === key ? "wait" : "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <span style={{ color: "#e0d4b8", fontSize: 12, fontWeight: 600 }}>
                    {card.name}
                  </span>
                  <span style={{ color: "#666", fontSize: 10 }}>
                    {card.setId} #{card.cardNumber} ·{" "}
                    {TYPE_LABEL[card.typeId] ?? `type ${card.typeId}`}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Toast */}
          {toast && (
            <div
              style={{
                color: toast.startsWith("✓") ? "#b0d488" : "#e07070",
                fontSize: 11,
                paddingTop: 2,
              }}
            >
              {toast}
            </div>
          )}
        </div>
      )}
    </>
  )
}
