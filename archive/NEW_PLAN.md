# Revised Plan: Manual Mode + Real-Time Play

## The Pivot

Effects are too complex to automate first. CrossFire ran 13 years with zero automated rules. We build manual-mode-first: the engine enforces game structure, players control everything else directly — just like a real tabletop game.

**Async play is deferred. Real-time (both players live) is the target.**

---

## Core Principle: Players Have Full Board Control

Like CrossFire, each player can right-click any of their own cards to execute outcomes manually. During a pending effect, they can also target opponent cards. Combat levels are manually editable. The engine records everything as moves — deterministic and replayable.

**Engine still enforces (no change):** phase sequencing, legal card plays, formation rules, Rule of the Cosmos, win condition.

**Combat level math stays automated** (ally bonuses, magical item bonuses, world bonus) as a *base* — but players can override the final total manually when a card effect changes it.

---

## New Engine Moves

### Manual Board Control

```ts
// Own cards — always legal (full control of your own board)
| { type: "MANUAL_DISCARD";       cardInstanceId: CardInstanceId }  // any zone → discard
| { type: "MANUAL_TO_LIMBO";      cardInstanceId: CardInstanceId }  // pool champion → limbo
| { type: "MANUAL_TO_ABYSS";      cardInstanceId: CardInstanceId }  // any card → abyss
| { type: "MANUAL_TO_HAND";       cardInstanceId: CardInstanceId }  // discard/abyss → hand
| { type: "MANUAL_RAZE_REALM";    slot: FormationSlot }             // raze own realm
| { type: "MANUAL_DRAW_CARDS";    count: number }                   // draw N cards
| { type: "MANUAL_RETURN_TO_POOL"; cardInstanceId: CardInstanceId } // discard → pool

// Opponent cards — only legal while pendingEffects queue is non-empty
// (triggering player executes effect; opponent can counter-play or accept)
| { type: "MANUAL_AFFECT_OPPONENT"; cardInstanceId: CardInstanceId; action: ManualAction }
// ManualAction = "discard" | "to_limbo" | "to_abyss" | "raze_realm"
```

### Combat Level Override

```ts
// Only legal during combat, for the combat participant
| { type: "MANUAL_SET_COMBAT_LEVEL"; playerId: PlayerId; level: number }
```

This replaces the need to implement level-doubling, penalty, or any combat math effect. Player plays the card → reads the text → types the new total. Both players see the update instantly.

### Counter/Response Window

```ts
| { type: "PASS_RESPONSE" }  // opponent accepts the effect — no counter played
```

No `DISPUTE_EFFECT` needed — if the opponent disagrees, they play a counter card or simply discuss it. The context menu gives them enough tools to undo/adjust the board state themselves.

---

## Interaction Flow

### Playing a text-effect card

```
1. Player A plays card → PendingEffect queued → ResponseWindow opens for Player B
2. Player B sees: card image + text + "Pass (accept)" button + Event cards in hand
3. Player B options:
   a. Play an Event / counter spell from hand → counter resolves, then window re-opens
   b. Click "Pass" (PASS_RESPONSE) → Player A resolves
4. Player A (effect triggering player) executes via:
   - Right-click on any card → context menu with zone actions
   - OR combat level edit field (if in combat)
5. Player A clicks "Effect Done" (SKIP_EFFECT) when finished
```

### Right-click context menu (on own cards, always available)

| Card location | Menu options |
|--------------|--------------|
| Hand | Discard, View |
| Pool champion | Discard, Send to Limbo, Send to Abyss, View |
| Formation realm | Raze, View |
| Formation holding | Discard, View |
| Discard pile | Return to Hand, Return to Pool (champions only) |
| Combat zone | Remove from combat (→ discard) |

Right-clicking opponent's cards during a pending effect adds: Discard (their), Send to Limbo (their champion), Raze (their realm) — whichever is contextually relevant to the card's text.

### Combat level editing

During combat CARD_PLAY phase, the combat panel shows editable level fields. Each player can directly type the new total (replacing the auto-computed value). The edit is submitted as `MANUAL_SET_COMBAT_LEVEL`. Both players see the update live via WebSocket.

---

## WebSocket Architecture

Replace 3-second HTTP polling with Bun-native WebSockets.

**`packages/api/src/ws.ts`** (new file):
- Connection registry: `Map<gameId, Map<playerId, ServerWebSocket>>`
- `ClientMessage`: `JOIN_GAME | SUBMIT_MOVE | PING`
- `ServerMessage`: `STATE_UPDATE | RESPONSE_WINDOW_OPEN | RESPONSE_WINDOW_CLOSED | GAME_OVER | PONG | ERROR`
- Move processing mirrors `routes/moves.ts` but calls `broadcastToGame()` instead of HTTP response
- Keep `routes/moves.ts` for bot games

**`packages/api/src/index.ts`**: add `websocket:` key to Bun.serve export + `/ws` upgrade route in Hono.

**`packages/web/src/api.ts`**: add `createWsClient(gameId, playerId)` factory with auto-reconnect.

**`packages/web/src/pages/Game.tsx`**: replace `useQuery({ refetchInterval: 3000 })` with WebSocket hook. On page load: HTTP GET for initial state → WS for live updates. Move submission becomes `ws.send(SUBMIT_MOVE)`.

---

## Engine Changes Summary

### `types.ts`
- Add `ResponseWindow` interface + `responseWindow: ResponseWindow | null` to `GameState`
- Add `PASS_RESPONSE`, all `MANUAL_*` moves, `MANUAL_SET_COMBAT_LEVEL` to `Move` union
- Add `attackerManualLevel: number | null` and `defenderManualLevel: number | null` to `CombatState` (null = use auto-computed level)
- Add `RESPONSE_WINDOW_OPENED` / `RESPONSE_WINDOW_CLOSED` to `GameEvent`

### `engine.ts`
- Text-effect card handlers: after queuing `PendingEffect` outside combat, also set `responseWindow`, switch `activePlayer` to opponent
- `handlePassResponse()`: clear `responseWindow`, return `activePlayer` to triggering player
- `handleManualDiscard()`, `handleManualToLimbo()`, etc.: execute the zone transition, emit event
- `handleManualAffectOpponent()`: same, but validate `pendingEffects.length > 0`
- `handleManualSetCombatLevel()`: set `attackerManualLevel` or `defenderManualLevel`; combat display uses manual value if set

### `legal-moves.ts`
Priority at top of `getLegalMoves`:
1. If `responseWindow !== null` → only `respondingPlayerId`: `PASS_RESPONSE` + Events in hand
2. Else if `pendingEffects.length > 0` → triggering player: `SKIP_EFFECT` + all `MANUAL_*` moves for any card + `MANUAL_AFFECT_OPPONENT`
3. Else normal; MANUAL_* moves for own cards always included

### `init.ts`
Add `responseWindow: null` to initial state.

---

## UI Changes

### `ResponseWindowOverlay` (new component)
Shown to responding player when `state.responseWindow.respondingPlayerId === myPlayerId`:
- Card image + full text
- "Pass (Accept)" button
- Event cards in hand as quick-counter buttons

### `EventLog` sidebar (new component)
Scrollable log of `GameEvent[]` in human-readable text. Replaces CrossFire's chat for move announcements. Auto-scrolls.

### Card context menu (new)
Right-click (desktop) or long-press (mobile) on any card reveals a context menu. For own cards: always available. For opponent cards: only when `pendingEffects` is non-empty. Built as a floating `<div>` positioned at cursor.

### Combat panel update
Add editable level inputs to the combat panel. When player submits a manual level, it updates via WebSocket immediately.

### `PendingEffectsPanel` update
- Show card image to BOTH players
- When `responseWindow` is open: triggering player sees "Waiting for opponent to respond..."
- When response passed: show context menu hint ("Right-click any card to execute the effect")

---

## Implementation Order

| # | Task | Package |
|---|------|---------|
| 1 | Engine: new types (`ResponseWindow`, `MANUAL_*` moves, `MANUAL_SET_COMBAT_LEVEL`) | engine |
| 2 | Engine: `handlePassResponse`, `handleManual*` handlers, response window logic | engine |
| 3 | Engine: `attackerManualLevel` / `defenderManualLevel` in `CombatState` | engine |
| 4 | API: `ws.ts` WebSocket endpoint + registry | api |
| 5 | API: expose `responseWindow` in GET response | api |
| 6 | Web: replace polling with WebSocket hook | web |
| 7 | Web: card context menu (right-click, own cards) | web |
| 8 | Web: `ResponseWindowOverlay` + enhanced `PendingEffectsPanel` | web |
| 9 | Web: editable combat level inputs in combat panel | web |
| 10 | Web: `EventLog` sidebar | web |
| 11 | Web: opponent card context menu (during pending effect) | web |
| 12 | Auth, lobby, async play (deferred) | all |
| 13 | Automated effects, Group A → B → C (deferred) | engine + data |

---

## Critical Files

| File | Change |
|------|--------|
| `packages/engine/src/types.ts` | `ResponseWindow`, new moves, `MANUAL_SET_COMBAT_LEVEL`, `manualLevel` fields in `CombatState` |
| `packages/engine/src/engine.ts` | Response window logic, all `handleManual*` handlers |
| `packages/engine/src/legal-moves.ts` | Priority chain: responseWindow → pendingEffects → normal; include `MANUAL_*` |
| `packages/engine/src/init.ts` | `responseWindow: null` |
| `packages/api/src/ws.ts` | **NEW**: WebSocket handler, connection registry, broadcast |
| `packages/api/src/index.ts` | Add `websocket:` to Bun.serve, `/ws` upgrade route |
| `packages/web/src/api.ts` | Add `createWsClient()` |
| `packages/web/src/pages/Game.tsx` | WS hook, `ResponseWindowOverlay`, `EventLog`, context menu, editable combat levels |

---

## Verification

1. `bun test` in `packages/engine` — existing 811 lines pass unchanged
2. Two browser tabs:
   - Player A plays text-effect card → Player B immediately sees `ResponseWindowOverlay`
   - Player B plays counter → counter resolves → window re-opens → Player B passes
   - Player A right-clicks opponent card → context menu appears → selects "Discard" → card moves → Player A clicks "Effect Done"
   - Player A in combat plays ally manually types "22" in level field → both panels update instantly
