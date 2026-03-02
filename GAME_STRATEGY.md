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

## Future Implementation
- Increase test coverage with priority on web and end-to-end gameplay flows (create game, turn progression, combat resolution).
- Add API contract tests to lock web/api response shape.
- Implement 1st-edition spell gating for Cleric/Wizard spells only (type `4`/`19`): enforce cast phase (`3`,`4`,`5`) + spell direction (`Off`/`Def`), without "any-time response" behavior for now.
- Add selected combat options in small vertical slices with tests.
- Integrate Supabase for auth and managed Postgres usage.
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
* 

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
