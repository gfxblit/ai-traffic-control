# Dashboard Control-Plane Roadmap

This document persists the implementation plan for scientist slots (`Feynman`, `Einstein`, `Gauss`, `Fermi`) and the ttyd dashboard.

## Goals
- Treat each scientist as a controllable slot with lifecycle state (`idle`, `active`, `error`).
- Keep the dashboard as the operator surface (spawn, kill, connect, metadata).
- Track operational context needed for long-running Codex/Claude sessions.
- Build with a fast visual feedback loop using mobile screenshots.

## Milestone 1: Session Lifecycle Control
Scope:
- All slots start idle.
- Dashboard can spawn a slot on demand.
- Dashboard can kill a running slot.
- Card interaction model:
  - Idle card tap -> spawn.
  - Active card tap -> connect.
  - Right-side kill (`×`) button -> terminate slot.

Acceptance criteria:
- No ttyd backend is running after reset/start.
- Spawning a slot marks it active and makes its link reachable.
- Killing a slot marks it idle and disables connect behavior.

## Milestone 2: Task Metadata + Workdir
Scope:
- Add per-slot metadata: `taskTitle`, `workdir`, `agentType`.
- Set shell cwd from configured workdir at spawn.
- Show title + workdir directly on dashboard cards.

Acceptance criteria:
- Each card shows task title and workdir before connecting.
- Metadata can be changed without respawning.

## Milestone 3: Interaction Logging + Timeline
Scope:
- Persist append-only session transcript logs.
- Track `spawnedAt`, `firstInteractionAt`, `lastInteractionAt`.
- Show "active for" and "last interaction" on dashboard.

Acceptance criteria:
- Logs exist per slot.
- Last-interaction timestamp updates while session is used.

## Milestone 4: Turn Hooks for Codex/Claude
Scope:
- Capture turn-level events where possible via native hooks.
- Fallback parser mode from PTY/transcript markers.
- Store structured events (`actor`, `timestamp`, usage fields when available).

Acceptance criteria:
- Dashboard can report turn count + most recent actor/event.

## Milestone 5: Context Usage Tracking
Scope:
- Prefer exact usage from tool/CLI outputs.
- Fallback estimate from transcript tokenization.
- Show per-slot context usage and reset windows.

Acceptance criteria:
- Per-slot context widget is visible and populated (or explicit `N/A`).

## Milestone 6: Auto Summary + Task Naming
Scope:
- Background summarizer per slot.
- Auto-suggest title and one-line progress summary.
- Manual title lock support.

Acceptance criteria:
- Dashboard shows usable at-a-glance summaries across all active slots.

## Milestone 7: Hardening
Scope:
- Health checks and stale-process cleanup.
- Safe termination policy (TERM -> KILL).
- Log rotation/retention.
- Basic auth boundary for control endpoints.

Acceptance criteria:
- Lifecycle controls are reliable across restarts and failures.

## Fast Feedback Loop
- Use a Playwright mobile screenshot script to capture dashboard state after each UI change.
- Primary target viewport/device: `Pixel 7`.
- Standard loop:
  1. Apply change.
  2. Capture screenshot.
  3. Review image.
  4. Iterate.

Suggested commands:
- `./dashboard/scripts/start-ttyd-sessions.sh`
- `./dashboard/scripts/start-dashboard.sh`
- `./dashboard/scripts/mobile-screenshot.sh http://127.0.0.1:1111 dashboard/run/dashboard-mobile.png`
