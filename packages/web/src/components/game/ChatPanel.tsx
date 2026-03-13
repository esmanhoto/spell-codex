import { useRef, useEffect, useState, useCallback } from "react"
import type { ChatEntry } from "../../hooks/useChat.ts"
import styles from "./ChatPanel.module.css"

function playerLabel(entry: ChatEntry, playerIds: string[]): string {
  if (entry.displayName) return entry.displayName
  // fallback: "Player N" based on order, or short UUID
  const idx = playerIds.indexOf(entry.playerId)
  if (idx >= 0) return `Player ${idx + 1}`
  return entry.playerId.slice(0, 8)
}

interface ChatPanelProps {
  messages: ChatEntry[]
  myPlayerId: string
  playerIds: string[]
  onSend: (text: string) => void
  onClose: () => void
}

export function ChatPanel({ messages, myPlayerId, playerIds, onSend, onClose }: ChatPanelProps) {
  const [input, setInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const playerColor = useCallback(
    (playerId: string) => {
      const palette = ["var(--gold)", "#7ec8e3", "#b5e3a0", "#e3a0b5", "#e3c9a0", "#a0b5e3"]
      const idx = playerIds.indexOf(playerId)
      return palette[idx % palette.length] ?? "var(--gold)"
    },
    [playerIds],
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleSend() {
    const text = input.trim()
    if (!text) return
    onSend(text)
    setInput("")
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSend()
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>CHAT</span>
        <button className={styles.closeBtn} onClick={onClose} title="Close chat">
          ✕
        </button>
      </div>

      <div className={styles.messages}>
        {messages.map((entry, i) => {
          const isSelf = entry.playerId === myPlayerId
          const prevEntry = messages[i - 1]
          const showName = !prevEntry || prevEntry.playerId !== entry.playerId

          return (
            <div
              key={entry.id}
              className={`${styles.msgRow} ${isSelf ? styles.self : styles.other}`}
            >
              {showName && (
                <span className={styles.playerLabel} style={{ color: playerColor(entry.playerId) }}>
                  {isSelf ? "You" : playerLabel(entry, playerIds)}
                </span>
              )}
              <div className={styles.bubble}>{entry.text}</div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className={styles.inputRow}>
        <input
          ref={inputRef}
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          maxLength={500}
        />
        <button className={styles.sendBtn} onClick={handleSend} title="Send">
          ➤
        </button>
      </div>
    </div>
  )
}
