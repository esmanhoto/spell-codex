# Effects JSON Migration — v1.1 → v1.2

Use this as a reference when fixing cards already extracted with the v1.1 prompt.
Run `bun run validate:effects` after each batch to confirm the result.

---

## 1. `HOLDING_BONUS` → `COMBAT_BONUS`

**Every occurrence of `"type":"HOLDING_BONUS"` must be replaced.**

The old shape was:
```json
{ "type": "HOLDING_BONUS", "value": 3 }
```

The new shape requires a `typeIds` array specifying which card types benefit:
```json
{ "type": "COMBAT_BONUS", "value": 3, "typeIds": [0] }
```

### Choosing `typeIds`

| Card text says... | `typeIds` |
|---|---|
| "each defender gains N levels" | `[0]` (typeId 0 = all types) |
| "all defending allies gain N levels" | `[1]` (typeId 1 = Ally) |
| "all defending heroes gain N levels" | `[7]` (typeId 7 = Hero) |
| "all defending champions gain N levels" | `[5,7,10,12,14,16,20]` (all champion typeIds) |

```typescript
enum CardTypeId {
  All           = 0,   // Meta: matches any type
  Ally          = 1,
  Artifact      = 2,
  BloodAbility  = 3,
  ClericSpell   = 4,
  Cleric        = 5,   // Champion subtype
  Event         = 6,
  Hero          = 7,   // Champion subtype
  Holding       = 8,
  MagicalItem   = 9,
  Monster       = 10,  // Champion subtype
  PsionicPower  = 11,
  Psionicist    = 12,  // Champion subtype
  Realm         = 13,
  Regent        = 14,  // Champion subtype
  Rule          = 15,
  Thief         = 16,  // Champion subtype
  ThiefAbility  = 17,
  UnarmedCombat = 18,
  WizardSpell   = 19,
  Wizard        = 20,  // Champion subtype
  Dungeon       = 21,
}
```

### Quick find-and-replace

For the common "each defender gains" case, this sed command works:
```bash
# WARNING: only use if ALL your HOLDING_BONUS cards are "all defenders" type
sed -i '' 's/"type":"HOLDING_BONUS","value":\([0-9]*\)/\{"type":"COMBAT_BONUS","value":\1,"typeIds":[0]/g' cards/1st.json
```

Otherwise, fix manually card by card based on the description text.

---

## 2. `MONSTERS_CANT_ATTACK` → `RESTRICTED_ATTACKERS`

**Every occurrence of `"type":"MONSTERS_CANT_ATTACK"` must be replaced.**

Old shape:
```json
{ "type": "MONSTERS_CANT_ATTACK" }
```

New shape:
```json
{ "type": "RESTRICTED_ATTACKERS", "typeId": 10 }
```

`typeId: 10` = Monster. Always use this for "Monsters cannot attack..." text.

---

## 3. `IMMUNE_TO_ATTRIBUTE` used for realm access → `RESTRICTED_ATTACKERS`

If any card of type **Realm** (typeId 13) or **Holding** (typeId 8) has an
`IMMUNE_TO_ATTRIBUTE` effect where the description text says something like
"Flyers cannot attack this realm", that must be changed to `RESTRICTED_ATTACKERS`.

`IMMUNE_TO_ATTRIBUTE` is only for **champion combat immunity** (in battle).
`RESTRICTED_ATTACKERS` is for **realm access restriction** (who can attack at all).

Old (wrong for a realm):
```json
{ "type": "IMMUNE_TO_ATTRIBUTE", "attribute": "Flyer" }
```

Correct:
```json
{ "type": "RESTRICTED_ATTACKERS", "attribute": "Flyer" }
```

Common values: `"Flyer"`, `"Earthwalker"`, `"Swimmer"`.

---

## 4. Remove types no longer in the schema

If the previous extraction used any of the following types, set those cards'
`effects` back to `[]` (the validator will flag them):

| Removed type | Reason |
|---|---|
| `RETURN_TO_HAND` | Group C — not yet implemented |
| `IMMUNE_TO_TYPE` | Group C — not yet implemented |
| `DISCARD_AFTER_USE` | Group C — not yet implemented |
| `NEGATE_ALLY_BONUS` | Not in 1st edition, removed |
| `SET_LEVEL` | Group C — not yet implemented |
| `REVOKE_SPELL_ACCESS` | Not in 1st edition, removed |
| `EXTRA_REALM_PLAY` | Not in 1st edition, removed |
| `REALM_UNTARGETABLE` | Not in 1st edition, removed |
| `DISCARD_AFTER_COMBAT` | Not in 1st edition, removed |
| `PERMANENT` | Not in 1st edition, removed |

---

## 5. New type available: `REALM_SELF_DEFENDS`

If any **Holding** (typeId 8) card has description text like
"The attached realm can defend itself as a level N [type]", add this effect
(it was not in v1.1 so existing cards will have `[]`):

```json
{ "type": "REALM_SELF_DEFENDS", "level": 4, "typeId": 10 }
```

Replace `level` and `typeId` with the values from the card text.
Example card: Arabel (holding, "The attached realm can defend itself as a level 4 monster").

---

## Validation

After fixing, run:
```bash
bun run validate:effects              # validates cards/1st.json
bun run validate:effects cards/1st.json  # explicit path
```

Exit code 0 = all effects valid. Exit code 1 = errors printed per card.
