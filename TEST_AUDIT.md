# Test Audit — Spell Project

> Generated 2026-03-17. Covers unit, integration, E2E, and security gaps.

---

## Executive Summary

| Package | Files | Tested          | Coverage | Verdict                      |
| ------- | ----- | --------------- | -------- | ---------------------------- |
| engine  | 27    | 27              | ~95%     | **Phase 1 DONE** — 417 tests |
| api     | 15    | 24              | ~92%     | **Phase 2 DONE** + Phase 6 — 228 tests |
| db      | 10    | 8               | ~80%     | **Phase 3 DONE** — 72 tests  |
| web     | 72    | 4 unit + 10 e2e | ~6% unit | Low unit — E2E covers flows  |
| data    | 15    | 8               | ~60%     | **Phase 5 DONE** — 195 tests  |
| cross   | —     | 5               | —        | **Phase 6 DONE** — 31 tests   |

**Total test files**: 81 (27 engine + 24 api + 8 db + 4 web unit + 10 web e2e + 8 data)
**Total test count**: ~995+ (417 engine + 228 api + 72 db + 83 web + 195 data)

### New Dependencies Required

| Phase      | Package    | Dependency                    | Purpose                                                           |
| ---------- | ---------- | ----------------------------- | ----------------------------------------------------------------- |
| 1 (engine) | —          | None                          | `bun:test` sufficient                                             |
| 2 (api)    | —          | None                          | `bun:test` + native Bun WS sufficient                             |
| 3 (db)     | —          | None                          | Use existing Docker Postgres; wrap tests in rollback transactions |
| 4 (web)    | @spell/web | `@testing-library/react`      | Component rendering + queries                                     |
| 4 (web)    | @spell/web | `happy-dom`                   | Lightweight DOM impl for bun:test                                 |
| 4 (web)    | @spell/web | `@testing-library/user-event` | Optional — simulate clicks/input                                  |
| 5 (data)   | —          | None                          | `bun:test` sufficient                                             |
| 6 (cross)  | —          | None                          | `bun:test` + running API/DB                                       |

---

## Phase 1: packages/engine — ✅ COMPLETE (417 tests across 27 files)

### What's tested

- Core `applyMove` across all phases (moves.test.ts — 1,561 LoC)
- Resolution system: zone destinations, card moving, counter windows (resolution.test.ts — 1,115 LoC)
- Trigger system: start/end timing, peek, discard, queuing (triggers.test.ts — 645 LoC)
- Spell gating: direction, cast phases, support validation (spell-gating.test.ts — 279 LoC)
- Combat: level calc, world bonus, outcomes (combat.test.ts — 306 LoC)
- Init: hand/deck sizing, player setup (init.test.ts — 132 LoC)
- Scenario tests: realm self-defense, combat cleanup, spell casting grants

### 1a. High Priority — ✅ DONE (47 tests in 5 files)

| Gap                   | Status | Tests                                |
| --------------------- | ------ | ------------------------------------ |
| Multi-round combat    | ✅     | multi-round-combat.test.ts — 8 tests |
| Formation size 6/8/10 | ✅     | formation-slots.test.ts — 12 tests   |
| serialize-shared.ts   | ✅     | serialize-shared.test.ts — 13 tests  |
| Phase skip validation | ✅     | phase-skip.test.ts — 6 tests         |
| Limbo lifecycle       | ✅     | limbo-lifecycle.test.ts — 8 tests    |

### 1b. Medium Priority — ✅ DONE (31 tests in 6 files)

| Gap                     | Status | Tests                                       |
| ----------------------- | ------ | ------------------------------------------- |
| Negative combat levels  | ✅     | negative-combat-level.test.ts — 5 tests     |
| Cosmos case sensitivity | ✅     | cosmos-case-sensitivity.test.ts — 10 tests  |
| Counter chain + window  | ✅     | counter-chain.test.ts — 7 tests             |
| Trigger on razed realm  | ✅     | trigger-razed-realm.test.ts — 5 tests       |
| Peek with small pile    | ✅     | peek-small-pile.test.ts — 6 tests           |
| Nested resolution       | ✅     | nested-resolution.test.ts — 4 tests         |
| Realm defender level 0  | ✅     | realm-defender-level-zero.test.ts — 4 tests |

### 1c. Low Priority — ✅ DONE (34 tests in 3 files)

| Gap                      | Status | Tests                                         |
| ------------------------ | ------ | --------------------------------------------- |
| seededShuffle edge cases | ✅     | utils-edge-cases.test.ts — 7 tests            |
| parseLevel edge cases    | ✅     | utils-edge-cases.test.ts — 11 tests           |
| ATTACH_ITEM restrictions | ✅     | attach-item-edge-cases.test.ts — 5 tests      |
| SET_COMBAT_LEVEL         | ✅     | set-combat-level-edge-cases.test.ts — 5 tests |
| DISCARD_COMBAT_CARD      | ✅     | set-combat-level-edge-cases.test.ts — 4 tests |
| PLAY_RULE_CARD           | ✅     | set-combat-level-edge-cases.test.ts — 2 tests |

---

## Phase 2: packages/api — 19 test files — ✅ COMPLETE

### What's tested

- Auth middleware: bearer tokens, invalid tokens, participant auth (auth-bearer.test.ts)
- Auth header precedence: Bearer vs X-User-Id (auth-precedence.test.ts — 3 tests)
- Game lifecycle: create, get, lobby, join, slugs, nicknames (games.test.ts)
- Profile: GET/PATCH /me/nickname with validation (profile.test.ts)
- Chat WS: broadcast, emotes, rate limiting, truncation (chat-ws.test.ts)
- WS security: malformed JSON, unknown types, auth guards, SYNC_REQUEST cache, socket lifecycle, blocked move types, state filtering (ws-security.test.ts — 27 tests)
- WS game flow: JOIN_GAME, SUBMIT_MOVE, SYNC_REQUEST integration (ws-game.test.ts — 13 tests)
- Cards security: path traversal, extension validation, null bytes (cards-security.test.ts — 9 tests)
- Routing: /api prefix, /ws upgrade, SPA fallback (routing.test.ts)
- Perf: reconstruction scaling, serialization size (perf.test.ts)
- Decks: cards by set, deck list, hydrated decks (decks.test.ts)
- Utils: formatEmailAsName (utils.test.ts)
- State cache: get/set/evict, meta, isolation (state-cache.test.ts — 11 tests)
- Serialization: hand visibility, peek context, deck images, turnDeadline, legal moves (serialize.test.ts — 18 tests)
- Game ops: loadGameState cache/DB, persistMoveResult sequence + hash (game-ops.test.ts — 6 tests)
- Deadline: processExpiredGames, findExpiredGames (deadline.test.ts — 4 tests)
- Deck validation: min/max cards, float values, join validation, slug format (deck-validation.test.ts — 12 tests)

### 2a. High Priority (Security) — ✅ DONE (53 tests in 4 files)

| Gap                                   | Status | Tests                                                                         |
| ------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| WS JOIN_GAME auth                     | ✅     | ws-security.test.ts (6 auth tests) + ws-game.test.ts (8 join tests)           |
| WS SUBMIT_MOVE                        | ✅     | ws-game.test.ts — 4 tests (broadcast, invalid move, wrong player, concurrent) |
| WS SYNC_REQUEST                       | ✅     | ws-security.test.ts (3 cache tests) + ws-game.test.ts (1 integration)         |
| Path traversal on /cards/:setId/:file | ✅     | cards-security.test.ts — 9 tests                                              |
| Move payload size                     | ✅     | ws-security.test.ts — large garbage payload test                              |
| Auth header precedence                | ✅     | auth-precedence.test.ts — 3 tests                                             |
| SUBMIT_MOVE rate limiting             | ⚠️     | No rate limiting exists — documented gap (only chat is throttled)             |
| Concurrent move race                  | ✅     | ws-game.test.ts — enqueueMove serialization test                              |
| Malformed WS JSON                     | ✅     | ws-security.test.ts — 4 tests (invalid JSON, empty, binary, large)            |
| DEV_GIVE_CARD blocked (C1)            | ✅     | games.test.ts — 1 test (HTTP 400) + ws-security.test.ts — 1 test (WS blocked) + engine — 2 tests (devMode guard) |
| rawEngineState filtering (C2)         | ✅     | ws-security.test.ts — 5 tests (viewer preserved, opponent hidden, non-hidden zones, no mutation, symmetric) |

### 2b. Medium Priority (Reliability) — ✅ DONE (51 tests in 5 files)

| Gap                        | Status | Tests                                                                             |
| -------------------------- | ------ | --------------------------------------------------------------------------------- |
| deadline.ts                | ✅     | deadline.test.ts — 4 tests (processExpiredGames, findExpiredGames)                |
| game-ops.ts                | ✅     | game-ops.test.ts — 6 tests (loadGameState cache/DB, persistMoveResult)            |
| state-cache.ts             | ✅     | state-cache.test.ts — 11 tests (get/set/evict, meta, isolation)                   |
| serialize.ts               | ✅     | serialize.test.ts — 18 tests (hand visibility, peek context, deck images, status) |
| Slug generation            | ✅     | deck-validation.test.ts — 3 slug format tests                                     |
| Deck validation edge cases | ✅     | deck-validation.test.ts — 9 tests (empty, <55, >110, float, join)                 |

### 2c. Low Priority — ✅ DONE (19 tests in 2 files)

| Gap             | Status | Tests                                                                                |
| --------------- | ------ | ------------------------------------------------------------------------------------ |
| routes/cards.ts | ✅     | cards-security.test.ts (9 tests, done in 2a)                                         |
| routes/dev.ts   | ✅     | dev-routes.test.ts — 15 tests (scenarios, card search, give-card, AUTH_BYPASS guard) |
| CORS middleware | ✅     | cors.test.ts — 4 tests (preflight, public, auth routes, wildcard origin)             |

---

## Phase 3: packages/db — ✅ COMPLETE (72 tests across 8 files)

### What's tested

- `hashState()`: format, stability, mutation detection, event exclusion (4 tests)
- `reconstructState()`: empty actions, multi-move replay, error resilience (3 tests)

### 3a. High Priority — ✅ DONE (35 tests in 4 files)

| Function                            | File        | Tests                                                                                                        |
| ----------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| `saveAction()`                      | actions.ts  | ✅ actions.test.ts — 3 tests (insert+return, duplicate seq reject, cross-game seq)                           |
| `listActions()`                     | actions.ts  | ✅ actions.test.ts — 3 tests (ordered by seq, empty, game isolation)                                         |
| `lastSequence()`                    | actions.ts  | ✅ actions.test.ts — 3 tests (-1 empty, highest seq, -1 nonexistent)                                         |
| `createGame()`                      | games.ts    | ✅ games.test.ts — 3 tests (create+return, inserts players, default nickname)                                |
| `addGamePlayer()`                   | games.ts    | ✅ games.test.ts — 2 tests (add player, reject duplicate userId)                                             |
| `getGame()` / `getGameBySlug()`     | games.ts    | ✅ games.test.ts — 4 tests (by id, null id, by slug, null slug)                                              |
| `getGamePlayers()`                  | games.ts    | ✅ games.test.ts — 2 tests (empty, preserves deckSnapshot JSONB)                                             |
| `setGameStatus()`                   | games.ts    | ✅ games.test.ts — 2 tests (status update, winnerId)                                                         |
| `findExpiredGames()`                | games.ts    | ✅ games.test.ts — 3 tests (past deadline, excludes finished, excludes future)                               |
| `getProfile()` / `upsertNickname()` | profiles.ts | ✅ profiles.test.ts — 5 tests (null nonexistent, return after upsert, create, update on conflict, updatedAt) |
| `generateGameSlug()`                | slug.ts     | ✅ slug.test.ts — 4 tests (3-word format, non-empty segments, uniqueness, charset)                           |

### 3b. Medium Priority (Data Integrity) — ✅ DONE (13 tests in 1 file)

| Gap                      | Status | Tests                                                                                      |
| ------------------------ | ------ | ------------------------------------------------------------------------------------------ |
| Sequence collision       | ✅     | data-integrity.test.ts — 2 tests (concurrent race, post-collision insert)                  |
| Non-atomic persist       | ✅     | data-integrity.test.ts — 2 tests (action without status, status without actions)           |
| Hash mismatch detection  | ✅     | data-integrity.test.ts — 2 tests (wrong hash ignored, stored vs replayed divergence)       |
| Partial action logs      | ✅     | data-integrity.test.ts — 2 tests (sequence gap, invalid move engine_error)                 |
| Deck snapshot corruption | ✅     | data-integrity.test.ts — 3 tests (garbage JSONB, empty array, corrupt deck reconstruction) |
| Slug collision retry     | ✅     | data-integrity.test.ts — 2 tests (distinct slugs, DB unique constraint)                    |

### 3c. Low Priority — ✅ DONE (17 tests in 2 files)

| Gap               | Status | Tests                                                                             |
| ----------------- | ------ | --------------------------------------------------------------------------------- |
| Migration schema  | ✅     | migrations.test.ts — 14 tests (columns, PKs, FKs, indexes, constraints per table) |
| Large replay perf | ✅     | large-replay.test.ts — 3 tests (120 moves, 200 moves, 150-action lastSequence)    |

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

| Gap                         | Detail                                                                    |
| --------------------------- | ------------------------------------------------------------------------- |
| WebSocket reconnection      | `createWsClient()` auto-reconnect after 2s — zero tests                   |
| Hash mismatch recovery      | Client detects mismatch → SYNC_REQUEST → rollback — untested              |
| Game.tsx (1,057 LoC)        | Zero unit tests; WS message handling, sendMove, spell modals all untested |
| spell-casting.ts (132 LoC)  | isSpellCard, resolveSpellMove, spellCastersInPool — zero tests            |
| move-helpers.ts (112 LoC)   | labelMove, moveInvolves — zero tests                                      |
| manual-actions.ts (109 LoC) | Manual phase action handling — zero tests                                 |
| warnings.ts                 | classifyWarningCode, read/persistSuppressedWarnings — zero tests          |

### 4b. Medium Priority

| Gap                   | Detail                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| 41 game components    | Zero unit tests (only E2E). ResolutionPanel (622 LoC), CombatZone (398 LoC), Formation (399 LoC) |
| All context providers | GameContext, BoardContext, CombatContext, MovesContext, UIContext                                |
| useChat hook (87 LoC) | Chat messages, floating emotes, unread count                                                     |
| Auth flow (283 LoC)   | Token handling, refresh, logout — no unit tests                                                  |
| api.ts (519 LoC)      | HTTP client, WS client factory — no unit tests                                                   |
| card-helpers.ts       | Card image URLs, type info — no tests                                                            |

### 4c. Low Priority (E2E Gaps)

| Gap                       | Detail                                        |
| ------------------------- | --------------------------------------------- |
| WS disconnect mid-game    | Reconnect and resume play                     |
| Resolution flow           | Playing spell → resolve → outcomes            |
| Trigger resolution        | Turn trigger → peek → discard                 |
| Multiple attacks per turn | Attack limit enforcement                      |
| Game abandonment          | Turn timeout, forfeit                         |
| Chat & emotes             | Send/receive messages                         |
| warnings.spec.ts          | File exists (3 LoC) but has zero active tests |

---

## Phase 5: packages/data — 8 test files — ✅ COMPLETE (195 tests)

### What's tested

- TCL parser: `parseTclList` (bare/braced/quoted, escapes, nesting), `extractTclBlock` (namespace, nested braces, edge cases)
- Card record parsing: `parseLevel`, `parseRarity`, `parseAttributes`, `parseRefList`, `parseSpellMeta`, `parseCardRecord` (13-field validation, type coercion, spell meta)
- Effect tagging: `shouldTagRebuildRealm`, `shouldTagAsCounterEvent`, `shouldTagAsCounterSpell`, `shouldTagTurnStart`, `shouldTagTurnEnd`, `patchEffectByName`, `patchEffectByNumber`
- Format parsing: `parseLimitBlock`, `parseTotalBlock`, `parseCardRefList`
- Deck parsing: `extractBareValue`, `parseDeckCardList`
- Data validation: duplicate detection, schema fields, deck refs, format min≤max, spell meta edge cases
- Sets/worlds output: sets.json integrity (no dupes, field types, card counts), worlds.json (all 9 IDs, no ID 8)
- Image pipeline: leading-zero stripping logic (001→1, non-numeric rejection)

### 5a. High Priority — ✅ DONE (112 tests in 3 files)

| Gap                                            | Status | Tests                                                                 |
| ---------------------------------------------- | ------ | --------------------------------------------------------------------- |
| TCL parser (parseTclList, extractTclBlock)     | ✅     | tcl-parser.test.ts — 27 tests (braces, quotes, escapes, nesting)     |
| Card record parsing (parseCardRecord)          | ✅     | extract-cards.test.ts — 45 tests (field parsers, records, spell meta) |
| Effect tagging regexes (5 shouldTag functions) | ✅     | effect-tagging.test.ts — 40 tests (all 5 shouldTag + patch utils)    |
| Schema validation                              | ⚠️     | No runtime validation exists — documented gap (type-only safety)     |

### 5b. Medium Priority — ✅ DONE (63 tests in 3 files)

| Gap                            | Status | Tests                                                                            |
| ------------------------------ | ------ | -------------------------------------------------------------------------------- |
| Duplicate card detection       | ✅     | data-validation.test.ts — 4 tests (no duplicate keys, valid typeId/worldId/name) |
| Schema field validation        | ✅     | data-validation.test.ts — 9 tests (all field types verified against real data)   |
| Deck card reference validation | ✅     | data-validation.test.ts — 2 tests (parse + refs resolve to available sets)       |
| Format limit consistency       | ✅     | data-validation.test.ts — 4 tests (parse + min≤max on total/champion/typeLimits) |
| Spell meta regex               | ✅     | data-validation.test.ts — 5 tests (precedence, case, multi-tag, phase edge)      |
| Format parsing                 | ✅     | extract-formats.test.ts — 22 tests (parseLimitBlock, parseTotalBlock, cardRefs)  |
| Deck parsing                   | ✅     | extract-decks.test.ts — 17 tests (extractBareValue, parseDeckCardList)           |

### 5c. Low Priority — ✅ DONE (20 tests in 2 files)

| Gap                         | Status | Tests                                                                          |
| --------------------------- | ------ | ------------------------------------------------------------------------------ |
| extract-sets.ts aggregation | ✅     | extract-sets.test.ts — 12 tests (sets.json + worlds.json integrity, counts)    |
| copy-images.ts              | ✅     | copy-images.test.ts — 8 tests (leading-zero stripping, edge cases)             |
| index.ts orchestrator       | ⚠️     | Not unit-testable (Bun.spawnSync orchestrator) — covered by manual `bun run extract` |

---

## Phase 6: Cross-Package / Integration Gaps — ✅ COMPLETE (31 tests across 5 files)

### What's tested

- Full move lifecycle: WS move → DB action persist → hash verify → broadcast → reconstruct parity
- Deadline expiration: expired game → auto-PASS → DB action + hash + reconstruct validity
- State cache coherence: cache miss → DB reconstruct → cache update → evict → re-verify parity across multiple moves
- Client delta pipeline: DB hashState ↔ web hashEngineState parity, client serialization shape + hand visibility + legal moves
- Dev scenario lifecycle: snapshot in DB, WS join, legal move submission, reconstruct, give-card end-to-end

### 6a. High Priority — ✅ DONE (10 tests in 2 files)

| Gap                 | Status | Tests                                                                                       |
| ------------------- | ------ | ------------------------------------------------------------------------------------------- |
| Full move lifecycle | ✅     | cross-move-lifecycle.test.ts — 6 tests (persist+hash, broadcast, reconstruct, multi-move, invalid/wrong-player rejection) |
| Deadline expiration | ✅     | cross-deadline-lifecycle.test.ts — 4 tests (auto-PASS hash, reconstruct, skip non-active, multi-game) |

### 6b. Medium Priority — ✅ DONE (15 tests in 2 files)

| Gap                   | Status | Tests                                                                                      |
| --------------------- | ------ | ------------------------------------------------------------------------------------------ |
| State cache coherence | ✅     | cross-cache-coherence.test.ts — 6 tests (miss→hit, move+evict, multi-move parity, sequence, playerIds, full reconstruct) |
| Client delta pipeline | ✅     | cross-client-delta.test.ts — 9 tests (hash parity initial+post-move+different+events, serialize shape+hand+legal+perspective+post-move) |

### 6c. Low Priority — ✅ DONE (6 tests in 1 file)

| Gap               | Status | Tests                                                                                      |
| ----------------- | ------ | ------------------------------------------------------------------------------------------ |
| Dev scenario load | ✅     | cross-dev-scenario.test.ts — 6 tests (snapshot in DB, reconstruct, WS join, move persist, reconstruct after move, give-card) |
