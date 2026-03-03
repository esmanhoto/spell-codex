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

## Troubleshooting

If API returns `500/503` with `Database unavailable`, DB is unreachable.

Fix:

```bash
bun run db:up
bun run db:migrate
```
