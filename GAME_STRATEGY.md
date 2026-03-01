# Game Strategy (Merged Summary)

This file is the concise merge of ideas from `GAME_PLAN.md` and `NEW_PLAN.md`.

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
- Enforce spell phase-direction metadata from card descriptions (e.g. defensive 4 vs defensive 3/4) in legal-move checks.
- Gradually reintroduce selective high-value automation only where it reduces friction and is low-risk.
- Expand integration tests around multiplayer/manual workflows and phase constraints.
- Add release automation around tagged versions when deployment cadence stabilizes.
- Revisit async-turn/deadline features after real-time UX is stable.

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
