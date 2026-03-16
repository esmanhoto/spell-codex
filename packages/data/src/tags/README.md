# Card Effect Tagging Scripts

Scripts in this folder scan card JSON files and populate the `effects[]` array with structured
effect objects that drive engine automation. Each script handles one mechanic.

**Key rules for all scripts:**

- **Append only** — never overwrite the effects array; a card can have multiple effects.
- **Idempotent** — safe to re-run; skips cards that already have the effect.
- **Run for every new set** — pass the new JSON file as an argument (see each script's usage).

Types for all effect objects are defined in `types.ts` (mirrored in `packages/engine/src/types.ts`).

---

## Scripts

### `tag-rebuild-realm.ts`

**Tags:** `{ "type": "rebuild_realm" }`

**What it finds:** Holdings and events whose description indicates they can rebuild (restore) a
razed realm slot back to an active state.

**Matching strategy:**

- Description contains `rebuild` + (`razed` or `realm`), OR `restores ... razed`
- Excludes negations (`cannot rebuild`, `prevent rebuilding`)
- Excludes trigger-only phrasing (`when this realm is rebuilt`)

**Example cards (1st edition):** Safe Harbor! (#107), Labor of Legend (#108),
Arms of the Shield Lands (#216), Spirit of the land (#288)

**Usage:**

```
bun run src/tags/tag-rebuild-realm.ts                          # defaults to cards/1st.json
bun run src/tags/tag-rebuild-realm.ts packages/data/cards/2nd.json
bun run src/tags/tag-rebuild-realm.ts cards/2nd.json cards/3rd.json
```

---

### `tag-turn-trigger-peek-draw-pile.ts`

**Tags:** `{ "type": "turn_trigger", "timing": "start", "action": "peek_draw_pile", ... }`

**What it finds:** Champions or items that let the owner look at the top N cards of any draw pile at the start of their turn, with optional discard.

**Matching strategy:**

- `"look at the top card of any draw pile"` → count:1, may_discard:true
- `"inspect the top three cards of any deck and discard one"` → count:3, may_discard:true

**Example cards (1st edition):** Marco Volo (#50), Ren's Crystal Ball (#199)

**Usage:**

```
bun run src/tags/tag-turn-trigger-peek-draw-pile.ts packages/data/cards/2nd.json
```

---

### `tag-turn-trigger-peek-hand.ts`

**Tags:** `{ "type": "turn_trigger", "timing": "start", "action": "peek_hand", ... }`

**What it finds:** Items or artifacts that let the owner look at a player's full hand at the start of their turn (information only, no discard).

**Matching strategy:**

- Requires `"beginning of his/its owner's turn"` or `"start of ... turn"` proximity
- Requires `"look at"`, `"examine"`, or `"inspect"` near `"hand"`
- `"opponent's hand"` → targets: "opponent"; otherwise targets: "any"

**Example cards (1st edition):** Ring of All Seeing (#311), Annulus (#411)

**Usage:**

```
bun run src/tags/tag-turn-trigger-peek-hand.ts packages/data/cards/2nd.json
```

---

### `tag-turn-trigger-discard-hand.ts`

**Tags:** `{ "type": "turn_trigger", "timing": "end", "action": "discard_from_hand_random", ... }`

**What it finds:** Champions that randomly discard a card from another player's hand at the end of their turn.

**Matching strategy:**

- Requires `"end of his turn"` proximity
- Requires `"randomly draw one card from another player's hand and discard"`
- `"does not attack"` → adds condition: "did_not_attack"

**Example cards (1st edition):** Hettman Tsurin (#172)

**Usage:**

```
bun run src/tags/tag-turn-trigger-discard-hand.ts packages/data/cards/2nd.json
```

---

## Adding a new set

Run all scripts against the new JSON file in order:

```sh
SET=packages/data/cards/2nd.json

bun run packages/data/src/tags/tag-rebuild-realm.ts $SET
bun run packages/data/src/tags/tag-turn-trigger-peek-draw-pile.ts $SET
bun run packages/data/src/tags/tag-turn-trigger-peek-hand.ts $SET
bun run packages/data/src/tags/tag-turn-trigger-discard-hand.ts $SET
```

Scripts are safe to run in any order since they only append distinct `type` values.

---

## Adding a new script

1. Create `tag-<mechanic>.ts` in this folder.
2. Import `EffectTag` (or the specific type) from `./types.ts`.
3. Follow the append pattern from `tag-rebuild-realm.ts`:
   - Parse JSON to find matching cards.
   - Do targeted text replacement on the raw string (preserves formatting).
   - Guard against duplicates before appending.
4. Add an entry to this README with: what it tags, matching strategy, example cards, usage.
5. Add the new script to the "Adding a new set" command block above.
