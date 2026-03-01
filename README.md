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
- `.env` file in repo root with `DATABASE_URL`

Example:

```env
DATABASE_URL=postgres://spell:spell@localhost:5433/spell
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
