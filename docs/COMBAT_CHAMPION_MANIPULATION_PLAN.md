# Plan: Combat Champion Manipulation

## Context

Several cards require mid-combat champion swaps (#93 Rod of Shapechange, #204 Bribery!, #428 Weasel Attack!) and round-transition overrides (#258 Rikus, #383 Animate Dead, #429 Barbarian's Decree, Drizzt, #386 Magic Jar). The engine lacks primitives for these. We add 3 new generic moves (enable, not enforce), expand champion selection for cross-player picks, and add a "More Actions" collapsible panel to keep the UI clean.

## New Engine Moves

### 1. `SWAP_COMBAT_CHAMPION` (CARD_PLAY phase)
Atomically replaces one side's champion with a new one.
```typescript
| {
    type: "SWAP_COMBAT_CHAMPION"
    side: "attacker" | "defender"
    newChampionId: CardInstanceId
    newChampionSource: "pool" | "hand" | "discard"
    oldChampionDestination: "pool" | "discard" | "abyss" | "hand"
  }
```
**Covers**: Rod of Shapechange, Weasel Attack.

**Handler** (`handleSwapCombatChampion`):
1. Validate combat active, side has a champion (or null for "place into empty slot")
2. Remove old champion → split combat cards via `splitCombatCards()`, items/artifacts go with old champion to `oldChampionDestination`
3. Find new champion by scanning all players for `newChampionId` in the specified source zone
4. If from pool: bring pool attachments (like `DECLARE_DEFENSE` does)
5. If from hand: promote to pool first (like `DECLARE_DEFENSE` hand path)
6. Place in combat slot, reset manual level for that side
7. Add to `championsUsedThisBattle`
8. Emit `COMBAT_CHAMPION_SWAPPED` event

### 2. `REQUIRE_NEW_CHAMPION` (CARD_PLAY phase)
Transitions `roundPhase` back to AWAITING, forcing a re-pick.
```typescript
| { type: "REQUIRE_NEW_CHAMPION"; side: "attacker" | "defender" }
```
**Covers**: Bribery (after `RETURN_COMBAT_CARD_TO_POOL` on defender).

**Handler**: Validate side has NO champion (null). Set `roundPhase` → `AWAITING_ATTACKER` or `AWAITING_DEFENDER`. Set `activePlayer` to that side's player. Clear `stoppedPlayers`. Emit `COMBAT_CHAMPION_REQUIRED`.

### 3. `ALLOW_CHAMPION_REUSE` (any combat phase)
Removes a champion from `championsUsedThisBattle`.
```typescript
| { type: "ALLOW_CHAMPION_REUSE"; cardInstanceId: CardInstanceId }
```
**Covers**: Rikus (attack twice), Barbarian's Decree, Animate Dead (wizard fights again next round), Drizzt (recover from discard + reuse).

**Handler**: Validate combat active, `cardInstanceId` is in `championsUsedThisBattle`. Remove it. Emit `CHAMPION_REUSE_ALLOWED`.

### 4. Expand `DECLARE_DEFENSE` and `CONTINUE_ATTACK` with `fromPlayerId`
Allow selecting a champion from another player's pool for combat.
```typescript
// Updated DECLARE_DEFENSE:
| { type: "DECLARE_DEFENSE"; championId: CardInstanceId; fromPlayerId?: PlayerId }
// Updated CONTINUE_ATTACK:
| { type: "CONTINUE_ATTACK"; championId: CardInstanceId; fromPlayerId?: PlayerId }
```
**Covers**: Magic Jar (opponent's champion becomes your defender).

**Handler changes**:
- `handleDeclareDefense`: When `fromPlayerId` is set and differs from `playerId`, find champion in that player's pool instead. Remove from their pool, place as defender.
- `handleContinueAttack`: Same pattern — find champion in `fromPlayerId`'s pool.

**Legal moves changes**:
- `getDefenderMoves()`: Also iterate opponent's pool champions, generating DECLARE_DEFENSE with `fromPlayerId` set.
- `getAttackerContinueMoves()`: Also iterate opponent's pool champions, generating CONTINUE_ATTACK with `fromPlayerId` set.

---

## UI: "More Actions" Panel

### Design
Add a collapsible section at the bottom of CombatZone, below the existing action buttons:

```
[Stop Playing] [Interrupt Combat]

[⚙ More Actions ▾]  ← toggles open/close
┌─────────────────────────────────────────┐
│ Swap attacker champion...               │  ← each is a button
│ Swap defender champion...               │
│ Allow [Champion] to fight again         │  ← one per used champion
│ Require new champion (attacker/defender) │
│ Continue with [Opponent's Champion]     │  ← cross-player picks
│ Defend with [Opponent's Champion]       │  ← cross-player picks
└─────────────────────────────────────────┘
```

- Only show buttons for moves that exist in `legalMoves`
- Panel collapsed by default, state persists during combat
- For `SWAP_COMBAT_CHAMPION`: clicking opens a sub-selection (champion picker from eligible pool/hand/discard + destination dropdown). Could reuse ResolutionPanel's target selection pattern.
- For `ALLOW_CHAMPION_REUSE`: show one button per champion in `championsUsedThisBattle`
- Cross-player DECLARE_DEFENSE/CONTINUE_ATTACK moves shown here (not in main buttons) to avoid clutter

### EventLog entries
Add `formatEvent()` cases for:
- `COMBAT_CHAMPION_SWAPPED`: "Player swapped [Old] for [New] (from [source])"
- `COMBAT_CHAMPION_REQUIRED`: "Player must select new [attacker/defender]"
- `CHAMPION_REUSE_ALLOWED`: "[Champion] may fight again"

### move-helpers.ts labels
Add `labelMove()` cases for all new move types.

---

## Files to Modify

### Engine
- **`packages/engine/src/types.ts`** — Add 3 new Move variants (SWAP_COMBAT_CHAMPION, REQUIRE_NEW_CHAMPION, ALLOW_CHAMPION_REUSE), expand DECLARE_DEFENSE + CONTINUE_ATTACK with optional `fromPlayerId`, add 3 new GameEvent variants
- **`packages/engine/src/engine.ts`** — 3 new handlers + `applyMove` switch cases + modify `handleDeclareDefense` and `handleContinueAttack` for `fromPlayerId`
- **`packages/engine/src/legal-moves.ts`** — Generate legal moves for new types in `getCardPlayMoves()` + expand `getDefenderMoves()` and `getAttackerContinueMoves()` for cross-player champions

### Web
- **`packages/web/src/components/game/CombatZone.tsx`** — "More Actions" collapsible panel + swap champion picker
- **`packages/web/src/components/game/CombatZone.module.css`** — Styles for new panel
- **`packages/web/src/components/game/EventLog.tsx`** — Format new events
- **`packages/web/src/utils/move-helpers.ts`** — Labels for new moves
- **`packages/web/src/api.ts`** — Update Move type if needed

### Tests
- **`packages/engine/test/scenarios/combat-swap.test.ts`** (new) — Swap champion from pool/hand/discard, old champion destinations, pool attachments transfer, manual level reset, `championsUsedThisBattle` updated
- **`packages/engine/test/scenarios/combat-advanced.test.ts`** (new) — Allow reuse + continue attack with same champion, require new champion + re-pick, declare defense with opponent's champion, continue attack with opponent's champion

### Reusable functions (already exist)
- `splitCombatCards()` in engine.ts — split items vs allies/spells
- `attachToPoolChampion()` in engine.ts — re-attach items to pool entry
- `findOrPromoteChampion()` in engine.ts — find in pool or promote from hand
- `getPoolAttachments()` in legal-moves.ts — get champion's pool attachments

---

## Implementation Order

1. **types.ts** — all type changes (Move variants, GameEvent variants)
2. **engine.ts** — handlers for SWAP_COMBAT_CHAMPION, REQUIRE_NEW_CHAMPION, ALLOW_CHAMPION_REUSE + modify handleDeclareDefense and handleContinueAttack for fromPlayerId
3. **legal-moves.ts** — legal move generation for all new/modified moves
4. **Tests** — both new test files
5. **Web types** — api.ts updates
6. **Web UI** — CombatZone More Actions panel + EventLog + move-helpers
7. **Dev scenario** — scenario with Rod of Shapechange + Rikus for manual testing

## Verification

1. `bun run --cwd packages/engine typecheck && bun run --cwd packages/engine test`
2. `bun run --cwd packages/api typecheck && bun run --cwd packages/api test`
3. `bun run --cwd packages/web build`
4. Manual test via dev scenario: play Rod of Shapechange during combat, verify swap works
5. Manual test: Rikus attacks, wins round, allow reuse, continue attack with same champion
