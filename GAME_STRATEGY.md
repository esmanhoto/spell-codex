# Game Strategy (Merged Summary)

This file is the concise merge of ideas from `GAME_PLAN.md` and `NEW_PLAN.md`.

## Plan Status

- Active plan document: `GAME_STRATEGY.md`.
- Legacy plan documents moved to `archive/GAME_PLAN.md` and `archive/NEW_PLAN.md` for historical reference only.

## Ideas

- Build a deterministic, replayable engine core that enforces game structure (turns, phases, legal moves, formation, uniqueness rules).
- Keep API as orchestration/persistence (event log + replay), not rule logic.
- Keep web as client UI and real-time interaction layer.
- Prioritize manual, player-driven gameplay over full rules automation for now.

## Implemented

- Pure engine move flow with deterministic `applyMove` and legal move generation.
- Event-log persistence/replay architecture in backend flow.
- Real-time WebSocket gameplay loop wired in API/web.
- Manual board-control moves for own cards and opponent-affect actions.
- Manual combat-level adjustment and combat-side switching controls.
- CI baseline with lint, typecheck, tests, and build checks.
- Branch-protection-compatible CI triggers for push/PR and tags.
- Removed Tier 1/Tier 2 effect runtime pipeline and response-window/pending-effect mechanics.
- Supabase auth integration (email/password) with bearer-token API verification.
- Clean lobby flow (`Create a New Game` / `Join a Game`) using sharable `gameId` and waiting room.
- Per-view hidden-information rendering (opponent hand hidden, own hand visible) with two-tab play support.
- Supabase runtime DB env contract and connection tuning:
  - `DATABASE_URL`, `DATABASE_URL_MIGRATIONS`
  - `DB_SSL`, `DB_PREPARE`, `DB_MAX_CONNECTIONS`
- DB migration path split (`DATABASE_URL_MIGRATIONS` fallback to `DATABASE_URL`).
- Local/runtime env examples for Docker profile and Supabase profile (`.env.example`, `.env.supabase.example`).
- Mocked non-bypass auth coverage:
  - API: bearer auth tests with mocked Supabase `/auth/v1/user`.
  - Web: dedicated auth e2e profile with local mock Supabase server and dual-user realtime flow tests.
- Playwright profile separation:
  - default e2e (bypass/local profile)
  - auth e2e (non-bypass/mock Supabase profile)
- Runtime DB error text cleanup to neutral guidance (`Verify DATABASE_URL and DB availability.`).
- Full manual mode milestone delivered:
  - `full_manual` is the default for new games.
  - Runtime `playMode` persisted (`games.play_mode`) and serialized to clients.
  - Manual governance controls shipped (mode switch, end turn, active player, draw count, hand limit).
  - Manual->semi switch guard added with consistency validation + actionable reasons.
  - Web interactions migrated to manual action builders (right-click/drag/click) with a temporary debug move-panel gate.
  - Manual warnings support per-warning browser suppression (`Don't show again`, localStorage scope).
  - Deadline auto-pass startup disabled for now.
  - Added coverage in engine/api/ws/web e2e for mode switching, warnings, and manual play/cast flows.

## Supabase Runtime/Auth Milestone Status

- Scope completed:
  - Runtime DB configuration cleanup for Supabase-ready usage.
  - Mocked non-bypass auth tests (API + web e2e).
  - Docs/env profile updates for local Docker vs Supabase runtime.
  - CI now runs both web e2e profiles:
    - bypass profile (`test:e2e`)
    - auth-mock profile (`test:e2e:auth`)
- Scope intentionally unchanged:
  - CI main gate remains local Postgres service (no Supabase dependency).
- RLS (Row Level Security):
  - Enabled on all tables (`games`, `game_players`, `game_actions`) with **no policies** (deny-all default).
  - App connects via `postgres` role (Drizzle + direct driver), which bypasses RLS — no impact on app queries.
  - Purpose: block unauthorized access through Supabase's auto-exposed PostgREST endpoints (anon key is public).
  - Do NOT add policies unless the app starts using PostgREST or supabase-js for DB queries (it shouldn't).

## Future Implementation

- Increase test coverage with priority on web and end-to-end gameplay flows (create game, turn progression, combat resolution).
- Add API contract tests to lock web/api response shape.
- Implement 1st-edition spell gating for Cleric/Wizard spells only (type `4`/`19`): enforce cast phase (`3`,`4`,`5`) + spell direction (`Off`/`Def`), without "any-time response" behavior for now.
- Add selected combat options in small vertical slices with tests.
- Keep Google OAuth disabled for now; revisit when product onboarding is stable.
- Add real Supabase auth tests (not bypass-mode only):
  - API integration tests for bearer-token auth paths.
  - Web e2e for login + dual-user session flow.
- Connect runtime DB to Supabase Postgres (remove local-only Docker dependency from default dev path).
- Define CI strategy for DB tests when using Supabase-managed Postgres.
- Add Vercel deployment pipeline (web first, then API path decided by hosting constraints).
- Add staging environment before production rollout.
- Add observability baseline (structured logs + error tracking).
- Add backup/restore + migration safety checklist.
- Gradually reintroduce selective high-value automation only where it reduces friction and is low-risk.
- Add release automation around tagged versions when deployment cadence stabilizes.
- Revisit async-turn/deadline features after real-time UX is stable.
- New features ideas:

* build your own deck
* selectable music background
* full manual mode
* full effects mode
* vaquinha solidária
* cronometro de combate

## Delivery Guardrails

- Keep milestone scope explicit: define what is in/out before each implementation cycle.
- Prefer vertical slices (engine + api + web + tests) over broad unfinished refactors.
- Use semantic tags (`vX.Y.Z`) for releases and maintain a short changelog.
- Maintain a small ADR log for major decisions (manual mode, bot removal, deploy choices).

## Learnings

- Full card-text automation early creates complexity and slows delivery.
- Strong guardrails (CI + branch protection + strict typing) keep iteration safe even with manual gameplay.
- Manual-first still benefits from strict structural enforcement; players need freedom inside a controlled flow.
- Keeping engine pure and deterministic makes refactors safer and testability much better.

## Effects Decision Summary

- Current decision: ignore card-text effects execution in engine.
- Keep only structural gating and support-based eligibility checks.
- Manual actions are the primary mechanism, not fallback.
- Card descriptions remain relevant mainly for human play guidance and upcoming phase-direction constraints.
- No JSON regeneration is required now; existing card data can be kept with effects ignored.
- Keep `supportIds` as-is for now; revisit naming/cleanup in a separate dedicated task.
