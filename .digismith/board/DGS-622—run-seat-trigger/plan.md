# DGS-622 plan: seat, trigger and lifecycle events for automatic runs

Status: built and reviewed 2026-10-26; Tasks 1 to 4 done, ticket review clean after one fix wave (see `report.md`, `findings.md`).

Spec: `spec.md` in this folder. Work in the worktree `.worktrees/dgs-622`, branch `DGS-622__run-seat-trigger`. Test first in every task. Fake clients and temp folders only: no real depot, no real herdr, no ClickUp.

Setup (fresh worktree): `pnpm install --frozen-lockfile` (inside the worktree only, never in the depot clone). `pnpm --filter @digismith/clickup-client build` only if a test import fails for a missing build.
Tests: `pnpm vitest run packages/cli/src/run packages/cli/src/oculus scripts/nexus-shared scripts/nexus-api/src/oculus-route.test.ts scripts/nexus-api/src/oculus-contract.test.ts`; web: `pnpm --filter @digismith/nexus-web exec vitest run app/components/oc/runs.test.ts`; shell: `/bin/bash scripts/claude-account/test-claude-account.sh`.

### Task 1: Trigger words and the Key column
Files: `packages/cli/src/oculus/derive.ts`, `packages/cli/src/oculus/types.ts`, `packages/cli/src/oculus/derive.test.ts`, `scripts/nexus-shared/oculus.ts`, `scripts/nexus-shared/oculus.test.ts`, `scripts/nexus-web/tests/oculus-fixtures.ts`, `scripts/nexus-web/app/components/oc/WorkersTable.stories.ts`, `scripts/nexus-web/app/components/oc/RunsTable.vue`, `scripts/nexus-web/app/components/oc/runs.test.ts`.
1. Test first. In `derive.test.ts` replace the case `is unknown when the run has no order` and add (the `run()` helper takes `source` and `role` overrides):
   - `is auto for an automatic run with no order`: `run({ order: null, source: "auto" })`, no claim -> `auto`.
   - `is manual for a dg run start run with no order`: `source: "start"` -> `manual`.
   - `is night-scan for an automatic builder the scan claimed`: `order: null, source: "auto", role: "builder"`, a `claim` event, no away -> `night-scan`.
   - `is away for that builder when the claim is inside an away window` (same shape as the existing away case).
   - `an automatic reviewer with a claim for its ticket stays auto`.
   - `never returns unknown` (loop over order null / manual / autonomous x source auto / start).
   In `scripts/nexus-shared/oculus.test.ts`: `TRIGGERS is manual, night-scan, away, auto`, and a run row with `trigger: 'unknown'` fails `runsSchema`. In `runs.test.ts`: `Key falls back to the project, then to a dash` (a row with `ticket: null, project: 'DigiSmith'` shows `DigiSmith` in the Key cell; with both null it shows `-`).
2. Run the tests: they fail.
3. `types.ts`: `Trigger = "manual" | "night-scan" | "away" | "auto"`. `scripts/nexus-shared/oculus.ts` line `TRIGGERS`: same four. `derive.ts` `triggerOf`: the order of spec section A (`run.order` non-null and not `isAutonomousOrder` -> `manual`; autonomous order, or `order === null && run.role === "builder" && claim !== null` -> the existing away / night-scan block; else `run.source === "auto" ? "auto" : "manual"`). `RunRecord.source` is missing on old records: treat missing as `start`.
4. `oculus-fixtures.ts` (three rows) and `WorkersTable.stories.ts`: `trigger: 'unknown'` -> `trigger: 'auto'`. `RunsTable.vue` Key cell: `{{ r.ticket ?? r.project ?? '-' }}`.
5. Run the three test commands above for the touched paths: pass. Run `pnpm --filter @digismith/nexus-web typecheck`.
6. Commit: `feat(oculus): read auto for automatic runs and show the project as key`

### Task 2: The seat of an automatic run, and the probe tag
Files: new `packages/cli/src/run/seat.ts`, new `packages/cli/src/run/seat.test.ts`, `packages/cli/src/run/auto.ts`, `packages/cli/src/run/auto.test.ts`, `packages/cli/src/run/label.ts`, `packages/cli/src/run/label.test.ts`.
1. Test first, in `seat.test.ts` (temp HOME folder, fake `.claude.json` with `oauthAccount.emailAddress` only, no token):
   - `DIGISMITH_SEAT wins`.
   - `an unsafe DIGISMITH_SEAT is dropped` (`"a b"` falls to step 2).
   - `reads the local part of the login email when no token variable is set` (`Jack@jazurite.com` -> `jack`).
   - `reads $CLAUDE_CONFIG_DIR/.claude.json when CLAUDE_CONFIG_DIR is set`.
   - `skips the file when CLAUDE_CODE_OAUTH_TOKEN is present` (canary: the fake file would answer `wrong`; the result is `null`). Same for `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_API_KEY`. The test gives a token variable a dummy value like `x`.
   - `a missing, empty or bad file gives null`.
   - `the token value is never read`: pass `env` as a Proxy that records property reads; the three token names are only checked with `in`, never read with `get`.
   In `auto.test.ts`: `startAuto records DIGISMITH_SEAT as the seat` and `startAuto records the login seat from the fake .claude.json` (env `HOME` = temp folder). In `label.test.ts`: `a pane named usage-probe gets project usage-probe and role scout`; `a pane named dgs-598 keeps its project`.
2. Run the tests: they fail.
3. `seat.ts`: `export function seatOf(env: NodeJS.ProcessEnv): string | null` as spec section C. Imports `node:fs`, `node:os`, `node:path` and `plainName` only (hook speed). `auto.ts`: `seat: seatOf(env)` replaces `env1(env.DIGISMITH_SEAT)`. `label.ts` `labelRun`: when `entry?.name` includes `probe`, the rewritten record gets `project: "usage-probe"`.
4. Run `pnpm vitest run packages/cli/src/run`: pass.
5. Commit: `feat(run): fill the seat of an automatic run and tag usage probes`

### Task 3: `claude-account env` exports the seat name
Files: `scripts/claude-account/claude-account`, `scripts/claude-account/test-claude-account.sh`.
1. Test first, next to the existing `env` checks (near `env jack while active=izanami`):
   - `env jack: exports DIGISMITH_SEAT=jack` (`grep -q '^export DIGISMITH_SEAT=jack$'`).
   - `env izanami: exports DIGISMITH_SEAT=izanami`.
   - `env: the DIGISMITH_SEAT line holds no secret` (the fake secret string from the test header is absent from lines starting `export DIGISMITH_SEAT`).
2. Run the shell test: the new checks fail.
3. `cmd_env`: in the seat branch add `printf 'export DIGISMITH_SEAT=%q\n' "$name"` before the token line; in the gateway branch the same line before the base url line. The name has passed `valid_name`.
4. Run `/bin/bash scripts/claude-account/test-claude-account.sh`: all pass.
5. Commit: `feat(claude-account): export the seat name with the login`

### Task 4: Lifecycle events from the tool hook
Files: new `packages/cli/src/run/lifecycle.ts`, new `packages/cli/src/run/lifecycle.test.ts`, `packages/cli/src/run/hook.ts`, `packages/cli/src/run/hook.test.ts`.
1. Test first, in `lifecycle.test.ts` (temp depot with two fake builder runs under `runs/DGS-9/`, made with `createRun`; payload `{ session_id, tool_name: "Bash", tool_input: { command }, tool_response: {} }`):
   - `lifecycleOf` (pure, no disk): `dg reviewer pack --type ticket --ticket DGS-9 ...` -> `{ type: "review_ready", ticket: "DGS-9", data: { scope: "ticket", round: 1 } }`; `--round 2` -> round 2; `--type task` -> `null`; `git update-ref refs/digismith/post-finish/DGS-9__x-y/head HEAD` -> `{ type: "merged", ticket: "DGS-9" }`; `git push origin main` and `GIT_SSH_COMMAND=x git push origin master` -> `{ type: "pushed", ticket: null }`; `git push -u origin DGS-9__x` -> `null`; `git status` -> `null`; a non-Bash tool -> `null`.
   - `writeLifecycle writes review_ready to the newest builder run of the ticket` (two runs, the later `created_at` gets it).
   - `writeLifecycle ignores a reviewer run and writes nothing when the ticket has no builder run`.
   - `merged is written once per run`.
   - `pushed goes to builder runs with merged and no pushed, from the last 7 days only`.
   - `the event data holds no command text` (read `events.jsonl`; the command string is absent).
   - `the finishing skill still contains the pin command`: read `skills/finishing-a-development-branch/SKILL.md` (path from `import.meta.dirname`), expect `git update-ref refs/digismith/post-finish/<feature-branch>/head`.
   In `hook.test.ts`: `runHook tool writes the tool event and the lifecycle event`; `a lifecycle failure does not stop the tool event or throw` (unwritable run folder, a `logError` line appears).
2. Run the tests: they fail.
3. `lifecycle.ts`: `lifecycleOf(payload): { type; ticket: string | null; data } | null` (regexes only, no shell parsing; `ticketOfBranch` from `repo-info.ts`; `TICKET_KEY` from `../ticket-key.ts`), `newestBuilderRun(ticket, env): { dir; run } | null` (list `runs/<ticket>/`, `readRun`, role `builder`, max `created_at`), `writeLifecycle(payload, env, now = new Date())` (`appendEvent(dir, run, type, data, waitFor("tool"))`; `merged` skipped when `readEvents` already has one; `pushed` loops the builder runs of the last 7 days). `hook.ts` `runHook`: for `k === "tool"`, `try { writeLifecycle(p, env); } catch (e) { logError("lifecycle", (e as Error).message, env); }`, placed before the `if (!target) return;` line (a session with no run of its own, such as the conductor, still merges tickets). No import of `node:child_process`.
4. Run `pnpm vitest run packages/cli/src/run scripts/run-events`: pass (the hook stays inside the limit in `hook-timing.test.ts`).
5. Commit: `feat(run): write review_ready, merged and pushed from the tool hook`

## After Task 4
Run every test command from the top once. Then the normal flow (task Reviewers, ticket Reviewer). No protected path may be in the diff: `git diff --name-only main...HEAD` lists none of `hooks/`, `skills/`, `packages/cli/src/reviewer/`, `packages/cli/src/autonomous/`, `scripts/nexus-api/src/scheduler/`, `.digismith/config.yml`.
