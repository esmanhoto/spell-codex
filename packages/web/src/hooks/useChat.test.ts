import { describe, it, expect } from "bun:test"
import { renderHook, act } from "@testing-library/react"
import { useChat } from "./useChat.ts"
import type { WsClientMessage } from "../api.ts"

function setup(isOpen = false) {
  const wsRef = { current: null }
  return renderHook(
    ({ open }) => useChat(wsRef as React.RefObject<null>, open),
    { initialProps: { open: isOpen } },
  )
}

describe("useChat", () => {
  it("starts with empty messages, 0 unread, no emotes", () => {
    const { result } = setup()
    expect(result.current.messages).toEqual([])
    expect(result.current.unreadCount).toBe(0)
    expect(result.current.floatingEmotes).toEqual([])
  })

  it("adds a chat message via onWsMessage", () => {
    const { result } = setup(true)
    act(() => {
      result.current.onWsMessage({
        type: "CHAT_MSG",
        gameId: "g1",
        playerId: "p1",
        displayName: "Alice",
        text: "Hello!",
        ts: Date.now(),
      })
    })
    expect(result.current.messages.length).toBe(1)
    expect(result.current.messages[0]!.text).toBe("Hello!")
    expect(result.current.messages[0]!.displayName).toBe("Alice")
  })

  it("increments unread count when chat is closed", () => {
    const { result } = setup(false)
    act(() => {
      result.current.onWsMessage({
        type: "CHAT_MSG",
        gameId: "g1",
        playerId: "p1",
        displayName: null,
        text: "msg1",
        ts: Date.now(),
      })
    })
    expect(result.current.unreadCount).toBe(1)

    act(() => {
      result.current.onWsMessage({
        type: "CHAT_MSG",
        gameId: "g1",
        playerId: "p1",
        displayName: null,
        text: "msg2",
        ts: Date.now(),
      })
    })
    expect(result.current.unreadCount).toBe(2)
  })

  it("does NOT increment unread when chat is open", () => {
    const { result } = setup(true)
    act(() => {
      result.current.onWsMessage({
        type: "CHAT_MSG",
        gameId: "g1",
        playerId: "p1",
        displayName: null,
        text: "hi",
        ts: Date.now(),
      })
    })
    expect(result.current.unreadCount).toBe(0)
  })

  it("resetUnread clears unread count", () => {
    const { result } = setup(false)
    act(() => {
      result.current.onWsMessage({
        type: "CHAT_MSG",
        gameId: "g1",
        playerId: "p1",
        displayName: null,
        text: "x",
        ts: Date.now(),
      })
    })
    expect(result.current.unreadCount).toBe(1)
    act(() => result.current.resetUnread())
    expect(result.current.unreadCount).toBe(0)
  })

  it("caps messages at 200", () => {
    const { result } = setup(true)
    act(() => {
      for (let i = 0; i < 210; i++) {
        result.current.onWsMessage({
          type: "CHAT_MSG",
          gameId: "g1",
          playerId: "p1",
          displayName: null,
          text: `msg-${i}`,
          ts: Date.now(),
        })
      }
    })
    expect(result.current.messages.length).toBe(200)
    // Oldest messages are dropped — most recent survive
    expect(result.current.messages[199]!.text).toBe("msg-209")
  })

  it("spawns floating emote on CHAT_EMOTE", () => {
    const { result } = setup(true)
    act(() => {
      result.current.onWsMessage({
        type: "CHAT_EMOTE",
        gameId: "g1",
        playerId: "p1",
        emote: "heart",
        ts: Date.now(),
      })
    })
    expect(result.current.floatingEmotes.length).toBe(1)
    expect(result.current.floatingEmotes[0]!.emoji).toBe("❤️")
  })

  it("maps known emote IDs to emoji", () => {
    const { result } = setup(true)
    const emoteIds = ["scream", "heart", "thumbsup", "hourglass"]
    const expected = ["😱", "❤️", "👍", "⏳"]

    for (let i = 0; i < emoteIds.length; i++) {
      act(() => {
        result.current.onWsMessage({
          type: "CHAT_EMOTE",
          gameId: "g1",
          playerId: "p1",
          emote: emoteIds[i]!,
          ts: Date.now(),
        })
      })
      expect(result.current.floatingEmotes[i]!.emoji).toBe(expected[i])
    }
  })

  it("uses raw emote string for unknown emote IDs", () => {
    const { result } = setup(true)
    act(() => {
      result.current.onWsMessage({
        type: "CHAT_EMOTE",
        gameId: "g1",
        playerId: "p1",
        emote: "unknown_emote",
        ts: Date.now(),
      })
    })
    expect(result.current.floatingEmotes[0]!.emoji).toBe("unknown_emote")
  })

  it("ignores non-chat WS messages", () => {
    const { result } = setup(true)
    act(() => {
      result.current.onWsMessage({ type: "PONG" } as WsClientMessage)
      result.current.onWsMessage({
        type: "ERROR",
        code: "ERR",
        message: "bad",
      } as WsClientMessage)
    })
    expect(result.current.messages.length).toBe(0)
    expect(result.current.floatingEmotes.length).toBe(0)
  })

  it("each message gets a unique id", () => {
    const { result } = setup(true)
    act(() => {
      for (let i = 0; i < 5; i++) {
        result.current.onWsMessage({
          type: "CHAT_MSG",
          gameId: "g1",
          playerId: "p1",
          displayName: null,
          text: `msg-${i}`,
          ts: Date.now(),
        })
      }
    })
    const ids = result.current.messages.map((m) => m.id)
    expect(new Set(ids).size).toBe(5)
  })
})
