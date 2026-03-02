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
- `.env` file in repo root with `DATABASE_URL`

Example:

```env
DATABASE_URL=postgres://spell:spell@localhost:5433/spell
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_ANON_KEY=<your-anon-public-key>
```

For web local dev (`packages/web/.env.local`):

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-public-key>
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

## Supabase Auth Setup

1. In Supabase dashboard, create/open your project.
2. Go to `Authentication -> Providers` and enable:
   - `Email` (for email + password login)
   - `Google` (optional, for Google login)
3. Create users with passwords in `Authentication -> Users` (or reset password for existing users).
4. Copy values:
   - `Project URL` -> `SUPABASE_URL` + `VITE_SUPABASE_URL`
   - `Publishable` / `anon` key -> `SUPABASE_ANON_KEY` + `VITE_SUPABASE_ANON_KEY`
5. Start API + Web and open `/login`.

Notes:
- API verifies bearer tokens against Supabase Auth (`/auth/v1/user`).
- Lobby UI flow:
  - `Create a New Game` -> pick deck -> share Game ID -> wait for friend
  - `Join a Game` -> paste Game ID -> pick deck -> join
- For tests/local fallback without Supabase, set bypass envs:
  - API: `AUTH_BYPASS=true`
  - Web: `VITE_AUTH_BYPASS=true`

## Common commands

```bash
bun run lint
bun run ci:typecheck
bun run ci:test
bun run ci:build
bun run ci
```

DB helpers:

```bash
bun run db:up
bun run db:migrate
bun run db:down
# reset local DB data
bun run db:down:volumes
```

## Troubleshooting

If API returns `500/503` with `ECONNREFUSED ...:5433`, Postgres is not running.

Fix:

```bash
bun run db:up
bun run db:migrate
```
