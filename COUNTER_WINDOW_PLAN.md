# Counter Window Feature Plan

## Goal
When player A plays a spell or event, opponents with tagged counter cards get a brief
window to respond. Player A sees the resolution panel immediately but with Apply disabled
until the opponent acknowledges (or plays a counter card).

## Rules basis
- Events: opponents can Negate, Calm, Duplicate, or Deflect (clockwise, once per player).
- Spells: Dispel Magic / Spell Turning / Reflection can be cast "at any time in response".
- Counter-Effect Cards must be played immediately as the next card by the affected player.
- Countering a counter is allowed ("when a card is put into play, all players have a chance
  to respond before play continues"). For v1 we support one round only.

## Counter cards tagged in 1st edition
| # | Name | Type | Effect | Notes |
|---|------|------|--------|-------|
| 346 | Dispel Magic | Wizard Spell | counter_spell | Hand-played; auto-triggers window |
| 358 | Dispel Magic | Cleric Spell | counter_spell | Hand-played; auto-triggers window |
| 388 | Passwall | Wizard Spell | counter_spell | Wall spells only; hand-played |
| 400 | Calm | Event | counter_event | Hand-played; auto-triggers window |
| 436 | The Genie Bottle | Event | counter_event | Mass dispel; hand-played |
| 220 | Rod of Dispel Magic | Artifact | counter_spell | In-play ability; manual via chat |
| 427 | Dori the Barbarian's Cape | Artifact | counter_event | In-play ability; manual via chat |
| 450 | Delsenora | Cleric Champion | counter_event | In-play ability; manual via chat |

Engine auto-opens counter window only when an opponent has a tagged card **in hand** (#346, #358, #388, #400, #436).
In-play artifact/champion counters (#220, #427, #450) are tagged for completeness but handled manually via chat — `opponentsHaveCounterCards()` checks hands only.

## UX Flow
1. Player A plays spell/event → engine checks if any opponent has a tagged counter card in hand.
2. If yes: `resolutionContext.counterWindowOpen = true`.
   - Player A: sees ResolutionPanel, can pre-select choices, Apply is **disabled**, shows
     "Waiting for opponent to respond...".
   - Player B: sees a non-blocking CounterWindowBanner with the played card name.
     Can click "Acknowledge (let it resolve)" → sends PASS_COUNTER.
     Can click a counter card from hand → sends PLAY_COUNTER (removes card, cancels original).
3. If no tagged counter card found: `counterWindowOpen = false`, resolution proceeds immediately.
4. Once all opponents have acknowledged: `counterWindowOpen = false`, Apply unlocks for player A.

Counter-the-counter: not supported in v1. If player B counters, the original resolution is
cleared; player A cannot counter back. Coordinate via chat.

## Files Changed

### packages/data
- [ ] `src/tag-counter-cards.ts` — new tagging script
- [ ] `cards/1st.json` — tagged cards get `counter_event` or `counter_spell` effect

### packages/engine/src
- [ ] `types.ts`
  - Add `CounterEventEffect { type: "counter_event" }` and `CounterSpellEffect { type: "counter_spell" }` to EffectTag union
  - Add `counterWindowOpen: boolean` to `ResolutionContext`
  - Add `{ type: "PASS_COUNTER" }` to Move union
  - Add `{ type: "COUNTER_PLAYED"; playerId; cardInstanceId; cardName; cancelledCardName }` to GameEvent
- [ ] `resolution.ts`
  - `openResolutionContext`: scan opponent hands for counter tags → set `counterWindowOpen`
  - Add `handlePassCounter(state) → GameState`
  - Add `handleCounterPlay(state, playerId, cardInstanceId) → GameState` — removes card from
    hand, places in void/discard, places original pending card in its default destination,
    clears `resolutionContext`
  - Export both new handlers
- [ ] `engine.ts`
  - Add `PASS_COUNTER` case → `handlePassCounter`
  - In `PLAY_EVENT` case: if `counterWindowOpen && playerId !== resolvingPlayer` → `handleCounterPlay`
  - In `isValidOutOfTurnMove`: allow `PASS_COUNTER` when `counterWindowOpen`
- [ ] `legal-moves.ts`
  - Resolution context block: non-resolving player during `counterWindowOpen` gets
    `PASS_COUNTER` + `PLAY_EVENT` for each tagged counter card in hand

### packages/api/src
- [ ] `serialize.ts` — include `counterWindowOpen` in resolutionContext serialization

### packages/web/src
- [ ] `api.ts` — add `counterWindowOpen: boolean` to `ResolutionContextInfo`
- [ ] `utils/client-serialize.ts` — include `counterWindowOpen`
- [ ] `components/game/ResolutionPanel.tsx`
  - Add "Other options (manual)" to category dropdown
  - Show "Waiting for opponent to respond..." and disable Apply/Done when `counterWindowOpen`
- [ ] `components/game/CounterWindowBanner.tsx` — new component
  - Non-blocking banner shown to non-resolving player
  - Lists the played card and opponent; "Acknowledge" button + counter cards from hand
- [ ] `pages/Game.tsx` — render CounterWindowBanner when appropriate

### packages/api/src/dev
- [ ] `scenarios.ts` — add three scenarios:
  - `counter-calm-event`: p2 plays a harmful event, p1 has Calm in hand
  - `counter-dispel-spell`: p2 plays a spell in Phase 3, p1 has Dispel Magic in hand
  - `counter-no-cards`: p2 plays a spell, p1 has no counter cards (window auto-skips)

## Status
- [x] Data tagging — `packages/data/src/tags/tag-counter-cards.ts` + 1st.json updated (8 cards: 5 hand-played + 3 in-play)
- [x] Engine types — `CounterEventEffect`, `CounterSpellEffect`, `counterWindowOpen`, `PASS_COUNTER` move, `COUNTER_PLAYED` event
- [x] Engine resolution/counter handlers — `openResolutionContext` sets flag; `handlePassCounter`; `handleCounterPlay`
- [x] Engine legal moves — non-resolving player gets `PASS_COUNTER` + tagged `PLAY_EVENT` during window
- [x] API serialize — `counterWindowOpen` in resolutionContext
- [x] Web types + serialize — `ResolutionContextInfo.counterWindowOpen`; client-serialize updated
- [x] ResolutionPanel updates — "Other / Manual Effect" option; disabled state + waiting banner when counterWindowOpen
- [x] CounterWindowBanner — new component (bottom-right non-blocking overlay)
- [x] Game.tsx wiring — banner shown when `counterWindowOpen && initiatingPlayer !== myPlayerId`
- [x] Scenarios — `counter-window-calm-event`, `counter-window-dispel-spell`, `counter-window-no-cards`
- [x] Tests + typecheck — 261 engine tests pass, all packages typecheck clean, web build clean
