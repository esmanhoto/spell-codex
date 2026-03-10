import type { FloatingEmote } from "../../hooks/useChat.ts"
import styles from "./EmoteOverlay.module.css"

interface EmoteOverlayProps {
  emotes: FloatingEmote[]
}

export function EmoteOverlay({ emotes }: EmoteOverlayProps) {
  if (emotes.length === 0) return null
  return (
    <div className={styles.overlay}>
      {emotes.map((e) => (
        <span
          key={e.id}
          className={styles.emote}
          style={{ left: `${e.x}%` }}
        >
          {e.emoji}
        </span>
      ))}
    </div>
  )
}
