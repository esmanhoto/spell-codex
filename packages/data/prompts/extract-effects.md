# Spellfire — Effect Extraction Prompt
<!-- version: 1.2 — scope: Groups A + B only; types trimmed to 1st-edition occurrences -->

## Task

You are given the file `packages/data/cards/1st.json` — an array of Spellfire card objects.
Each card has an `"effects": []` array. Your job is to read every card's `name`, `description`, `typeId`, `level`, and `supportIds`, then populate `effects` with the appropriate structured objects.

**Output the complete modified JSON file.** Do not output anything else — no explanation, no markdown fences around the file. Just the raw JSON.

If the file is large, process cards in batches of ~100 and output each batch as a partial JSON array (e.g. cards 1-100, then 101-200, etc.), clearly labelled so the human can reassemble. The human will run the validation script after each batch.

---

## Effect Types — Groups A and B

Only use the types listed below. Do NOT invent new types. When in doubt → `[]`.

```typescript
type CardEffect =
  // ── A · Combat level modifications ───────────────────────────────────────
  | { type: "LEVEL_BONUS";         value: number; condition?: EffectCondition }
  | { type: "LEVEL_BONUS_VS";      value: number; targetAttribute: string }
  | { type: "LEVEL_BONUS_VS_TYPE"; value: number; typeId: number }

  // ── A · Spell access (champion-level — applies to this champion only) ─────
  | { type: "GRANT_SPELL_ACCESS";  spellTypeId: number; window: "offense" | "defense" | "both" }

  // ── A · Immunities ────────────────────────────────────────────────────────
  | { type: "IMMUNE_TO_SPELLS";    scope?: "offensive" | "defensive" | "both" }
  | { type: "IMMUNE_TO_ATTRIBUTE"; attribute: string }
  | { type: "IMMUNE_TO_ALL_MAGIC" }

  // ── A · Card draw / hand ──────────────────────────────────────────────────
  | { type: "DRAW_CARD";           count: number }       // immediate one-time draw from your deck
  | { type: "DISCARD_CARD";        target: "self" | "opponent"; count: number }  // discard from HAND only

  // ── A · Combat bonus (realm/holding defenders) ───────────────────────────
  // typeIds: array of card type IDs that benefit; typeId 0 = all types, 1 = Ally
  | { type: "COMBAT_BONUS";        value: number; typeIds: number[] }

  // ── B · Passive / structural ──────────────────────────────────────────────
  | { type: "HAND_SIZE_BONUS";           count: number }
  | { type: "DRAW_PER_TURN";             count: number }
  | { type: "DRAW_ON_REALM_PLAY";        count: number }
  | { type: "REALM_GRANTS_SPELL_ACCESS"; spellTypeId: number; window: "offense" | "defense" | "both" }
  | { type: "NEGATE_ITEM_BONUS" }
  // Restrict which attacker types/attributes can attack this realm.
  // Use attribute for movement types (Flyer, Earthwalker, Swimmer).
  // Use typeId for card types (e.g. typeId:10 = Monster).
  | { type: "RESTRICTED_ATTACKERS"; attribute?: string; typeId?: number }
  // Realm/holding can defend as a champion of given level and type.
  | { type: "REALM_SELF_DEFENDS";  level: number; typeId: number }

type EffectCondition =
  | { when: "attacking" }
  | { when: "defending" }
  | { when: "champion_type";      typeId: number }
  | { when: "champion_attribute"; attribute: string }
```

### Card Type IDs (use for `typeId` fields)

| ID | Name           | | ID | Name          |
|----|----------------|-|----|---------------|
| 1  | Ally           | | 12 | Psionicist    |
| 2  | Artifact       | | 13 | Realm         |
| 3  | Blood Ability  | | 14 | Regent        |
| 4  | Cleric Spell   | | 15 | Rule          |
| 5  | Cleric         | | 16 | Thief         |
| 6  | Event          | | 17 | Thief Ability |
| 7  | Hero           | | 18 | Dungeon       |
| 8  | Holding        | | 19 | Wizard Spell  |
| 9  | Magical Item   | | 20 | Wizard        |
| 10 | Monster        | | 21 | Unarmed       |
| 11 | Psionic Power  | |    |               |

Champions = typeIds 5, 7, 10, 12, 14, 16, 20

---

## Rules

**1. Never double-count `level`.** The `level` field already holds the card's base/bonus value. A `+4` ally's level is in `level: "+4"` — do not add a `LEVEL_BONUS` effect for it.

**2. `supportIds` already encodes spell/ally eligibility.** For champions, add `GRANT_SPELL_ACCESS` only when the description text explicitly states the champion can use a spell type beyond what its class normally allows. For realms, use `REALM_GRANTS_SPELL_ACCESS` when text says *"any champion can use X spells when defending this realm."*

**3. Pure direction markers → `[]`.** If the only text is `"(Off.)"` or `"(Def.)"` or similar, output `[]`. Direction is encoded in `supportIds`.

**4. Groups C and D → `[]`.** Leave as empty array for any effect you cannot cleanly represent with the types above. Common C/D patterns to ignore:
   - Aura bonuses that affect *all friendly champions* in the pool (not just this card)
   - Destroying items, holdings, or champions (any "destroys" mechanic)
   - "Must be defeated twice" or any alternate defeat condition
   - Champion loses levels during battle
   - Taking control of opponent's champion
   - Sending cards to the Abyss
   - Timing manipulation ("can be played at any time", "acts before combat begins")
   - Formation manipulation
   - Complex conditionals with multiple nested branches

**5. Empty or flavour descriptions → `[]`.** No text, or purely flavour text → `[]`.

**6. `COMBAT_BONUS`** is for Realm or Holding cards where text says some set of champions gains N levels while defending. Use `typeIds` to specify which card types benefit:
- typeId `0` = all types (every defender) — e.g. "each defender gains N levels"
- typeId `1` = Ally only — e.g. "all defending allies gain N levels"
- Multiple types can be listed together, e.g. `[5, 7]` = Cleric + Hero.
Do NOT add a `COMBAT_BONUS` for the defending champion itself (that's just the card's `level` field).

**7. `IMMUNE_TO_ALL_MAGIC`** = immune to ALL magic (spells **and** magical items/artifacts). Use `IMMUNE_TO_SPELLS` only when the text specifically mentions spells but not items.

**8. `DISCARD_CARD`** — only for effects that discard cards from a player's **hand** (e.g. "opponent discards 2 cards from hand"). Do NOT use for effects that destroy items or attachments in combat — those are Group C/D.

**9. `RESTRICTED_ATTACKERS`** — for Realms or Holdings where text says some category of attacker cannot attack. Use `attribute` for movement types (Flyer, Earthwalker, Swimmer) and `typeId` for card types (Monster = 10). This is distinct from `IMMUNE_TO_ATTRIBUTE` — which is for champion combat immunity in battle, not realm access restriction.

| Card text | Effect |
|---|---|
| "Flyers cannot attack this realm." | `{"type":"RESTRICTED_ATTACKERS","attribute":"Flyer"}` |
| "Monsters cannot attack the attached realm." | `{"type":"RESTRICTED_ATTACKERS","typeId":10}` |
| "Earthwalkers cannot attack this realm." | `{"type":"RESTRICTED_ATTACKERS","attribute":"Earthwalker"}` |

**10. `REALM_GRANTS_SPELL_ACCESS` vs `GRANT_SPELL_ACCESS`** — the realm variant is for Realm cards granting spell use to *any* champion. The champion variant (`GRANT_SPELL_ACCESS`) is for a specific champion gaining access.

**11. `window` in `REALM_GRANTS_SPELL_ACCESS` means the champion's combat role:**
- `"defense"` — text says *"when defending"* (most common for realms)
- `"offense"` — text says *"when attacking"*
- `"both"` — no role restriction stated ("any champion at this realm can use...")

**12. `REALM_SELF_DEFENDS`** — for Holdings where text says the realm (or holding's attached realm) can defend itself as a champion of a given level and type. Example: "The attached realm can defend itself as a level 4 monster." Use the stated level and the matching `typeId`. Note: Realm cards with a non-null `level` field self-defend implicitly — do NOT add this effect for them.

---

## Examples

```json
// Waterdeep — typeId:13 — "Any champion can use wizard spells when defending Waterdeep."
"effects": [{"type":"REALM_GRANTS_SPELL_ACCESS","spellTypeId":19,"window":"defense"}]
// NOTE: "when defending" → window:"defense".

// Shadowdale — typeId:13 — "Any champion can cast cleric and wizard spells when defending Shadowdale."
"effects": [
  {"type":"REALM_GRANTS_SPELL_ACCESS","spellTypeId":4,"window":"defense"},
  {"type":"REALM_GRANTS_SPELL_ACCESS","spellTypeId":19,"window":"defense"}
]

// Moonshae Isles — typeId:13, level:2 — "The Moonshaes can defend as a level 2 hero. All defending allies gain 3 levels."
"effects": [{"type":"COMBAT_BONUS","value":3,"typeIds":[1]}]
// NOTE: do NOT add LEVEL_BONUS for the level:2 — that's already in the level field.
// typeIds:[1] = Ally only (typeId 1).

// Pirate Isles — typeId:13 — "Flyers cannot attack this realm."
"effects": [{"type":"RESTRICTED_ATTACKERS","attribute":"Flyer"}]

// Arms of Nyrond — typeId:8 — "Monsters cannot attack the attached realm."
"effects": [{"type":"RESTRICTED_ATTACKERS","typeId":10}]

// Myth Drannor — typeId:13 — "Any champion can use wizard spells when defending Myth Drannor. Increases player's maximum hand by one."
"effects": [
  {"type":"REALM_GRANTS_SPELL_ACCESS","spellTypeId":19,"window":"defense"},
  {"type":"HAND_SIZE_BONUS","count":1}
]

// Haunted Hall — typeId:13 — "Draw one card immediately when this realm is played or rebuilt."
"effects": [{"type":"DRAW_ON_REALM_PLAY","count":1}]

// Temple of Elemental Evil — typeId:13 — "Draw three cards immediately when the temple is played."
"effects": [{"type":"DRAW_ON_REALM_PLAY","count":3}]

// The Great Kingdom — typeId:13 — "Increases player's maximum hand size by two."
"effects": [{"type":"HAND_SIZE_BONUS","count":2}]

// Fortifications — typeId:8 — "Each defender gains 2 levels."
"effects": [{"type":"COMBAT_BONUS","value":2,"typeIds":[0]}]
// typeIds:[0] = all types (typeId 0 = wildcard).

// Arkhold — typeId:8 — "Allows owner to draw one extra card per turn."
"effects": [{"type":"DRAW_PER_TURN","count":1}]

// Bruenor — typeId:7, level:7 — "Gains 2 levels when fighting a monster."
"effects": [{"type":"LEVEL_BONUS_VS_TYPE","value":2,"typeId":10}]

// Elminster — typeId:20, level:10 — "Immune to offensive spells."
"effects": [{"type":"IMMUNE_TO_SPELLS","scope":"offensive"}]

// Gib Htimsen — typeId:10, level:8 — "Immune to all spells, events, magical items, and artifacts."
"effects": [{"type":"IMMUNE_TO_ALL_MAGIC"}]

// Dracolich — typeId:10, level:13 — "Can use wizard spells."
"effects": [{"type":"GRANT_SPELL_ACCESS","spellTypeId":19,"window":"both"}]

// Good Fortune — typeId:6 — "The player draws five cards immediately."
"effects": [{"type":"DRAW_CARD","count":5}]

// Dwarven Hammer — typeId:9, level:"+3" — "(Off.) Negates all of opponent's magical item bonuses."
"effects": [{"type":"NEGATE_ITEM_BONUS"}]

// War Party — typeId:1, level:"+4" — "(Off.)"
"effects": []  // pure direction marker only

// King Azoun IV — typeId:14 — "All Cormyrean champions gain 3 levels while King Azoun is in the pool."
"effects": []  // Group C aura effect — skip

// Icewind Dale — typeId:13 — "Attacking champion must discard one magical item."
"effects": []  // Group C: destroys/discards an attachment in combat — skip

// Drizzt Do'Urden — typeId:7 — "Must be defeated twice before discarded."
"effects": []  // Group C: alternate defeat condition — skip

// Cormyr — typeId:13 — ""
"effects": []  // no description

// Arabel — typeId:8 — "The attached realm can defend itself as a level 4 monster."
"effects": [{"type":"REALM_SELF_DEFENDS","level":4,"typeId":10}]
// typeId:10 = Monster
```

---

## What NOT to change

- Do not modify any field other than `effects`.
- Do not add, remove, or reorder cards.
- Do not change `effects` on cards that already have a non-empty `effects` array (skip them).
