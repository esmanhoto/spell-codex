# Performance Optimization Plan

Current bottlenecks: ~~full state replay on every move (O(N²) server)~~, partial frontend memoization (context split done, component memo incomplete), no optimistic UI, full state broadcast over WS, ~~no image caching~~.

Goal: make the game feel snappy even on a low-performance free-tier server, and scale to 4-6 players.

---

## Phase 1 — Instrumentation & Baselines ✅ DONE

Before changing anything, measure everything. Establish baselines locally and on Koyeb so every subsequent phase has concrete before/after numbers.

Koyeb streams `stdout`/`stderr` to its dashboard log viewer in real-time — no extra logging infra needed. Just `console.log` structured JSON.

Local measurements show relative improvements; Koyeb measurements show the real-world impact. On 0.1 vCPU, a 200ms local reconstruction might be 2-3 seconds — the bottlenecks are amplified, which is exactly why remote numbers matter most.

### 1.1 Server-side timing logs ✅

Added `performance.now()` instrumentation to the WS move handler and HTTP move endpoint. Log a structured JSON line on every move:

```json
{
  "perf": "move",
  "game": "abc-123",
  "seq": 42,
  "move_type": "PLAY_REALM",
  "cache_hit": true,
  "actions_replayed": 41,
  "reconstruct_ms": 182,
  "apply_move_ms": 0.4,
  "hash_ms": 0.4,
  "serialize_ms": 0.8,
  "broadcast_bytes": 24310,
  "total_ms": 290
}
```

Fields:

- `reconstruct_ms` — time for DB queries + reconstruction (with cache: just DB queries; without: full replay)
- `apply_move_ms` — engine `applyMove()` execution time
- `hash_ms` — time to compute state hash (`JSON.stringify` + SHA-256)
- `serialize_ms` — time to serialize state for WS broadcast (per-player visibility filtering + `getLegalMoves()`)
- `broadcast_bytes` — size of STATE_UPDATE JSON payload sent over WS
- `cache_hit` — whether the in-memory state cache was used (true = no reconstruction)
- `actions_replayed` — number of actions replayed during reconstruction (tracks linear growth)
- `total_ms` — full request lifecycle

These logs appear in Koyeb dashboard. Filter by `"perf":"move"` to extract them.

### 1.2 Client-side performance marks ✅

Added `performance.mark()` / `performance.measure()` in the WS message handler:

- `ws_message_to_render_ms` — time from WS `onmessage` to React commit

Log to `console.log` with `[perf]` prefix.

### 1.3 Performance benchmark tests ✅

Added to `packages/engine/src/__tests__/perf.test.ts` and `packages/api/src/__tests__/perf.test.ts`. Run with `bun test` like everything else. Tag with `describe("perf:` so they can be filtered.

### 1.4 Benchmark export ✅

Benchmarks write results to `benchmarks/` at the project root. Also includes `scripts/parse-server-perf.ts` to parse Koyeb server logs into structured JSON.

```bash
# Local benchmarks
PERF_LABEL=baseline bun test --filter perf

# Parse Koyeb logs
bun run perf:parse benchmarks/phase3-koyeb-server.txt --out benchmarks/phase3-koyeb-server.json
```

### 1.5 Client render profiling (manual, dev-only)

Not automated — use React DevTools Profiler during a real game session. Not yet done.

---

## Phase 2 — Frontend Optimizations ✅ PARTIALLY DONE

### 2.1 Split GameContext ✅

Split into 4 contexts: **BoardContext**, **CombatContext**, **MovesContext**, **UIContext**. All context values memoized with `useMemo`. Components subscribe only to what they need.

### 2.2 React.memo on heavy components ⚠️ PARTIAL

Only `CardComponent` and `EventLog` wrapped with `memo()`. No custom comparison functions — memo is ineffective when parent components pass inline-created functions/objects as props (which they do).

**Remaining:** Formation, PlayerHand, CombatZone, PoolEntry still not memoized. The memo on CardComponent needs either custom comparator or memoized parent props to be effective.

### 2.3 useMemo / useCallback for derived data ⚠️ PARTIAL

Done:
- `collectTargets()` in ResolutionPanel — memoized
- `isCardAlreadyInPlay()` in Formation — wrapped in useCallback
- `processIncomingEvents()` — wrapped in useCallback
- Context value objects memoized

Not done:
- `fanTransform()` in PlayerHand — still inline per card per render
- Parent components (Formation, PlayerHand, Pool) still create inline functions passed to CardComponent, defeating its memo

### 2.4 Image lazy loading ❌ REVERTED

`loading="lazy"` was added but **contradicts the pre-cache** — lazy loading adds intersection observer delay even when images are already in browser cache. Removed in favor of the pre-cache strategy (Phase 3.2). Cards that appear suddenly (drawing 3 cards) need instant display from cache, not lazy-load delay.

### 2.5 AttackLine RAF optimization

Not yet implemented.

---

## Phase 3 — Caching ✅ DONE

### 3.1 HTTP Cache-Control on card images ✅

```
Cache-Control: public, max-age=31536000, immutable
```

First load is slow, every subsequent load is instant from browser disk cache.

### 3.2 Game loading screen with full deck pre-caching ✅

Loading screen blocks game board until all card images are cached.

**Implementation:**
- Server includes `deckCardImages: Array<[setId, cardNumber]>` in the initial game state response (HTTP GET and WS JOIN_GAME only — not on move broadcasts)
- `deckCardImages` contains all unique cards from both players' full decks (`hand + drawPile` = 55 cards each, ~110 unique images)
- Client creates `new Image()` for each URL, shows progress bar
- Game board renders only after all images loaded

This ensures every card image that could appear during the game is already in browser cache. No lag when drawing cards, playing realms, or entering combat.

### 3.3 In-memory game state cache (server) ✅

`Map<gameId, { state, sequence, playerIds, seed, stateSnapshot }>` in the API process (`packages/api/src/state-cache.ts`).

- First move: cache miss → reconstruct from DB → populate full cache (state + metadata) → apply move → update cache
- Subsequent moves: cache hit → **zero DB reads** before move application
- Evict on game end or after 30min inactivity (timer with `.unref()`)
- Used in both WS move handler and HTTP move endpoint
- JOIN_GAME also populates full cache on first connect

**Koyeb results (86-move game):**
- `cache_hit: true` on every move after first
- Phase 0 at move 67: reconstruct was 1017ms. Phase 3 at move 74: 179ms (still DB overhead). **~6x improvement in late game.**

### 3.4 Cache game metadata to eliminate per-move DB reads ✅

After 3.3, `reconstruct_ms` was still ~180ms on every cache hit — 3 DB queries (`getGame`, `getGamePlayers`, `lastSequence`) running unconditionally. These are now stored in the cache entry alongside the game state.

**Implementation:**
- `getGameCache(gameId)` returns `{ state, sequence, playerIds }` — enough to validate auth and apply move with zero DB reads
- On cache hit: only DB operation is the `saveAction` write + `setGameStatus`/`touchGame` post-move
- On cache miss: falls back to full DB path, populates complete cache entry

**Expected impact:** `reconstruct_ms` drops from ~180ms to ~0ms on cache hit. Total per-move time should drop from ~290ms to ~100-150ms on Koyeb.

This is good practice regardless of infrastructure — even with co-located DB, eliminating unnecessary reads reduces load and latency. It applies equally well on Oracle VM.

---

## Phase 3 Results — Koyeb Benchmarks

**Phase 0 baseline** (69 moves) vs **Phase 3+3.4** (86 moves):

| Metric | Phase 0 | Phase 3 | Change |
|--------|---------|---------|--------|
| total_ms avg | 562 | 332 | **-41%** |
| total_ms p50 | 473 | 295 | **-38%** |
| total_ms p95 | 973 | 504 | **-48%** |
| total_ms max | 1712 | 628 | **-63%** |
| reconstruct_ms p95 | 701 | 379 | **-46%** |
| reconstruct_ms max | 1018 | 397 | **-61%** |
| apply_move_ms avg | 2.35 | 0.39 | **-83%** |

Key insight: Phase 0 performance **degrades linearly** with game length (every move replays the full history). Phase 3 performance is **flat** — move 74 is as fast as move 0.

Note: benchmarks above reflect 3.1–3.3 only. 3.4 (metadata cache) was not yet deployed — next Koyeb run should show `reconstruct_ms` near 0 on cache hit.

---

## Phase 4 — Engine Refactoring

### 4.1 Skip hash verification on read

Currently, reconstruction replays every action AND verifies the SHA-256 hash at each intermediate step. This means `JSON.stringify(fullGameState)` + SHA-256 on every intermediate state.

Change: only compute and verify the hash on **write** (when saving a new action). On reconstruction, trust the replay — if the engine is deterministic (it is), the output is correct by definition.

This roughly halves reconstruction time when it does happen (server restart, cache miss).

### 4.3 Exclude events from state hash

The events array grows every turn and gets included in the JSON used for hashing. Since events are derived (they're generated by the engine from moves), they don't need to be in the integrity hash.

Hash only the "board state" portion: players, formations, pools, hands, combat, phase, turn. This prevents hash cost from growing linearly with game length.

### 4.4 Delta state updates over WebSocket

Instead of sending the full serialized state (15-60KB) on every move:

- Send the move + resulting events only (~200-500 bytes)
- Client applies the move locally using its own engine copy (see Phase 6)
- Fall back to full state sync if client gets out of sync

Critical for 4-6 player scaling: current approach would send 60KB × 6 players = 360KB per move.

---

## Phase 5 — Optimistic UI

### 5.1 Instant local state update on move submission

When the player makes a move:

1. **Immediately** update local React state as if it succeeded
2. Send move to server in background
3. Server confirms via WS → state already matches, no visual flicker
4. Server rejects → rollback to last confirmed state

Safe because the client already has `legalMoves` — if the move is legal, it will succeed.

### 5.2 Move-specific optimistic handlers

Start with the most common and visually impactful moves:

- **PLAY_REALM** — move card from hand to formation slot instantly
- **PLACE_CHAMPION** — move card from hand/pool to formation slot
- **ATTACH_ITEM/ARTIFACT** — attach card to champion in pool
- **DRAW_CARD** — increment hand count, show card back placeholder
- **PASS** — advance phase indicator immediately

Combat moves (DECLARE_ATTACK, PLAY_COMBAT_CARD) are trickier due to opponent interaction — implement these after the simple ones.

### 5.3 Rollback mechanism

Keep a `lastConfirmedState` ref. On optimistic update, store the pre-update state. If server rejects (error response or WS sends different state), revert to `lastConfirmedState` and show a brief "move rejected" indicator.

For a turn-based card game, rejection is rare (player can only make legal moves), so the rollback path is an edge case, not the common path.

---

## Phase 6 — Client-Side Engine

### 6.1 Bundle @spell/engine in the web client

The engine is pure TypeScript with zero dependencies — it can run in the browser as-is. Vite will bundle it automatically since it's a workspace package.

This enables:

- Client-side legal moves calculation (remove from server payload)
- Client-side move application (for optimistic UI and delta updates)
- Client-side state validation (detect desyncs)

### 6.2 Client-side legal moves

Instead of server computing `getLegalMoves()` and including it in every STATE_UPDATE payload:

- Client computes legal moves locally using its own engine copy
- Server no longer serializes legal moves (saves CPU + bandwidth)
- Legal moves are available instantly after state change (no round-trip)

This also reduces STATE_UPDATE payload by ~30-50%.

### 6.3 Client applies moves locally

Combined with delta updates (4.4) and optimistic UI (Phase 5):

1. Player makes a move → client applies via engine instantly
2. Move sent to server → server validates → broadcasts move (not full state)
3. Other player's client receives move → applies via engine locally
4. Both clients now have the new state without receiving 60KB

Server becomes the authority and validator, not the renderer. Classic multiplayer game architecture (client-side prediction with server reconciliation).

### 6.4 Hash reconciliation

Client computes state hash after applying a move. Server includes authoritative hash in its response. If hashes match → all good. If mismatch → client requests full state sync. In practice, mismatches should never happen since the engine is deterministic.

---

## Phase 7 — Infrastructure (Oracle Cloud)

Last phase — by this point the app should already be fast. This is about headroom and reliability.

### 7.1 Oracle Cloud Free Tier VM

Oracle's "always free" A1.Flex: 4 ARM cores, 24GB RAM. Vastly more powerful than any free container platform.

- Install Docker + Coolify (open-source PaaS) for easy deploys
- Host both the app and Postgres on the same machine → zero DB network latency
- WebSocket connections are stable (no cold starts, no sleep after 15min)

### 7.2 Co-locate app and database

On Koyeb/Render/Fly, the DB is usually a separate service with network latency. On Oracle VM, run Postgres in Docker on the same machine. DB queries go through localhost — sub-millisecond latency.

Even with in-memory cache, writes still hit the DB — co-location keeps those fast.

### 7.3 Deployment pipeline

Set up GitHub Actions → build Docker image → push to Oracle VM via SSH or registry. Coolify handles this automatically on push to main.

---

## Error Handling & Resilience

Performance optimizations must not make the system less safe. These concerns cut across multiple phases and should be addressed as each phase is implemented, not deferred.

### Browser tab sleep / background throttling

Mobile browsers and background tabs throttle or pause WebSocket connections. When the tab wakes up, the client might be several moves behind.

**Solution:** Track the last known `sequence` number on the client. When the WS reconnects (or on `visibilitychange` event), send a `SYNC_REQUEST` with the client's last sequence. Server responds with either:

- All moves since that sequence (if delta mode, Phase 4+)
- Full state (if gap is too large or pre-delta)

This is needed regardless of optimization work — it's a bug fix for the current architecture too.

**Relevant phases:** 4 (delta updates), 6 (client-side engine)

### Page refresh mid-game

Client loses all in-memory state. Must be able to fully reconstruct from server on fresh load.

**Solution:** The initial HTTP GET `/games/:id` already returns full state. This continues to work as-is. After Phase 6 (client-side engine), the client also needs the full action history or a recent snapshot to initialize its local engine copy. The game loading screen (Phase 3) is the natural place for this — fetch state, initialize engine, then enter the game.

**Relevant phases:** 3 (loading screen), 6 (client engine init)

### In-memory cache invalidation

With server-side state cache (Phase 3-4), the cache IS the source of truth for active games. If it gets corrupted somehow, the game is broken until cache eviction triggers a fresh reconstruction.

**Solution:**

- Hash-on-write (Phase 4) catches corruption at persist time — if hash doesn't match expected, log an error and force reconstruction from DB
- Never mutate the cached state directly — always replace with the new state returned by `applyMove()`
- On any engine error (EngineError throw), evict the cache entry and reconstruct from DB before retrying

**Relevant phases:** 3 (cache), 4 (hash-on-write)

### Optimistic move rejection

The game is turn-based: only one player acts at a time, with the sole exception of event cards. Even events go through the server's `enqueueMove()` serialization, so true simultaneous submissions can't conflict — one gets processed first, the other validates against the updated state.

The only realistic rejection: player submits a move, but an opponent's event card (played moments earlier) already changed the board. This is rare.

**Solution:** Simple rollback — snap to the server's authoritative state. No conflict resolution needed. Show a brief visual indicator ("move rejected") so the player knows to re-evaluate. The `lastConfirmedState` ref from Phase 5 handles this.

**Relevant phases:** 5 (optimistic UI), 6 (client engine)

### WS disconnect during optimistic move

Player clicks, optimistic UI updates instantly, but the WS is down and the move never reaches the server.

**Solution:** Track pending (unconfirmed) moves. If WS disconnects while moves are pending:

1. On reconnect, re-submit pending moves in order
2. If server rejects (state diverged), rollback to last confirmed state
3. Show a "reconnecting..." indicator while WS is down — player knows not to trust the screen

The `sequence` number makes this safe: server rejects any move with an unexpected sequence.

**Relevant phases:** 5 (optimistic UI)

---

## Implementation Notes

- ~~Phase 1 must be completed first~~ ✅ Done
- After each phase, re-run benchmarks and compare against baselines. Update the benchmark thresholds to lock in gains
- ~~Phases 2-3 are pure improvements with no architectural risk~~ ✅ Done (Phase 2 partial, Phase 3 complete)
- Phase 4 is next: reduce DB queries (biggest current bottleneck), then hash/engine optimizations
- Phases 5-6 are the biggest UX transformation — implement together since optimistic UI benefits enormously from having the engine on the client
- Phase 7 is infrastructure only, no code changes beyond Dockerfile/deploy config
- All phases benefit the future 4-6 player mode; especially delta updates (4.4) and client-side engine (6.x)
- Error handling items should be implemented alongside their relevant phases, not as a separate effort

### Lessons learned from Phase 2-3

- **`loading="lazy"` contradicts pre-caching.** If you pre-cache images, don't also lazy-load them — lazy loading adds intersection observer delay even on cached images.
- **Pre-cache the full deck, not just visible cards.** Cards drawn mid-game weren't in the initial visible state. Including `deckCardImages` from the server (all 110 cards) ensures no image ever lags.
- **React hooks must be unconditional.** The context split introduced a `useMemo` after early returns in ResolutionPanel — caused a production crash (React error #300).
- **`reconstruct_ms` includes DB overhead, not just reconstruction.** Even with cache hit, 3 DB queries cost ~180ms on Koyeb. This is now the dominant bottleneck, not the engine.
