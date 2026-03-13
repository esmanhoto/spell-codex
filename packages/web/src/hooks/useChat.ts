import { useState, useCallback, useRef } from "react"
import type { WsClient, WsClientMessage } from "../api.ts"
import { EMOTES } from "../components/game/ChatBar.tsx"

const EMOTE_MAP = Object.fromEntries(EMOTES.map(({ id, emoji }) => [id, emoji]))
const FLOAT_DURATION_MS = 3000

export interface ChatEntry {
  id: string
  type: "message"
  playerId: string
  displayName: string | null
  text: string
  ts: number
}

export interface FloatingEmote {
  id: string
  emoji: string
  x: number // 5–85% from left
}

const MAX_MESSAGES = 200

export function useChat(wsRef: React.RefObject<WsClient | null>, isOpen: boolean) {
  const [messages, setMessages] = useState<ChatEntry[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [floatingEmotes, setFloatingEmotes] = useState<FloatingEmote[]>([])
  const isOpenRef = useRef(isOpen)
  isOpenRef.current = isOpen

  const addMessage = useCallback((entry: Omit<ChatEntry, "id">) => {
    setMessages((prev) => {
      const next = [...prev, { ...entry, id: crypto.randomUUID() }]
      return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next
    })
    if (!isOpenRef.current) {
      setUnreadCount((n) => n + 1)
    }
  }, [])

  const spawnFloatingEmote = useCallback((emoteId: string) => {
    const emoji = EMOTE_MAP[emoteId] ?? emoteId
    const id = crypto.randomUUID()
    const x = 5 + Math.random() * 80
    setFloatingEmotes((prev) => [...prev, { id, emoji, x }])
    setTimeout(() => {
      setFloatingEmotes((prev) => prev.filter((e) => e.id !== id))
    }, FLOAT_DURATION_MS)
  }, [])

  const onWsMessage = useCallback(
    (msg: WsClientMessage) => {
      if (msg.type === "CHAT_MSG") {
        addMessage({
          type: "message",
          playerId: msg.playerId,
          displayName: msg.displayName,
          text: msg.text,
          ts: msg.ts,
        })
      } else if (msg.type === "CHAT_EMOTE") {
        spawnFloatingEmote(msg.emote)
      }
    },
    [addMessage, spawnFloatingEmote],
  )

  const sendMessage = useCallback(
    (text: string) => {
      wsRef.current?.sendChat(text)
    },
    [wsRef],
  )

  const sendEmote = useCallback(
    (emote: string) => {
      wsRef.current?.sendEmote(emote)
    },
    [wsRef],
  )

  const resetUnread = useCallback(() => setUnreadCount(0), [])

  return { messages, unreadCount, floatingEmotes, onWsMessage, sendMessage, sendEmote, resetUnread }
}
