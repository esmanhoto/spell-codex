# Performance Optimization Plan

Current bottlenecks: full state replay on every move (O(N²) server), zero frontend memoization, no optimistic UI, full state broadcast over WS, no image caching.

Goal: make the game feel snappy even on a low-performance free-tier server, and scale to 4-6 players.

---

## Phase 1 — Instrumentation & Baselines

Before changing anything, measure everything. Establish baselines locally and on Koyeb so every subsequent phase has concrete before/after numbers.

Koyeb streams `stdout`/`stderr` to its dashboard log viewer in real-time — no extra logging infra needed. Just `console.log` structured JSON.

Local measurements show relative improvements; Koyeb measurements show the real-world impact. On 0.1 vCPU, a 200ms local reconstruction might be 2-3 seconds — the bottlenecks are amplified, which is exactly why remote numbers matter most.

### 1.1 Server-side timing logs

Add `performance.now()` instrumentation to the WS move handler and HTTP move endpoint. Log a structured JSON line on every move:

```json
{
  "perf": "move",
  "game": "abc-123",
  "seq": 42,
  "actions_replayed": 41,
  "reconstruct_ms": 312,
  "apply_move_ms": 4,
  "hash_ms": 18,
  "serialize_ms": 12,
  "broadcast_bytes": 24310,
  "total_ms": 358
}
```

Fields:

- `reconstruct_ms` — time to replay all actions from DB (should drop to ~0 after in-memory cache in Phase 4)
- `apply_move_ms` — engine `applyMove()` execution time
- `hash_ms` — time to compute state hash (`JSON.stringify` + SHA-256)
- `serialize_ms` — time to serialize state for WS broadcast (per-player visibility filtering + `getLegalMoves()`)
- `broadcast_bytes` — size of STATE_UPDATE JSON payload sent over WS
- `actions_replayed` — number of actions replayed during reconstruction (tracks linear growth)
- `total_ms` — full request lifecycle

These logs appear in Koyeb dashboard. Filter by `"perf":"move"` to extract them.

### 1.2 Client-side performance marks

Add `performance.mark()` / `performance.measure()` in the WS message handler and move submission flow:

- `move_submit_to_ws_ack_ms` — time from user action (button click / drag drop) to receiving the confirming STATE_UPDATE via WS. This is the latency the player **feels**
- `ws_message_to_render_ms` — time from WS `onmessage` to React commit (use `requestAnimationFrame` callback after `setQueryData` to detect paint)
- `image_load_complete_ms` — time from state update to all newly-visible card images loaded

Log to `console.log` in dev. In production, optionally batch and POST to a `/perf` endpoint on the server (lightweight — just append to Koyeb logs).

### 1.3 Performance benchmark tests

Add to `packages/engine/src/__tests__/perf.test.ts` and `packages/api/src/__tests__/perf.test.ts`. Run with `bun test` like everything else. Tag with `describe("perf:` so they can be filtered.

**Engine benchmarks (`packages/engine`):**

- `perf: applyMove throughput` — play a full synthetic game (100+ moves using legal moves from `getLegalMoves`), measure total time. Establishes engine-only baseline
- `perf: getLegalMoves scaling` — measure `getLegalMoves()` on empty board, mid-game board (3 realms, 2 champions, hand of 8), full board. Tracks how board complexity affects legal-move computation
- `perf: hashState scaling` — measure `hashState()` on states with 10, 50, 200 accumulated events. Quantifies the event-log growth cost

**API benchmarks (`packages/api`):**

- `perf: reconstruction scaling` — create a synthetic game with 50, 100, 200 moves in DB. Measure `reconstructState()` wall time for each. Assert thresholds (e.g., <200ms for 50 moves locally)
- `perf: serialization size` — serialize a mid-game state for both players, assert payload stays under 30KB per player for 2-player games
- `perf: end-to-end move` — submit a move via the handler, measure total time including DB read/write. Closest to real-world server cost

These are benchmarks, not correctness tests. They log timing numbers and fail only if a hard threshold is exceeded (regression guard). Update thresholds as phases improve performance.

### 1.4 Benchmark export

Benchmarks write results to `benchmarks/` at the project root. One JSON file per run, named `{date}_{label}.json`:

```
benchmarks/
  2026-03-12_baseline.json
  2026-03-18_phase2-frontend.json
  2026-03-22_phase3-caching.json
```

Each file has the same structure so any two can be diffed:

```json
{
  "label": "baseline",
  "date": "2026-03-12",
  "engine": {
    "applyMove_100_moves_ms": 45,
    "applyMove_per_move_avg_ms": 0.45,
    "getLegalMoves_empty_ms": 0.2,
    "getLegalMoves_midgame_ms": 1.8,
    "getLegalMoves_fullboard_ms": 4.1,
    "hashState_10_events_ms": 2,
    "hashState_50_events_ms": 8,
    "hashState_200_events_ms": 31
  },
  "api": {
    "reconstruct_50_moves_ms": 120,
    "reconstruct_100_moves_ms": 380,
    "reconstruct_200_moves_ms": 1420,
    "serialize_payload_bytes_playerA": 18200,
    "serialize_payload_bytes_playerB": 15800,
    "end_to_end_move_ms": 95
  }
}
```

The test runner writes this file automatically at the end of the benchmark suite. Pass the label via env var:

```bash
PERF_LABEL=baseline bun test --filter perf
```

Defaults to `unlabeled` if not set. Commit the JSON files to git — they're small and the diff history is the whole point.

To compare two runs quickly:

```bash
diff benchmarks/2026-03-12_baseline.json benchmarks/2026-03-18_phase2-frontend.json
```

Or read them side by side in any JSON viewer.

### 1.5 Client render profiling (manual, dev-only)

Not automated — use React DevTools Profiler during a real game session:

- Record a sequence of 10 moves
- Note: total render time per state update, number of components that re-rendered, which components are most expensive
- Save the profiler trace as baseline. Compare after Phase 2 (frontend optimizations)

---

## Phase 2 — Frontend Optimizations

React renders the entire component tree on every state update. No memoization anywhere.

### 2.1 Split GameContext

GameContext carries 37 values in a single context. Any change to any value re-renders every consumer.

Split into smaller contexts by domain:

- **BoardContext** — playerA/B boards, formation, pool, hands, lingeringSpells
- **CombatContext** — combat state, resolutionContext
- **MovesContext** — legalMoves, legalMovesPerPlayer, activePlayer, phase, turnNumber
- **UIContext** — selectedId, onSelect, contextMenu, warnings, rebuildTarget, spellCast

Components only subscribe to what they need. A warning modal change no longer re-renders the formation.

### 2.2 React.memo on heavy components

Wrap these with `React.memo` + proper comparison:

- `Formation` — 6 slots × holdings, re-renders on every parent update
- `PlayerHand` — fan layout with transforms for every card
- `CombatZone` — card stacks with peek positioning math
- `PoolEntry` — stacked image layout per champion
- `EventLog` — growing list of all game events
- `CardComponent` — individual card render (many instances)

### 2.3 useMemo / useCallback for derived data

- `collectTargets()` in ResolutionPanel — loops all boards every render, not memoized
- `isCardAlreadyInPlay()` in Formation — O(n²) drag/drop validation on every drag event
- `fanTransform()` in PlayerHand — calculated inline per card per render
- `processIncomingEvents()` — iterates all new events on every STATE_UPDATE
- Memoize the context value objects themselves to prevent cascading re-renders

### 2.4 Image lazy loading

- Add `loading="lazy"` to all card `<img>` tags not in the initial viewport
- Opponent's hand is hidden, so those images don't need loading at all
- Pool/formation cards below the fold can load lazily

### 2.5 AttackLine RAF optimization

AttackLine runs a continuous `requestAnimationFrame` loop querying the DOM every frame, even when nothing changes. Gate the RAF behind a "combat active" check and cache DOM positions.

---

## Phase 3 — Caching

### 3.1 HTTP Cache-Control on card images

Card images are static — they never change. Add response headers:

```
Cache-Control: public, max-age=31536000, immutable
```

First load is slow, every subsequent load is instant from browser disk cache. One-line change in the static file serving middleware.

### 3.2 Game loading screen with pre-caching

Add a loading screen when entering a game. Use this time to front-load all expensive work:

**Image pre-caching:**

- Fetch both players' deck lists from game data
- Pre-load all card images (`new Image().src = url` for each card)
- ~55 cards/deck × 2 players = ~110 images, 1-5MB total
- Show progress bar; transition to game board when all loaded

**Engine warm-up (after Phase 6):**

- Initialize engine state client-side
- Compute initial legal moves
- Pre-build card lookup maps

**Any future per-game setup:**

- The loading screen is a natural place to add new pre-computation without affecting in-game performance
- Service Worker registration for offline card cache (optional, later)

This eliminates the need for a CDN — at this scale (2-6 players, ~200 unique cards per game), browser cache is sufficient.

### 3.3 In-memory game state cache (server)

Keep a `Map<gameId, { state: GameState, sequence: number }>` in the API process. After the first reconstruction, cache the result. Subsequent moves apply directly to the cached state — no reconstruction at all.

- Evict on game end or after 30min inactivity
- Memory: ~50-100KB per active game, negligible
- On server restart: reconstruction happens once per active game, then cache takes over
- This is the single biggest server-side win

---

## Phase 4 — Engine Refactoring

### 4.1 In-memory state cache (server-side, from 3.3)

This eliminates reconstruction for active games entirely. Every move after the first becomes O(1): read cached state → applyMove → update cache → persist action.

Reconstruction only happens on:

- Server restart (cold start)
- Cache miss (game inactive for 30+ min)

### 4.2 Skip hash verification on read

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

- Phase 1 must be completed first — all subsequent phases measure against its baselines
- After each phase, re-run benchmarks and compare against baselines. Update the benchmark thresholds to lock in gains
- Phases 2-3 are pure improvements with no architectural risk
- Phase 4 changes the core server loop — rely on existing tests heavily
- Phases 5-6 are the biggest UX transformation — implement together since optimistic UI benefits enormously from having the engine on the client
- Phase 7 is infrastructure only, no code changes beyond Dockerfile/deploy config
- All phases benefit the future 4-6 player mode; especially delta updates (4.4) and client-side engine (6.x)
- Error handling items should be implemented alongside their relevant phases, not as a separate effort
