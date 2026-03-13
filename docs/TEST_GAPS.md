# Test Gaps

Tests that should be written at some point, grouped by package. Each entry has enough context to implement without needing to re-investigate.

---

## Engine (`packages/engine`)

### Full combat move sequence

**What's missing:** The combat math is tested (level calculation, round resolution), and realm-self-defense scenarios exercise a few moves, but no test drives the full sequence from `DECLARE_ATTACK` through to outcome.

**What to test:**

- `DECLARE_ATTACK` → legal moves switch to `DECLARE_DEFENSE` / `DECLINE_DEFENSE` for the defending player
- `DECLARE_DEFENSE` → combat enters `AWAITING_RESOLUTION`; defender champion is assigned
- `DECLINE_DEFENSE` → realm defends itself; attacker wins if level > realm level
- `CONTINUE_ATTACK` after a round win → another round starts
- `END_ATTACK` → combat ends without resolving; no raze
- Champion razed on loss: removed from pool, moved to appropriate zone
- Realm razed: `isRazed = true`, pool cleared if all realms are razed (zero-realm → game over)

**How:** Extend `combat.test.ts` or add `test/scenarios/combat-flow.test.ts`. Use the existing `playGame()` helper pattern or build a minimal state with `initGame` + manual moves.

---

### `ATTACH_ITEM` and `PLAY_HOLDING`

**What's missing:** Both moves are legal-move types and applied in the engine, but no unit test covers them.

**What to test for `ATTACH_ITEM`:**

- Item removed from hand
- Item appears in `pool[champion].attachments`
- Throws when champion not in pool
- Throws when card is not a magical item type

**What to test for `PLAY_HOLDING`:**

- Holding removed from hand
- Holding appears in `formation[slot].holdings`
- Throws when slot doesn't exist or is razed
- Throws when card is not a holding type

**How:** Add cases to `moves.test.ts`. Both need a state with the right card types in hand.

---

### `RETURN_FROM_DISCARD`

**What's missing:** No test for returning a card from discard pile back to hand, deck, or pool.

**What to test:**

- Card removed from `discardPile`
- Destination `"hand"`: card appears in hand
- Destination `"deck"`: card appears at top of draw pile
- Destination `"pool"`: card appears as pool champion (no attachments)
- Throws when `cardInstanceId` not in discard pile
- Only legal when a resolution context grants it (resolver's legal moves include it)

**How:** Add to `resolution.test.ts`. Requires a state with a card in the discard pile and an active resolution context.

---

### `PLAY_COMBAT_CARD`, `DISCARD_COMBAT_CARD`

**What's missing:** Combat cards (spells/events played during combat) go into `combatState.attackerCards` / `defenderCards`. No move test exercises this.

**What to test:**

- Card removed from hand, added to `attackerCards` or `defenderCards`
- Level recalculates after card is added (covered by `calculateCombatLevel` unit tests, but not the move itself)
- `DISCARD_COMBAT_CARD`: card removed from combat side, added to discard
- Throws when not in combat phase

**How:** Add to `combat.test.ts` or a new `test/scenarios/combat-cards.test.ts`.

---

### Rule of the Cosmos (uniqueness enforcement)

**What's missing:** The Rule of the Cosmos prevents the same realm or champion (by `typeId`) from existing twice across all players' boards simultaneously. No test covers this constraint.

**What to test:**

- `PLAY_REALM`: rejected if same `typeId` already in play (either player)
- `PLACE_CHAMPION`: rejected if same `typeId` already in pool (either player)
- Allowed after the original is removed (razed realm, champion killed)

**How:** Add a `test/scenarios/rule-of-cosmos.test.ts`. Set up a state where player A already has a realm/champion of type X in play, then verify player B's attempt to play the same type fails with `EngineError`.

---

### Zero-realm win condition

**What's missing:** `resolution.test.ts` has "zero-realm condition clears pool when all realms razed" but it's not clear the `winner` field is set correctly and the game ends.

**What to test:**

- After razeing the last realm, `state.winner === attackingPlayerId`
- `phase` transitions appropriately (game over)
- No further moves are legal

**How:** Add a case to `resolution.test.ts` after the existing zero-realm test.

---

## API (`packages/api`)

### WS `SUBMIT_MOVE` → `MOVE_APPLIED` broadcast

**What's missing:** This is the most critical untested path. The entire Phase 6 broadcast change (server sends `MOVE_APPLIED` instead of `STATE_UPDATE` per player) has no automated test. `chat-ws.test.ts` shows the pattern for WS testing.

**What to test:**

- Player submits a valid move via `{ type: "SUBMIT_MOVE", gameId, move }` over WS
- All sockets in that game room receive a `MOVE_APPLIED` message (not `STATE_UPDATE`)
- `MOVE_APPLIED` contains `playerId`, `move`, `stateHash`, `sequence`, `status`, `winner`, `turnDeadline`
- `sequence` increments by 1 on each move
- Second player submitting a move also broadcasts `MOVE_APPLIED` to both sockets
- Invalid move (e.g. out-of-turn) broadcasts `ERROR` not `MOVE_APPLIED`
- `stateHash` in `MOVE_APPLIED` matches what `hashState` would produce for the resulting state

**How:** Follow the pattern in `chat-ws.test.ts` — create a game via HTTP, open two WS connections (one per player), JOIN_GAME on both, then send a SUBMIT_MOVE from player 1 and assert both sockets receive the right message.

```typescript
// Rough shape (see chat-ws.test.ts for the full helper pattern)
describe("SUBMIT_MOVE", () => {
  it("broadcasts MOVE_APPLIED to all players in the game", async () => {
    // 1. POST /games → gameId
    // 2. ws1.send JOIN_GAME (player A)
    // 3. ws2.send JOIN_GAME (player B)
    // 4. ws1.send SUBMIT_MOVE { type: "PASS" }  (first legal move)
    // 5. assert ws1 and ws2 both receive MOVE_APPLIED
    // 6. assert MOVE_APPLIED.move.type === "PASS"
    // 7. assert MOVE_APPLIED.sequence === 1
  })
})
```

---

### `SYNC_REQUEST` handler

**What's missing:** When a client sends `{ type: "SYNC_REQUEST", gameId }`, the server should respond with a full `STATE_UPDATE` including `rawEngineState`. Not tested.

**What to test:**

- Client sends `SYNC_REQUEST` after joining a game
- Receives `STATE_UPDATE` with `rawEngineState` present (not null/undefined)
- `STATE_UPDATE.state` is a valid game state for the requesting player (opponent hand hidden)
- `STATE_UPDATE.sequence` matches the current sequence number

**How:** Same WS test pattern. Join a game, play one move, then send `SYNC_REQUEST` and assert the response.

---

### State cache: miss → populate → hit

**What's missing:** The in-memory cache (`state-cache.ts`) is exercised by the HTTP game tests indirectly, but the cache behavior (first move triggers full reconstruction, subsequent moves are cache hits with zero DB reads) is not explicitly asserted.

**What to test:**

- First move: cache is cold → `cache_hit: false` (check the perf log or expose a test hook)
- Second move: `cache_hit: true`
- After cache eviction (hard to test without exposing internals): falls back correctly

**How:** Either expose a `getCacheEntry(gameId)` function from `state-cache.ts` (test-only export), or test it indirectly via timing (cache hit should be <5ms, cold start is >50ms). The indirect approach is fragile on slow CI; the test export is cleaner.

---

## Web (`packages/web`)

### What is React Testing Library?

React Testing Library (RTL) lets you render React components in a simulated browser (jsdom) and interact with them programmatically — click buttons, assert text appears, simulate WS messages arriving. It's the standard tool for testing React component logic without running a real browser (that's what Playwright is for).

**Setup needed:**

```bash
bun add -d @testing-library/react @testing-library/user-event jsdom
```

Then configure Bun's test runner to use jsdom as the DOM environment. RTL tests live alongside components, e.g. `Game.test.tsx`.

**Why not just use Playwright for all of this?** Playwright is great for full user flows (create game, play moves, verify board). RTL is better for testing specific wiring logic (does rollback happen when WS sends ERROR?) without needing a running server and two browser windows.

---

### `Game.tsx` — `MOVE_APPLIED` handler

**What to test:** When a `MOVE_APPLIED` WS message arrives, the client applies the move locally via the bundled engine and updates the React query cache.

**Specific cases:**

- `MOVE_APPLIED` for a valid move updates the displayed board state (e.g. a realm appears in formation)
- `MOVE_APPLIED` with no local engine state (`localEngineStateRef === null`) triggers `sendSyncRequest`
- `MOVE_APPLIED` with a hash mismatch triggers `sendSyncRequest`
- `MOVE_APPLIED` preserves `deckCardImages` and `players` from the initial load (they're not in the delta)

**How:** Render `<Game>` with a mocked WS client and mocked TanStack Query. Pre-seed the query cache with an initial game state and a `localEngineStateRef`. Fire a simulated `MOVE_APPLIED` message and assert the query cache was updated with the new state.

---

### `Game.tsx` — Optimistic UI wiring

**What to test:** When `sendMove` is called, optimistic state is applied immediately before the WS send.

**Specific cases:**

- `sendMove({ type: "PLAY_REALM", cardInstanceId, slot })` → card instantly disappears from hand and appears in formation without waiting for `MOVE_APPLIED`
- If WS sends `ERROR` → board reverts to pre-move state (`lastConfirmedStateRef` restored)
- If WS sends `STATE_UPDATE` → optimistic state is replaced with authoritative state, `lastConfirmedStateRef` cleared

**How:** Same RTL setup as above. Mock the WS client so `sendMove` doesn't actually open a socket. Assert query cache changes synchronously on `sendMove`, then simulate an `ERROR` message and assert the rollback.

---

### `Game.tsx` — `STATE_UPDATE` initializes local engine state

**What to test:** When a `STATE_UPDATE` arrives with `rawEngineState`, `localEngineStateRef.current` is populated so subsequent `MOVE_APPLIED` messages can be applied locally.

**Specific cases:**

- `STATE_UPDATE` with `rawEngineState` → `localEngineStateRef.current !== null` after handling
- `STATE_UPDATE` without `rawEngineState` → `localEngineStateRef.current` unchanged (don't overwrite a valid state with null)

**How:** RTL test with a mocked WS. Simulate a `STATE_UPDATE` message and inspect the ref (expose it via a `data-testid` or a test-only prop, or just assert downstream behavior — a subsequent `MOVE_APPLIED` succeeds without triggering `sendSyncRequest`).

---

## Priority

If you were to pick one gap to fix first, it's the **API WS `SUBMIT_MOVE` test** — it's the highest-traffic path in the app, was rewritten in Phase 6, and is completely uncovered. The engine combat flow is next because it covers the most complex gameplay logic.
