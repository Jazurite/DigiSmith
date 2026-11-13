# DGS-699 Director: keep the factory running — Implementation Report

Ticket: DGS-699 (fix wave after the rebase: DGS-739). Branch DGS-699__director on origin/main 20b72915, last code commit a7b61af3. Express lane: DGS-700, not built. Read "Suite" in spec.md and plan.md as "Castle".

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

## Fix wave DGS-739 (after the rebase onto main 20b72915)
- **One status path:** main allows only the Steward to write a ticket status (`steward/status-writers.test.ts`, table untouched). The Director's two status moves now go through it: an escalation sends the new Steward event `returned` (refinement, discovery or to do, to concept; no quote); the refinement gate sends `approved` (into to do) with the Director's own decision text as the quote. New `director/status.ts` (`StatusPort`, `stewardStatus`; never throws). A Steward refusal throws in `escalate` before any comment, line or decision; `refine-release --result ready` returns exit 2 and keeps the lock; the scan lane logs a `refine-failed` event and goes on.
- **Claim flow:** no code change in the wiring. `index-director.test.ts` read the live depot, where a live role run filled main's role limit (DGS-665); it now uses an empty temp depot.
- **Two type errors** (`refine-lane.ts`, `refine.ts`) that `tsc` found and the strip-types test runs do not: they made `index.e2e.test.ts` fail on "Failed to build". `tsc` exits 0 on origin/main and on the branch.
- The test fake for the status port follows the real Steward rules (`evaluate`), so the Director's tests can see a refused move. `docs/director.md` has one line on the clickup-profile need.

## Deviations for the Maestro
- **A new Steward event `returned`** (refinement, discovery or to do, to concept; no quote; sent only by the Director's code, never by a skill hook). The conductor approved it: no event fitted the escalation, and `shaped` is backlog to concept only. The status flow SOP DGS-731 needs a line for it (to do -> concept via `returned`); the Dock session decides the SOP text. Files: `steward/types.ts`, `rules.ts`, `README.md` and the three test files.
- **`approved --into "to do"` needs a quote** (it is a gate event). The Director sends its own decision text as the quote: "Director refinement gate for <KEY>: the plan Reviewer report is clean and the readiness check passed".
- **`tracker: none` profile:** every Director escalation then fails with "no ClickUp tracker" (the Steward has no tracker). The Workbox profile is clickup, so no action; noted in `docs/director.md`.
- `packages/cli/src/steward/` is not in `DEFAULT_PROTECTED`; the Maestro may still want to look at it.

## Protected and authority paths touched (the merge needs the Maestro)
- `.digismith/config.yml`: ONE line added to `nightwatch.protected_paths`, `skills/director/` (commit 43156618). Protected and an authority path.
- `packages/cli/src/autonomous/` (protected): existing files `scan.ts`, `watch.ts`, `types.ts`, `index.ts`, `merge-gate.ts` (authority), `protected-paths.ts` (authority), `WATCHDOG.md`, tests `merge-gate.test.ts`, `protected-paths.test.ts`; new: the whole `director/` folder (authority paths, now with `status.ts`, `status.test-util.ts`, `status.test.ts`), `scan-refine.test.ts`, `watch-wake.test.ts`, `index-director.test.ts`. `authority.ts` lists unchanged.
- `skills/director/` (authority; protected from this merge on).
- Not protected: `packages/cli/src/index.ts` (registers `dg director`), `docs/director.md`, `packages/cli/src/steward/` (`types.ts`, `rules.ts`, `README.md`, `rules.test.ts`, `event.test.ts`, `hook-wiring.test.ts`: the `returned` event).
- Not touched: hooks/, skills/reviewer, skills/finishing-*, packages/cli/src/reviewer/, scripts/nexus-api/src/scheduler/, .digismith/mandate.yml, .digismith/profiles/.

## This branch cannot pass its own merge gate
It touches authority paths and no approval record exists (`<autonomous dir>/director/authority-approvals/DGS-699.json`), so `dg autonomous merge-gate` refuses it as `authority-path`. The Maestro merges by hand on Jack's written word (spec 4.4 states this limit).

## Tests
Full `packages/cli` suite (forks 2, load 4): 208 files, 3429 tests, 3428 pass, 1 fails: `autonomous/guardrails.test.ts` "sets scan_every_minutes to 15 and reads clean" (limits `{builder: 2, reviewer: 2, role: 1}` vs `{builder: 2, reviewer: 1, role: 1}`, DGS-720). It also fails on origin/main 20b72915: the same file on a `git archive` copy in the scratchpad, 52 tests, 1 failed, the same message. Nothing else fails: `index.e2e.test.ts` (3 tests), `strip-types.smoke` and the nightwatch tests pass. `tsc -p tsconfig.build.json --noEmit` exits 0 (also on origin/main).
nexus-web (`scripts/nexus-web`): `grid.test.ts` and `build-www.test.ts` pass on the branch, 29 tests (the branch changes nothing under `scripts/`). They could not run on the main copy (the Nuxt test utils need a real install), so they are no failure on the branch; the Dock run failed them under load or environment.
Earlier whole-suite numbers before the rebase (autonomous, run, index, smoke; 75 files, 1503 tests, 3 base failures on 1b64225d) are in the ledger.

## Review
Every task reviewed to clean (T1 to T4 and T5 with fix rounds, T6 clean at r1, Part 2 r1 and r2); whole branch ticket-final r1 with fixes (2 Important, 2 Minor), r2 (1 Important, 1 Minor new), r3 clean. Fix wave DGS-739: whole-branch review r1 with one Important (returned did not cover a to do ticket, spec 4.1), fixed; r2 clean. See findings.md.

## Notes for the Maestro (after the merge)
- `start-again` and `reprompt` to `self` are not run by `dg director do`: the Director does them itself in its session and records them with `dg director decide --id restart-run|reprompt-run --run <run>`; a stuck refine run is stopped by the Director (`dg run event <run-id> lost`) and recorded. The card says so.
- Rebuild the CLI (`pnpm --filter @digismith/cli build`) for `dg director`.
- The live flip is a Maestro step (spec 12, plan "First use"): one atomic write of `conductors.json` (backup first) that adds `director` (Castle, kind factory) and changes `digismith-conductor` to `project`; start the Director session with `skills/director/brief.md` first.
- Known limits: the approval match for a short file token decides the tree by file extension (fails closed); a crash in `retryPendingComments` can resend one comment; a hand merge past the gate is not stopped by code.
- Not done by the Builder: no registry flip, no Director started, no install, no ClickUp write, nothing written under ~/.digismith-depot.

## First use
`dg director plan` on the real depot (read only), then `dg autonomous scan --dry-run` once the registry has a `director` entry.
