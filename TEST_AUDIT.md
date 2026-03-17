# Test Audit — Spell Project

> Generated 2026-03-17. Covers unit, integration, E2E, and security gaps.

---

## Executive Summary

| Package | Files | Tested | Coverage | Verdict |
|---------|-------|--------|----------|---------|
| engine | 27 | 27 | ~95% | **Phase 1 DONE** — 415 tests |
| api | 15 | 12 | ~65% | **Phase 2a DONE** — 116 tests |
| db | 10 | 1 | ~9% | Critical — almost no direct tests |
| web | 72 | 4 unit + 10 e2e | ~6% unit | Low unit — E2E covers flows |
| data | 15 | 0 | 0% | None — zero tests |

**Total test files**: 54 (27 engine + 12 api + 1 db + 4 web unit + 10 web e2e)
**Total test count**: ~621+ (415 engine + 116 api + 8 db + 83 web)

### New Dependencies Required

| Phase | Package | Dependency | Purpose |
|-------|---------|------------|---------|
| 1 (engine) | — | None | `bun:test` sufficient |
| 2 (api) | — | None | `bun:test` + native Bun WS sufficient |
| 3 (db) | — | None | Use existing Docker Postgres; wrap tests in rollback transactions |
| 4 (web) | @spell/web | `@testing-library/react` | Component rendering + queries |
| 4 (web) | @spell/web | `happy-dom` | Lightweight DOM impl for bun:test |
| 4 (web) | @spell/web | `@testing-library/user-event` | Optional — simulate clicks/input |
| 5 (data) | — | None | `bun:test` sufficient |
| 6 (cross) | — | None | `bun:test` + running API/DB |

---

## Phase 1: packages/engine — ✅ COMPLETE (415 tests across 27 files)

### What's tested
- Core `applyMove` across all phases (moves.test.ts — 1,561 LoC)
- Resolution system: zone destinations, card moving, counter windows (resolution.test.ts — 1,115 LoC)
- Trigger system: start/end timing, peek, discard, queuing (triggers.test.ts — 645 LoC)
- Spell gating: direction, cast phases, support validation (spell-gating.test.ts — 279 LoC)
- Combat: level calc, world bonus, outcomes (combat.test.ts — 306 LoC)
- Init: hand/deck sizing, player setup (init.test.ts — 132 LoC)
- Scenario tests: realm self-defense, combat cleanup, spell casting grants

### 1a. High Priority — ✅ DONE (47 tests in 5 files)
| Gap | Status | Tests |
|-----|--------|-------|
| Multi-round combat | ✅ | multi-round-combat.test.ts — 8 tests |
| Formation size 6/8/10 | ✅ | formation-slots.test.ts — 12 tests |
| serialize-shared.ts | ✅ | serialize-shared.test.ts — 13 tests |
| Phase skip validation | ✅ | phase-skip.test.ts — 6 tests |
| Limbo lifecycle | ✅ | limbo-lifecycle.test.ts — 8 tests |

### 1b. Medium Priority — ✅ DONE (31 tests in 6 files)
| Gap | Status | Tests |
|-----|--------|-------|
| Negative combat levels | ✅ | negative-combat-level.test.ts — 5 tests |
| Cosmos case sensitivity | ✅ | cosmos-case-sensitivity.test.ts — 10 tests |
| Counter chain + window | ✅ | counter-chain.test.ts — 7 tests |
| Trigger on razed realm | ✅ | trigger-razed-realm.test.ts — 5 tests |
| Peek with small pile | ✅ | peek-small-pile.test.ts — 6 tests |
| Nested resolution | ✅ | nested-resolution.test.ts — 4 tests |
| Realm defender level 0 | ✅ | realm-defender-level-zero.test.ts — 4 tests |

### 1c. Low Priority — ✅ DONE (34 tests in 3 files)
| Gap | Status | Tests |
|-----|--------|-------|
| seededShuffle edge cases | ✅ | utils-edge-cases.test.ts — 7 tests |
| parseLevel edge cases | ✅ | utils-edge-cases.test.ts — 11 tests |
| ATTACH_ITEM restrictions | ✅ | attach-item-edge-cases.test.ts — 5 tests |
| SET_COMBAT_LEVEL | ✅ | set-combat-level-edge-cases.test.ts — 5 tests |
| DISCARD_COMBAT_CARD | ✅ | set-combat-level-edge-cases.test.ts — 4 tests |
| PLAY_RULE_CARD | ✅ | set-combat-level-edge-cases.test.ts — 2 tests |

---

## Phase 2: packages/api — 12 test files

### What's tested
- Auth middleware: bearer tokens, invalid tokens, participant auth (auth-bearer.test.ts)
- Auth header precedence: Bearer vs X-User-Id (auth-precedence.test.ts — 3 tests)
- Game lifecycle: create, get, lobby, join, slugs, nicknames (games.test.ts)
- Profile: GET/PATCH /me/nickname with validation (profile.test.ts)
- Chat WS: broadcast, emotes, rate limiting, truncation (chat-ws.test.ts)
- WS security: malformed JSON, unknown types, auth guards, SYNC_REQUEST cache, socket lifecycle (ws-security.test.ts — 21 tests)
- WS game flow: JOIN_GAME, SUBMIT_MOVE, SYNC_REQUEST integration (ws-game.test.ts — 13 tests)
- Cards security: path traversal, extension validation, null bytes (cards-security.test.ts — 9 tests)
- Routing: /api prefix, /ws upgrade, SPA fallback (routing.test.ts)
- Perf: reconstruction scaling, serialization size (perf.test.ts)
- Decks: cards by set, deck list, hydrated decks (decks.test.ts)
- Utils: formatEmailAsName (utils.test.ts)

### 2a. High Priority (Security) — ✅ DONE (46 tests in 4 files)
| Gap | Status | Tests |
|-----|--------|-------|
| WS JOIN_GAME auth | ✅ | ws-security.test.ts (6 auth tests) + ws-game.test.ts (8 join tests) |
| WS SUBMIT_MOVE | ✅ | ws-game.test.ts — 4 tests (broadcast, invalid move, wrong player, concurrent) |
| WS SYNC_REQUEST | ✅ | ws-security.test.ts (3 cache tests) + ws-game.test.ts (1 integration) |
| Path traversal on /cards/:setId/:file | ✅ | cards-security.test.ts — 9 tests |
| Move payload size | ✅ | ws-security.test.ts — large garbage payload test |
| Auth header precedence | ✅ | auth-precedence.test.ts — 3 tests |
| SUBMIT_MOVE rate limiting | ⚠️ | No rate limiting exists — documented gap (only chat is throttled) |
| Concurrent move race | ✅ | ws-game.test.ts — enqueueMove serialization test |
| Malformed WS JSON | ✅ | ws-security.test.ts — 4 tests (invalid JSON, empty, binary, large) |

### 2b. Medium Priority (Reliability)
| Gap | File | Detail |
|-----|------|--------|
| deadline.ts | deadline.ts | Entire turn-timeout system untested (76 LoC) |
| game-ops.ts | game-ops.ts | State loading, move persistence, cache logic (92 LoC) |
| state-cache.ts | state-cache.ts | TTL, eviction, collision edge cases (79 LoC) |
| serialize.ts | serialize.ts | Visibility filtering, hand hiding, peek context |
| Slug collision | games.ts | 10-retry unique slug generation untested |
| Deck validation edge cases | games.ts | Empty deck, >110 cards, float values |

### 2c. Low Priority
| Gap | File | Detail |
|-----|------|--------|
| routes/cards.ts | routes/cards.ts | ✅ Security tests in cards-security.test.ts |
| routes/dev.ts | routes/dev.ts | Dev endpoints — zero tests (116 LoC) |
| CORS middleware | index.ts | Actual CORS header behavior untested |

---

## Phase 3: packages/db — 1 test file, 7 tests

### What's tested
- `hashState()`: format, stability, mutation detection, event exclusion (4 tests)
- `reconstructState()`: empty actions, multi-move replay, error resilience (3 tests)

### 3a. High Priority (87% of exports untested)
| Function | File | Tests |
|----------|------|-------|
| `saveAction()` | actions.ts | 0 |
| `listActions()` | actions.ts | 0 |
| `lastSequence()` | actions.ts | 0 |
| `createGame()` | games.ts | 0 |
| `addGamePlayer()` | games.ts | 0 |
| `getGame()` / `getGameBySlug()` | games.ts | 0 |
| `getGamePlayers()` | games.ts | 0 |
| `setGameStatus()` | games.ts | 0 |
| `findExpiredGames()` | games.ts | 0 |
| `getProfile()` / `upsertNickname()` | profiles.ts | 0 |
| `generateGameSlug()` | slug.ts | 0 |

### 3b. Medium Priority (Data Integrity)
| Gap | Detail |
|-----|--------|
| Sequence collision | Two concurrent inserts for same game — unique constraint untested |
| Non-atomic persist | saveAction + updateGameStatus not in transaction; partial failure untested |
| Hash mismatch detection | Hashes stored but never verified during reconstruction (by design, but never tested) |
| Partial action logs | Game with N actions but DB returns N-1 — no continuity validation |
| Deck snapshot corruption | JSONB cast to CardData[] without schema validation |
| Slug collision retry | 10 retries then throw — exception path untested |

### 3c. Low Priority
| Gap | Detail |
|-----|--------|
| Migration rollback | 6 migrations, zero rollback tests |
| Large replay perf | 100+ moves reconstruction — untested in DB layer |

---

## Phase 4: packages/web — 4 unit test files + 10 E2E specs

### Unit Tests (83 tests)
- `client-serialize.test.ts` — 18 tests: engine→client state serialization
- `state-hash.test.ts` — 6 tests: hash generation + server parity
- `optimistic-state.test.ts` — 50+ tests: move application to client state
- `display-name.test.ts` — 9 tests: display name formatting

### E2E Tests (10 specs)
- Auth: login, signup, lobby realtime
- Game: creation, turn structure, realtime sync
- Combat: panel rendering
- Spells: phase 3 casting, announcement, lasting effects
- Formation: collapse toggle
- Deck builder: selection, import/export (8 tests)

### 4a. High Priority
| Gap | Detail |
|-----|--------|
| WebSocket reconnection | `createWsClient()` auto-reconnect after 2s — zero tests |
| Hash mismatch recovery | Client detects mismatch → SYNC_REQUEST → rollback — untested |
| Game.tsx (1,057 LoC) | Zero unit tests; WS message handling, sendMove, spell modals all untested |
| spell-casting.ts (132 LoC) | isSpellCard, resolveSpellMove, spellCastersInPool — zero tests |
| move-helpers.ts (112 LoC) | labelMove, moveInvolves — zero tests |
| manual-actions.ts (109 LoC) | Manual phase action handling — zero tests |
| warnings.ts | classifyWarningCode, read/persistSuppressedWarnings — zero tests |

### 4b. Medium Priority
| Gap | Detail |
|-----|--------|
| 41 game components | Zero unit tests (only E2E). ResolutionPanel (622 LoC), CombatZone (398 LoC), Formation (399 LoC) |
| All context providers | GameContext, BoardContext, CombatContext, MovesContext, UIContext |
| useChat hook (87 LoC) | Chat messages, floating emotes, unread count |
| Auth flow (283 LoC) | Token handling, refresh, logout — no unit tests |
| api.ts (519 LoC) | HTTP client, WS client factory — no unit tests |
| card-helpers.ts | Card image URLs, type info — no tests |

### 4c. Low Priority (E2E Gaps)
| Gap | Detail |
|-----|--------|
| WS disconnect mid-game | Reconnect and resume play |
| Resolution flow | Playing spell → resolve → outcomes |
| Trigger resolution | Turn trigger → peek → discard |
| Multiple attacks per turn | Attack limit enforcement |
| Game abandonment | Turn timeout, forfeit |
| Chat & emotes | Send/receive messages |
| warnings.spec.ts | File exists (3 LoC) but has zero active tests |

---

## Phase 5: packages/data — 0 tests

**15 source files, 1,282 LoC, 40+ functions — completely untested.**

### 5a. High Priority
| Gap | Impact |
|-----|--------|
| TCL parser (parseTclList, extractTclBlock) | Complex state machine; edge cases could cause infinite loops or data loss |
| Card record parsing (parseCardRecord) | 13-field validation; malformed records silently skipped |
| Effect tagging regexes (5 shouldTag functions) | False positives/negatives in game-critical card effects |
| Schema validation | No check that typeId ∈ [0-21], worldId ∈ {0-7,9}, etc. |

### 5b. Medium Priority
| Gap | Impact |
|-----|--------|
| Duplicate card detection | Same (setId, cardNumber) pairs undetected |
| Deck card reference validation | Deck refs to nonexistent cards |
| Format limit consistency | min ≤ max not validated |
| Spell meta regex | Multiple spell tags in one description |
| Image filename handling | Leading zeros, collisions |

### 5c. Low Priority
| Gap | Impact |
|-----|--------|
| extract-sets.ts aggregation | Assumes cards/ exists; no validation of card counts |
| copy-images.ts | Assumes SRC_DIR exists; skips failures silently |
| index.ts orchestrator | CLI entry point; Bun.spawnSync error handling |

---

## Phase 6: Cross-Package / Integration Gaps

### 6a. High Priority
| Gap | Packages | Detail |
|-----|----------|--------|
| Full move lifecycle | api + db + engine | HTTP/WS move → reconstruct → engine apply → persist → broadcast — only tested piecewise |
| WS auth + game join | api + db | Token verify → addGamePlayer → WS registry — untested as integration |
| Deadline expiration | api + db + engine | Timer fires → findExpiredGames → PASS move → status update — zero tests |

### 6b. Medium Priority
| Gap | Packages | Detail |
|-----|----------|--------|
| State cache coherence | api + db | Cache miss → DB reconstruct → cache update — no isolated test |
| Client delta pipeline | web + engine | WS MOVE_APPLIED → local engine replay → serialize → render — untested end-to-end |

### 6c. Low Priority
| Gap | Packages | Detail |
|-----|----------|--------|
| Dev scenario load | api + db + engine | Load scenario → inject state → play — untested |
