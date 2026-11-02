# DGS-699 Director: keep the factory running — Implementation Report

Ticket: DGS-699. Branch DGS-699__director, last code commit 043643db. Express lane: DGS-700, not built. Read "Suite" in spec.md and plan.md as "Castle".

## What changed
- **Authority list (`director/authority.ts`):** 11 within and 11 Jack-only ids, the authority paths, the approval line `Authority change approved by Jack: <date>: <paths>`, coverage by token, and the merge-time path rules.
- **Decision record and escalation:** every decision is journalled (`director/decisions.jsonl`) before its ClickUp comment; one question per ticket to `concept` (`escalations.jsonl`); failed comments queue and retry.
- **Refine lane:** the scan claims a `refinement` ticket (`refine-lock.json`, role slot), a refine worker writes spec and plan, a plan Reviewer judges them, and `dg director refine-release --result ready` applies the gate: fail closed, a plan that names an authority path needs Jack's line on the ticket, then `to do`. The lane runs after the build scan (also while the lock is held) and never changes its result.
- **Capacity and seats:** `laneState`, and `rankSeats` (the runbook rule as a pure, total order).
- **Unblock table:** `movesFor`, one row per case of spec 7, history keyed on ticket, run and id; releases are always `stopped`.
- **Plan, do, wake, `dg director`:** `plan`, `do <move-id>` (record first, then the effect; repeat-safe), `decide`, `escalate`, `refine-round`, `refine-release`, `seat`. The wake sends `Director tick: dg director plan` only when there are moves, the pane is idle with an empty input box, and the same list was not sent in the last 10 minutes.
- **Part 2 (Castle registry):** the Director is the open registry entry named `director` with kind factory. With one, the refine lane, the wake and the claim hand-off are on: a build claim names the project conductor as driver and prompts it, never the Director; tick orders go to the driver. Without one nothing changes.
- **Card, briefs, docs:** `skills/director/SKILL.md`, `brief.md`, `refine-brief.md`, `docs/director.md`, a "Director" section in `WATCHDOG.md`.
- **Protection:** `skills/director/` joins `DEFAULT_PROTECTED` and `protected_paths`; the merge gate refuses a branch that touches an authority path without Jack's approval record (code `authority-path`).

## Protected and authority paths touched (the merge needs the Maestro)
- `.digismith/config.yml`: ONE line added to `nightwatch.protected_paths`, `skills/director/` (commit 43156618). Protected and an authority path.
- `packages/cli/src/autonomous/` (protected): existing files `scan.ts`, `watch.ts`, `types.ts`, `index.ts`, `merge-gate.ts` (authority), `protected-paths.ts` (authority), `WATCHDOG.md`, tests `merge-gate.test.ts`, `protected-paths.test.ts`; new: the whole `director/` folder (authority paths), `scan-refine.test.ts`, `watch-wake.test.ts`, `index-director.test.ts`.
- `skills/director/` (authority; protected from this merge on).
- Not protected: `packages/cli/src/index.ts` (registers `dg director`), `docs/director.md`.
- Not touched: hooks/, skills/reviewer, skills/finishing-*, packages/cli/src/reviewer/, scripts/nexus-api/src/scheduler/, .digismith/mandate.yml, .digismith/profiles/.

## This branch cannot pass its own merge gate
It touches authority paths and no approval record exists (`<autonomous dir>/director/authority-approvals/DGS-699.json`), so `dg autonomous merge-gate` refuses it as `authority-path`. The Maestro merges by hand on Jack's written word (spec 4.4 states this limit).

## Tests
Whole suite (forks 2) over `packages/cli/src/autonomous`, `packages/cli/src/run`, `packages/cli/src/index.test.ts`, `packages/cli/src/strip-types.smoke.test.ts`: 75 files, 1503 tests, 1500 pass, 3 fail. The 3 are the known base failures and also fail on origin/main 1b64225d (same files run on a `git archive` copy: `guardrails.test.ts` scan_every_minutes, `autonomous/index.test.ts` busy hand builder, `run/index.test.ts` 7-day list).

## Review
Every task reviewed to clean (T1 to T4 and T5 with fix rounds, T6 clean at r1, Part 2 r1 and r2); whole branch ticket-final r1 with fixes (2 Important, 2 Minor), r2 (1 Important, 1 Minor new), r3 clean. See findings.md.

## Notes for the Maestro (after the merge)
- `start-again` and `reprompt` to `self` are not run by `dg director do`: the Director does them itself in its session and records them with `dg director decide --id restart-run|reprompt-run --run <run>`; a stuck refine run is stopped by the Director (`dg run event <run-id> lost`) and recorded. The card says so.
- Rebuild the CLI (`pnpm --filter @digismith/cli build`) for `dg director`.
- The live flip is a Maestro step (spec 12, plan "First use"): one atomic write of `conductors.json` (backup first) that adds `director` (Castle, kind factory) and changes `digismith-conductor` to `project`; start the Director session with `skills/director/brief.md` first.
- Known limits: the approval match for a short file token decides the tree by file extension (fails closed); a crash in `retryPendingComments` can resend one comment; a hand merge past the gate is not stopped by code.
- Not done by the Builder: no registry flip, no Director started, no install, no ClickUp write, nothing written under ~/.digismith-depot.

## First use
`dg director plan` on the real depot (read only), then `dg autonomous scan --dry-run` once the registry has a `director` entry.
