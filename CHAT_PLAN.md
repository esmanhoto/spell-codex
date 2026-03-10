# Chat & Emotes — Implementation Plan

## Overview

Add in-game text chat + quick emotes. UI: a bottom bar with emote buttons + CHAT toggle; an overlay panel with message history, inline emotes, and text input.

From the screenshots:
- **Bottom bar**: quick-emote buttons + CHAT/CLOSE toggle (sits below the hand area)
- **Chat panel**: slides up from bottom-right, shows messages (left-aligned = others, right-aligned = self), emotes render as large standalone items, text input + send button at bottom
- Emotes: a]scream face, heart, thumbs up, hourglass

---

## 1. API — WebSocket message types

File: `packages/api/src/ws.ts`

### New message types

```ts
// Client → Server
| { type: "CHAT_MSG"; gameId: string; text: string }
| { type: "CHAT_EMOTE"; gameId: string; emote: string }

// Server → Client (broadcast)
| { type: "CHAT_MSG"; gameId: string; playerId: string; text: string; ts: number }
| { type: "CHAT_EMOTE"; gameId: string; playerId: string; emote: string; ts: number }
```

### Handler logic

- On `CHAT_MSG`: validate `ws.data.userId` + `ws.data.gameId` exist (player joined), sanitize text (trim, max 500 chars, reject empty), broadcast to all players in game including sender
- On `CHAT_EMOTE`: validate emote is in allowed set, broadcast to all players
- No DB persistence (chat is ephemeral, lives only during the session)
- Rate limiting: track last message timestamp per socket, reject if < 200ms since last

### Tasks

- [ ] Add `CHAT_MSG` and `CHAT_EMOTE` to `ClientMessage` union
- [ ] Add `CHAT_MSG` and `CHAT_EMOTE` to `ServerMessage` union
- [ ] Add `case "CHAT_MSG"` handler: validate, sanitize, broadcast
- [ ] Add `case "CHAT_EMOTE"` handler: validate emote in allowed list, broadcast
- [ ] Add simple rate-limit check (per-socket timestamp)

---

## 2. Web — Client WS integration

File: `packages/web/src/api.ts`

### Tasks

- [ ] Add `CHAT_MSG` and `CHAT_EMOTE` to the server message type union used by `onMessage`
- [ ] Add `sendChat(text: string)` helper on the WS client object
- [ ] Add `sendEmote(emote: string)` helper on the WS client object

---

## 3. Web — Chat state hook

New file: `packages/web/src/hooks/useChat.ts`

Manages chat message list + integration with WS.

```ts
interface ChatEntry {
  id: string           // crypto.randomUUID() for key
  type: "message" | "emote"
  playerId: string
  text: string         // message text or emote identifier
  ts: number
}
```

### Tasks

- [ ] Create `useChat(wsRef, viewerPlayerId)` hook
- [ ] Internal state: `ChatEntry[]` array (cap at 200 messages, drop oldest)
- [ ] Listen to WS `CHAT_MSG` / `CHAT_EMOTE` events, append to list
- [ ] Expose: `messages`, `sendMessage(text)`, `sendEmote(emote)`, `unreadCount`
- [ ] Track `unreadCount` — increments when panel is closed, resets on open

---

## 4. Web — ChatBar component (bottom bar)

New file: `packages/web/src/components/game/ChatBar.tsx`

The always-visible strip at the bottom of the game screen.

### Layout

```
[ emote1 ] [ emote2 ] [ emote3 ] [ emote4 ]   [ CHAT / CLOSE ]
```

- Fixed row below the player hand area
- Emote buttons: clickable, send emote immediately via WS
- CHAT button: toggles the chat panel open/closed
- When panel open: button text changes to CLOSE
- Unread badge: small counter on CHAT button when panel is closed and unread > 0

### Allowed emotes

```ts
const EMOTES = [
  { id: "scream", emoji: "\ud83d\ude31" },
  { id: "heart",  emoji: "\u2764\ufe0f" },
  { id: "thumbsup", emoji: "\ud83d\udc4d" },
  { id: "hourglass", emoji: "\u23f3" },
] as const
```

### Tasks

- [ ] Create `ChatBar` component
- [ ] Emote buttons row — each calls `sendEmote(id)`
- [ ] CHAT/CLOSE toggle button with gold border style (matching screenshots)
- [ ] Unread count badge
- [ ] Style: dark background, gold accents, matching game theme

---

## 5. Web — ChatPanel component (overlay)

New file: `packages/web/src/components/game/ChatPanel.tsx`

The slide-up overlay showing message history.

### Layout

```
┌─ CHAT ──────────────── [v] ─┐
│                              │
│  Player B                    │
│  ┌──────────┐                │
│  │ Good luck│                │
│  └──────────┘                │
│                              │
│               Player A       │
│          ┌───────────┐       │
│          │ You too! 🌹│      │
│          └───────────┘       │
│                              │
│                   😱  (big)  │
│                   ❤️  (big)  │
│                   👍  (big)  │
│                              │
│ ┌─────────────────────┐ [>] │
│ │ Type a message...   │      │
│ └─────────────────────┘      │
└──────────────────────────────┘
```

### Behavior

- Positioned: fixed, bottom-right, above the ChatBar
- Scrollable message area, auto-scroll to bottom on new messages
- Messages from self: right-aligned, darker bubble
- Messages from others: left-aligned, lighter bubble
- Player name label above each message (or group of consecutive messages)
- Emote entries: rendered as large emoji (no bubble), aligned to sender side
- Text input at bottom: submit on Enter or click send button
- Header: "CHAT" title + collapse chevron
- Close on chevron click or CLOSE button in bar

### Tasks

- [ ] Create `ChatPanel` component
- [ ] Message list rendering with auto-scroll (`useRef` + `scrollIntoView`)
- [ ] Text message bubbles (self vs others alignment)
- [ ] Emote rendering (large emoji, no bubble)
- [ ] Player name labels (use playerOrder names or IDs)
- [ ] Text input with Enter-to-send + send button
- [ ] Slide-up animation (CSS transform)
- [ ] Style consistent with game theme (dark bg, gold text/borders)

---

## 6. Web — Wire into Game page

File: `packages/web/src/pages/Game.tsx`

### Tasks

- [ ] Import `useChat` hook, pass `wsRef`
- [ ] Import `ChatBar` + `ChatPanel`
- [ ] Add `chatOpen` state (boolean)
- [ ] Render `ChatBar` below the player hand
- [ ] Render `ChatPanel` conditionally when `chatOpen`
- [ ] Pass chat message handler into `handleWsMessage` to route `CHAT_MSG`/`CHAT_EMOTE` events
- [ ] Player name resolution: map playerId to display name from game state

---

## 7. Styling

New file: `packages/web/src/components/game/chat.css`

### Tasks

- [ ] ChatBar styles: dark bg (#1a1a2e or similar), flex row, gap, padding
- [ ] Emote buttons: transparent bg, hover glow, cursor pointer
- [ ] CHAT button: gold border, uppercase tracking, hover state
- [ ] Unread badge: small red circle with count
- [ ] ChatPanel: semi-transparent dark bg, rounded top corners, max-height 50vh
- [ ] Message bubbles: rounded corners, subtle bg difference for self/other
- [ ] Player labels: small, gold/muted color
- [ ] Emote display: ~48px emoji, no bubble
- [ ] Input area: dark input, gold border, send icon button
- [ ] Slide animation: `transform: translateY(100%)` → `translateY(0)`

---

## 8. Tests

### API tests

File: `packages/api/src/__tests__/chat-ws.test.ts`

- [ ] `CHAT_MSG` broadcast: send message, verify all players in game receive it
- [ ] `CHAT_MSG` validation: empty text rejected, over 500 chars truncated/rejected
- [ ] `CHAT_MSG` requires joined game (not-joined socket gets error)
- [ ] `CHAT_EMOTE` broadcast: send emote, verify all players receive it
- [ ] `CHAT_EMOTE` validation: invalid emote ID rejected
- [ ] Rate limiting: rapid messages get throttled

### Web component tests (if test infra exists)

- [ ] `ChatBar`: emote buttons call `sendEmote`, CHAT toggle works
- [ ] `ChatPanel`: messages render correctly, auto-scroll, input sends on Enter
- [ ] `useChat`: messages accumulate, unread count tracks, cap at 200

---

## 9. Multi-player considerations (4-6 players)

Since the WS registry is already `gameId → Map<playerId, socket>`, broadcast fans out to all players automatically. No changes needed for multiplayer support.

- Player name labels become essential to distinguish 4-6 speakers
- Consider color-coding per player (assign colors from a palette based on playerOrder index)
- Chat panel may need slightly more height for busy conversations

---

## Implementation order

1. API: WS message types + handlers (step 1)
2. Web: WS client helpers (step 2)
3. Web: `useChat` hook (step 3)
4. Web: `ChatBar` component + styles (step 4, 7)
5. Web: `ChatPanel` component + styles (step 5, 7)
6. Web: wire into Game page (step 6)
7. Tests (step 8)

Estimated effort: ~1.5 days
