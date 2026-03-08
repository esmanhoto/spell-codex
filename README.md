# Spell

Monorepo for a deterministic Spellfire engine + API + web client.

## Stack

- Bun workspaces (`packages/*`)
- TypeScript (strict)
- Engine: pure TS (`packages/engine`)
- API: Hono (`packages/api`)
- DB: Postgres + Drizzle (`packages/db`)
- Web: React + Vite (`packages/web`)

## Prerequisites

- Bun
- Docker (for local Postgres)
- Supabase project (Auth enabled)
- `.env` in repo root (copy from `.env.example`)

Required env contract:

```env
DATABASE_URL=postgres://...
DATABASE_URL_MIGRATIONS=
DB_SSL=disable        # require|disable
DB_PREPARE=true       # set false for Supabase pooler
DB_MAX_CONNECTIONS=10
```

## First-time setup

```bash
bun install
bun run db:up
bun run db:migrate
```

## Run locally

API:

```bash
bun run --cwd packages/api dev
```

Web:

```bash
bun run --cwd packages/web dev
```

## Env profiles

Local Docker profile (default dev/tests without Supabase):

```env
DATABASE_URL=postgres://spell:spell@localhost:5433/spell
AUTH_BYPASS=true
VITE_AUTH_BYPASS=true
```

Supabase runtime profile (staging/prod-style auth + DB):

```env
DATABASE_URL=postgres://<supabase-postgres-url>
DATABASE_URL_MIGRATIONS=postgres://<optional-direct-migrations-url>
DB_SSL=require
DB_PREPARE=false
DB_MAX_CONNECTIONS=10
AUTH_BYPASS=false
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
VITE_AUTH_BYPASS=false
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Prefer a dedicated file for this profile:

```bash
cp .env.supabase.example .env.supabase
# fill values, then:
bun run db:migrate:supabase
```

Mock-auth e2e profile (no real Supabase calls):

```bash
bun run --cwd packages/web test:e2e:auth
bun run --cwd packages/web test:e2e:auth:ui
```

Default non-auth e2e profile (bypass mode only):

```bash
bun run --cwd packages/web test:e2e
bun run --cwd packages/web test:e2e:ui
```

## Supabase Auth Setup

1. In Supabase dashboard, create/open your project.
2. Go to `Authentication -> Providers` and enable:
   - `Email` (for email + password login)
   - `Google` (optional, for Google login)
3. Create users with passwords in `Authentication -> Users` (or reset password for existing users).
4. Copy values:
   - `Project URL` -> `SUPABASE_URL` + `VITE_SUPABASE_URL`
   - `Publishable` / `anon` key -> `SUPABASE_ANON_KEY` + `VITE_SUPABASE_ANON_KEY`
   - `Settings -> Database -> Connection string -> URI`:
     - Transaction pooler URI -> `DATABASE_URL`
     - Direct connection URI -> `DATABASE_URL_MIGRATIONS` (recommended for migrations)
5. Set `AUTH_BYPASS=false` and `VITE_AUTH_BYPASS=false`.
6. Start API + Web and open `/login`.

Notes:

- API verifies bearer tokens against Supabase Auth (`/auth/v1/user`).
- Lobby UI flow:
  - `Create a New Game` -> pick deck -> share Game ID -> wait for friend
  - `Join a Game` -> paste Game ID -> pick deck -> join
- For local fallback without Supabase, set:
  - API `AUTH_BYPASS=true`
  - Web `VITE_AUTH_BYPASS=true`

## Common commands

```bash
bun run lint
bun run ci:typecheck
bun run ci:test
bun run ci:test:web:auth-mock
bun run ci:build
bun run ci
```

DB helpers:

```bash
bun run db:up
bun run db:migrate
bun run db:migrate:local
bun run db:migrate:supabase
bun run db:down
# reset local DB data
bun run db:down:volumes
```

## Testing

### Running tests

```bash
# All engine tests
bun test packages/engine

# Only scenario tests
bun test packages/engine/test/scenarios/
```

### Scenario tests (`packages/engine/test/scenarios/`)

When implementing a new rule, we write a **scenario test** that pins the exact card
combination under test rather than relying on a full game setup. This makes it easy to
reproduce specific edge cases without navigating the lobby or drawing the right cards.

**How it works:**

1. Use the builder helpers in `test/scenario-builders.ts` to create minimal cards and
   a pre-built game state at the phase you care about.
2. Call `getLegalMoves()` or `applyMove()` on that state and assert the result.
3. One file per rule / interaction — name it after the rule being tested.

**Example — realm grants spell-casting to a non-caster defender:**

```ts
const attacker = inst("att", makeChampion({ level: 8 }))
const defender = inst("def", makeChampion({ level: 4 })) // no spell support
const realm = inst("realm", makeRealm({ supportIds: ["d19", "o19"] }))
const spell = inst("spell", makeWizardSpell())

const state = buildCombatCardPlayState({
  attacker,
  defender,
  targetRealm: realm,
  defenderHand: [spell],
})
const moves = getLegalMoves(state, "p2")

expect(moves.some((m) => m.type === "PLAY_COMBAT_CARD" && m.cardInstanceId === "spell")).toBe(true)
```

**Available builders:**

| Builder                            | Produces                                         |
| ---------------------------------- | ------------------------------------------------ |
| `inst(id, card)`                   | `CardInstance` with a stable ID                  |
| `makeChampion(overrides?)`         | Hero, level 5, no spell support                  |
| `makeRealm(overrides?)`            | Realm, no spell grants                           |
| `makeWizardSpell(overrides?)`      | Wizard spell, phase-4 castable, no direction tag |
| `makeMagicalItem(overrides?)`      | Magical item, no bonuses                         |
| `makeHolding(overrides?)`          | Holding, no special properties                   |
| `buildCombatCardPlayState(params)` | `GameState` in combat CARD_PLAY phase            |

Override only what matters for the rule under test — leave everything else at the default.

**When to add a scenario test:**

- Any time a new rule-granting interaction is implemented (realm/holding/item → spell access)
- Any time a bug is found in a specific card combination — write the failing test first,
  then fix the engine

## Troubleshooting

If API returns `500/503` with `Database unavailable`, DB is unreachable.

Fix:

```bash
bun run db:up
bun run db:migrate
```
