import { MessageCircle, X } from "lucide-react"
import styles from "./ChatBar.module.css"

export const EMOTES = [
  { id: "scream", emoji: "😱" },
  { id: "heart", emoji: "❤️" },
  { id: "thumbsup", emoji: "👍" },
  { id: "hourglass", emoji: "⏳" },
] as const

interface ChatBarProps {
  chatOpen: boolean
  unreadCount: number
  onToggleChat: () => void
  onEmote: (emoteId: string) => void
}

export function ChatBar({ chatOpen, unreadCount, onToggleChat, onEmote }: ChatBarProps) {
  return (
    <div className={styles.bar}>
      <div className={styles.emotes}>
        {EMOTES.map(({ id, emoji }) => (
          <button key={id} className={styles.emoteBtn} onClick={() => onEmote(id)} title={id}>
            {emoji}
          </button>
        ))}
      </div>
      <div className={styles.divider} />
      <button
        className={`${styles.chatBtn} ${chatOpen ? styles.open : ""}`}
        onClick={onToggleChat}
        title={chatOpen ? "Close chat" : "Open chat"}
      >
        {chatOpen ? <X size={20} /> : <MessageCircle size={20} />}
        {!chatOpen && unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
      </button>
    </div>
  )
}
