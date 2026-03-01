# AGENTS

## Be extremely concise and sacrifice grammar for the sake of concision

## Scope
- Work only in active code: `packages/engine`, `packages/api`, `packages/db`, `packages/web`, `packages/data`.
- Ignore `CrossFire READONLY/` and `data_bp_READONLY/`.

## Stack
- Monorepo: Bun workspaces (`packages/*`).
- Language: TypeScript strict (`strict`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`).
- Runtime/tools: Bun (`bun run`, `bun test`), Node pinned in `.tool-versions`.
- API: Hono + Zod validator.
- DB: PostgreSQL + Drizzle ORM/kit.
- Web: React 18 + Vite + React Router + TanStack Query.
- Engine: pure TS game engine (`@spell/engine`).

## Architecture
- `engine` is deterministic/pure core (`applyMove`, legal moves, init, combat).
- `db` is persistence + event log (`game_actions`) + state reconstruction by replay + state hash check.
- `api` is transport/orchestration: auth header, validate, reconstruct, apply engine move, persist action, bot loop, deadlines/ws.
- `web` is client UI only; talks to API.
- `data` is ETL/extraction/validation scripts generating cards/decks/formats assets.

## Practices
- Keep engine logic in `packages/engine`; do not reimplement rules in API/web.
- Validate request input at API edge with Zod.
- Persist moves, never mutate ad-hoc state in DB.
- Reconstruct state by replay; trust engine output, use hash mismatch as integrity signal.
- Keep imports with `.ts`/`.tsx` extensions (repo pattern).
- Prefer small pure helpers; explicit types over implicit any.
- Add/adjust tests with behavior changes (`bun:test` used across engine/api/db).
- Use existing package boundaries; avoid cross-package leakage.

## Add Code
1. Choose package by concern:
- rules/simulation -> `engine`
- persistence/migrations -> `db`
- endpoints/ws/auth flow -> `api`
- UI/client state -> `web`
- card/deck/format pipeline -> `data`

2. Implement minimal change in-package, then wire outward (usually `engine` -> `db`/`api` -> `web`).

3. If schema changes:
- edit `packages/db/src/schema.ts`
- run `bun run --cwd packages/db db:generate`
- run `bun run --cwd packages/db db:migrate`

4. Run checks:
- `bun run --cwd packages/engine typecheck && bun run --cwd packages/engine test`
- `bun run --cwd packages/api typecheck && bun run --cwd packages/api test`
- `bun run --cwd packages/db typecheck && bun run --cwd packages/db test`
- `bun run --cwd packages/data typecheck`
- `bun run --cwd packages/web build`

## Local Infra
- DB via `docker-compose up -d` (Postgres on `localhost:5433`).
- `.env` must set `DATABASE_URL`.
