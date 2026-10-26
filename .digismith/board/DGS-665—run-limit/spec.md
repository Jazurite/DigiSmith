# DGS-665 Spec: a limit on concurrent runs

Written 2026-10-26 (UTC+7) by worker `dgs-665-refine`. Checked against `origin/main` 9320aa0b. Docs only: nothing is built.

## Goal

Jack, 2026-10-26: at any given time at most 2 builders, 1 reviewer and 1 role. The factory ticket counts as one of the 2 builders. (His first words were "only 1 builder and 1 reviewer and 1 role"; he raised builders to 2 when he approved this spec, about 19:1x UTC+7.) The Workbox hit load 140 with full swap when four builders ran full vitest suites together.
The system must refuse to start a run that would pass the limit. Until it ships, order dm-03 holds the limit by hand.

## What exists today (checked)

- A run is a folder `runs/<ticket|project>/<run-id>/` with `run.json` (frozen) and `events.jsonl` (`packages/cli/src/run/`). `dg run list [--json]` gives one row per run with `summary.ended` and `summary.last_type`.
- `summary.ended` is true only when an `ended` event follows the last `started` (`summarize` in `run/read.ts`). Hooks write `started`, `blocked` (a permission or idle notice), `tool`, `turn_end` (Stop: the agent finished its turn and waits), `ended` (SessionEnd). The conductor writes `review_ready`, `merged`, `pushed`, `lost`, `phase`.
- Roles in `run.json`: builder, reviewer, scout, maestro, conductor, other. `role_from` says how the role was found (`start`, `herdr`, `identity`, `pending`, `none`).
- The factory lock is `autonomous/lock.json` (`readLock`). `runScan` already returns `busy` while a lock is held, so the factory never claims two tickets. Nothing looks at hand-started runs.
- `.digismith/config.yml` has a `nightwatch:` block read by `readGuardrails` (`autonomous/guardrails.ts`). It holds `scan_every_minutes`, `budgets`, `protected_paths`. An unknown key in the block is a guardrail problem that stops the scan.
- `dg run start` (`run/index.ts`, `run/record.ts`) writes `run.json` and prints the id. It never refuses for load.
- `dg autonomous status` (`statusLines`) prints away, lock, phase, scan interval, last scan, newest report.
- Catch-up Health (`scripts/catch-up.ts`) prints Seats and usage, Server, Open tabs. Its data comes from the conductor's note block (`scripts/conductor/state-block.ts`, Health section; `Server` and `Open tabs` are computed, not read).
- Evidence the hand rule needs code: `dg run list` shows `builder-20261026T120005-f87e41 DGS-557 ... dev0` open at 12:00 UTC (19:00 UTC+7), beside the refiner. That was allowed: the Maestro started it. It is not a breach, but it shows that the only record of the count is a person reading `dg run list`. The code makes the count one command.

## Decisions

### D1. One counting rule, one module

A new `packages/cli/src/run/limit.ts` holds the rule. It has no yargs and no network. Three callers use it: `dg run start`, the autonomous scan, and the two display places. One rule means one answer everywhere.
`limit.ts` exports `countSlots(rows, lock, now, limits)` (pure, takes run rows from `listRuns`) and `readLimits(configText)`.

### D2. Kinds

| Kind | Which runs |
| --- | --- |
| builder | `role = builder` |
| reviewer | `role = reviewer` |
| role | `role = scout`, plus `role = other` only when `role_from` is `herdr` or `start` |

`maestro` and `conductor` never count: they are the control plane, always on. `other` with `role_from` `none`, `pending` or `identity` is a Desktop or SSH session or a headless `claude -p` helper, not a herdr worker, so it never counts. Reason: Jack's rule is about workers, and counting his own sessions would lock him out.

### D3. What "open" means (active)

A run holds a slot only when all four are true:
1. It has no closing event. Closed = `ended` after the last `started` (today's `summary.ended`), or the last event is `lost`.
2. Its last event is not `turn_end` or `blocked`. Those mean the agent waits for input and holds no CPU. This is the dm-03 line "a builder that waits for a merge approval or a review is not running". A permission prompt is the same.
3. Its last event is newer than the stale window (D4).
4. It is within the `runs/` window `listRuns` already reads (7 days default; the limit reads with `--days 2`, which is above the stale window).

So: a builder in the merge or review wait is free; a builder with `tool` or `phase` as its last event is busy.
`started` with no later event also counts as busy, for the stale window.

Order matters when read: a hook event for a run in `blocked` followed by `tool` is busy again. The last event decides.

### D4. How a stale record is cleared

A run that never wrote `ended` (the pane died, the machine slept, `kill -9`) would block forever. Two ways, both small:
- **Automatic.** A run whose last event is older than `stale_after_minutes` (default 120) does not count. It is shown as `stale` in the status output, never hidden. Reason: a busy agent writes a `tool` event at least every few minutes; two hours of silence with no `turn_end` means the process is gone. A long single tool call is under 10 minutes (the Bash maximum).
- **By hand.** `dg run event <run-id> lost` already exists and now also closes the run (the conductor uses it for a worker that is gone). No new command.

The stale window is read-time only. No record is rewritten and no file is deleted. This keeps the append-only record true.
Known cost: a background job a worker started and left running (idle agent, busy CPU) is not seen. Accepted: the rule counts agents, and the Maestro's note says to run tests in the foreground.

### D5. The factory builder

Jack: the factory's claimed ticket counts as one of the builders while it holds the lock. So `countSlots` adds one builder slot when `lock.json` exists, unless a builder run for the same ticket is already counted (no double count). With a limit of 2, the factory ticket takes one slot and one hand-started builder can run beside it; a second hand-started builder waits. With no lock, two hand-started builders fill the limit and the scan does not claim.
Reason it is not by activity alone: the factory conductor wakes an idle builder with an order (merge, fix wave) and no `dg run start` happens, so no gate would run. The lock is the one signal that covers the whole ticket life. An unreadable lock (`ticket: "?"`) counts too: the scan already treats it as busy.

### D6. Where the limit is enforced

| Starter | How |
| --- | --- |
| Autonomous scan | In `runScan`, after the lock check and before the claim. If the active hand-started builders already fill the builder limit (the claim would be one more), the scan returns `busy` with `reason: builder-limit` and writes a `busy` event with the open run id. No claim, no comment, no attention item (a normal wait). |
| `dg run start` | Refuses with exit 1 and one plain line: `limit: builder 2 of 2 in use: builder-2026... (DGS-557, last event 3 min ago), factory lock (DGS-650). Wait for one to finish.` Written before `createRun`, so no record is made. |
| Conductor | The runbook step S3b already calls `dg run start`, so the conductor is covered through it. The runbook adds one line: a refused start means queue the worker and retry at the next checkpoint, never override. |

`dg run start` for a `maestro`, `conductor` or `other` role is never refused.
There is no `--force`. Reason: the escape for a stuck slot is D4 (`lost`), and a force flag is how the load-140 case came back the first time. Jack changes the number in the config if he wants more.

What the limit does not do (written in the runbook): it never pauses or kills a running agent, and it does not gate the wake-up of an idle builder that is not the factory's. For that case the conductor checks `dg run limit` before it sends a fix wave to an idle builder. This is a conductor step, stated in the runbook, because no code runs at that moment.

Race: two `dg run start` calls in the same second can both pass. Accepted. The conductor is one process and starts workers one at a time; the stale cost of an extra worker is low against a lock file. No lock is added (YAGNI).

### D7. Configuration

In `.digismith/config.yml`, inside `nightwatch:`, next to `scan_every_minutes`:

```
  limits:
    builder: 2
    reviewer: 1
    role: 1
  stale_after_minutes: 120
```

Whole numbers 0 to 9 for a kind; `0` blocks that kind (an off switch, useful at night). A missing block gives builder 2, reviewer 1, role 1 and stale 120. A bad value falls back to the default and is reported as a `limitProblems` item, the same way `scan_every_minutes` falls back (`scanProblems`): a setting, not a guardrail, so a bad limit never stops the scan or the merge gate. Reason: a typo in a limit must not stop the factory; it falls back to that kind's default (2, 1, 1).
`readGuardrails` today reports an unknown key under `nightwatch:` as a guardrail problem. `limits` and `stale_after_minutes` are added to its known keys; this is the change in the protected file `autonomous/guardrails.ts`.
Source for `dg run start`: the current checkout's config file (the working file, like `readScanIntervalFile`). Source for the scan: the same function, main checkout. Both read through one new `readLimitsFile(cwd)`.
The scheduler's own reader (`scripts/nexus-api/src/scheduler/`) validates the same block for `scan_every_minutes`. The plan must check that it ignores a key it does not know; if it rejects one, the plan adds the two keys there too (also a protected path).

### D8. Display

- `dg run limit [--json]` (new, read-only): one line per kind, `builder 1/2  builder-2026... DGS-557 busy 3 min`, then `stale:` lines with run ids to clear. Exit 0 always.
- `dg autonomous status`: adds three lines after `scan interval`: `limits: builder 1/2, reviewer 0/1, role 1/1` and, when any run is stale, `stale runs: <ids> (clear with dg run event <id> lost)`.
- Catch-up Health: one new line `- Limits: builder 1/2, reviewer 0/1, role 1/1`. The conductor's state block keeps its closed Health grammar: the new line is computed from `dg run limit --json` like `Server` and `Open tabs` (the parser already skips lines it computes). `state-block.ts` gets `Limits` in its computed-line regex; `catch-up.ts` and its template get the line; the catch-up data shape gets an optional `limits` string.

### D9. Where the rule is written

The runbook `.digismith/sessions/workbox.md`: "The rule" section (add the three limits at the top), "Start of a ticket" S3b (refused start), and the dm-03 text is retired by a one-line pointer. The conductor skill text and the Maestro text get the same four lines. Catch-up Health text in `skills/catch-up/SKILL.md` names the new line.
`.digismith/sessions/` is git-excluded (memory: sessions runbook stays untracked), so the runbook edit is done by the conductor by hand, not in the PR. The plan lists it as a hand step.

## Out of scope

- Pausing or killing a run over the limit (dm-03 forbids it).
- A queue. The conductor queues; the system only refuses.
- CPU, load or memory sensing. A load-based gate is a later ticket if counts prove too blunt.
- A per-seat limit.

## Testing

Vitest with fake run records (a temp depot through `DIGISMITH_DEPOT_DIR`), `--maxWorkers=2`, changed files only:
- `limit.test.ts`: each kind; ended, `lost`, `/clear` (ended then started); `turn_end` and `blocked` last event free; stale by `now`; `other` by `role_from`; maestro and conductor never counted; lock adds a builder and does not double count; config parse (missing, bad, duplicate, 0).
- `run/index.test.ts`: `dg run start` refuses with the open run named and writes no record; a reviewer start passes when only a builder is open.
- `autonomous/scan.test.ts`: busy with `builder-limit` at 2 active hand builders, no claim, no tracker call; claims at 1 active hand builder or when builders are idle.
- `guardrails.test.ts`: the new keys parse and an unknown key still fails.
- `catch-up.test.ts`, `state-block.test.ts`: the Limits line.

## Protected paths

The build touches `packages/cli/src/autonomous/` (scan, status, guardrails) and `.digismith/config.yml`, both protected (`nightwatch.protected_paths`). The merge needs the Maestro's approval. It may also touch `scripts/nexus-api/src/scheduler/` (D7), also protected.

## Sign-off

Auto. The contract is fully defined: an internal tool, no taste, no wording, no public text. The config numbers (2, 1, 1) are Jack's own sentence.
