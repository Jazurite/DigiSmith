# DGS-546 Hallmark: spec

Order hm-01. Inputs: `findings.md` (approved, checkpoint 0) and the Maestro decisions of 2026-11-01. Written 2026-11-01 UTC+7.

## Goal
Every plan task of an SDD build puts its numbers on the ClickUp ticket as one comment, when the task ends. At finish, one command writes the ticket's totals and a per-task table into the ticket description. No subtask per task, no custom field, no running total.

## Decisions (given)
1. Review data comes from the ledger first, `findings.md` second, "not recorded" last.
2. `final` (the whole-branch review) is stamped too, titled "final review".
3. Idempotence: page the comments when the API allows, and also write the ledger line `Task <N>: stamped (comment <id>)`.
4. Price per response inside `task-stamp`. The snapshot `cost_usd` change is a separate later ticket, not in this build.
5. Comments are plain text.

## Commands

### `dg clickup task-stamp --task <Key> --plan-task <N|final> [--ledger <file>] [--findings <file>] [--yes]`
- `<Key>`: a ClickUp key (`DGS-<n>`). Any other key: exit 0 with "not a ClickUp key, skipped".
- Dry run by default: prints the comment text and the call. `--yes` posts it (same rule as `add-comment`).
- Reads three things:
  1. The registry (`~/.digismith-depot/token-registry/<Key>.jsonl`, via `createDepotRegistry`): the window of the task (`task_start` to `task_end` of the same session).
  2. The transcripts: every response in the ticket's sessions (the `countTicket` path), deduplicated by `response_id`. A response belongs to the task by the same rule as `buildSnapshot` (`ledgerTask` first, then `taskForRecord`). Each response is priced alone with `resolveAnthropicPrice` and `costFromPricing`, then summed per model. The snapshot's sums are never priced.
  3. The review data (below).
- Output text (plain; first line is the marker):
  ```
  Hallmark task <N> of <Key>            (task final: "Hallmark final review of <Key>")
  Window: <date> <hh:mm:ss> to <hh:mm:ss> UTC+7 (agent time <m> min <s> s)
  <model>: in <i>, out <o>, cache read <r>, cache write <w> (<n> responses) = $<cost>
  Task total: in .., out .., cache read .., cache write .. = $<cost> (list price)
  Reviews: <R> round(s) | Findings: <F> (<x> fixed, <y> parked) | Fix rounds: <Z>
  Source: registry window + transcripts, per-response list prices (version <ANTHROPIC_PRICES_VERSION>)
  ```
  A time past midnight shows the end date too. A model with no price shows `cost not priced` and the total line says `partly priced`. No window (no `task_end`): the command stops with "task not ended" and posts nothing.
- Review data, first source that has the task:
  1. **Ledger**: rounds = count of `Task <N>: reviewed (...)` lines. Findings, fixed, parked and rejected come from the verdict lines (`Review task <N> r<R>: F<n> -> fixed|parked|rejected|fixing`, and `Review ticket final r<R>: ...` for the final stamp), read with `parseVerdictEntries` from `packages/cli/src/reviewer/verdicts.ts` (import only; that folder stays untouched). The latest ruling per finding counts; a finding with no final ruling counts as open. A malformed verdict line makes this source fall back to the hand-mode lines. Hand-mode fallback: findings = highest `K` of `reviewed (<K> findings)`, parked = count of `Task <N>: parked` lines, fixed = findings minus parked. Fix rounds = count of `Task <N>: fix round` lines; for `final` = count of `Scoped re-review` lines.
  2. **findings.md** (the board file `| Reviewer type | Round | ... | Verdict |`): rows whose type is `task <N>` or `ticket`/`final` for the final stamp; rounds = highest Round value; findings = rows that are not "approved, no findings"; fixed/parked from the Verdict cell (`fixed`, `parked`); fix rounds = not recorded in this file, shown as `Fix rounds: not recorded`.
  3. Else `Reviews: not recorded | Findings: not recorded | Fix rounds: not recorded`.
- Idempotence, three checks in order (stop at the first hit; the command then exits 0 and prints `already stamped (<where>)`):
  1. The ledger line `Task <N>: stamped (comment <id>)`.
  2. The stamps file (below) has the task.
  3. The ticket's comments contain the marker line. The client's `getTaskComments` reads one page of 25. The build adds paging: ClickUp's `GET /task/{id}/comment` takes `start` and `start_id`; the plan checks this against the stub and against one read-only call on a real ticket with more than 25 comments (page 2 must hold no id of page 1 and older dates); the loop also stops when a page repeats an id already seen. If paging is not possible, the check covers 25 comments and the stamps file and ledger line are the guard beyond that. The spec treats the paging as best effort and the other two checks as the guarantee.
- After a post: append the ledger line `Task <N>: stamped (comment <id>)` (when `--ledger` is given) and one line to the stamps file.
- Partial data: when a session of the ticket has no transcript, the text gets the line `Partial: <n> session(s) without transcript` and the stamps line stores `partial: true`; `--yes` is refused only when no session could be read. Agent time is the sum of the task's closed windows (a task reopened later counts every window), and the Source line says so.
- The marker is matched by the whole first line (`Hallmark task 1 of DGS-546` never matches task 10).
- A failure never throws out of the command into the build: it prints one `warn:` line on stderr and exits 1. The SDD skill treats exit 1 as a warning (see Hook points).

### Stamps file
`~/.digismith-depot/token-registry/<Key>.stamps.jsonl` (counts and ids only, no message text). One JSON line per posted stamp: `{ task, comment_id, window_start, window_end, agent_seconds, models: { <model>: { input, output, cache_read, cache_write_5m, cache_write_1h, responses, cost_usd|null } }, reviews: { rounds, findings, fixed, parked, fix_rounds, source } , stamped_at }`.
Why it exists: the SDD ledger is deleted when the final review is clean, before the finishing skill runs. `ticket-total` and a later backfill still need each task's review data and the comment id. Choice: a depot file next to the registry, with the same retention as the registry. Rejected: committing it to the board folder (extra file in every ticket's diff).

### `dg clickup ticket-total --task <Key> [--yes]`
- Run once, at finish. Dry run by default.
- Totals: all tasks of the ticket, from the registry and transcripts, priced per response (same code as `task-stamp`). The totals cover the **whole ticket**: the implementation step, every task window and the responses outside any task window of the ticket's sessions. Per-task rows come from the stamps file; a task with a `task_end` and no stamp is computed on the fly with `Reviews: not recorded` and marked `(not stamped)`.
- Totals count only responses of the ticket's own sessions (what the snapshot keeps; `unattributed` responses are excluded). It does not run in the "discard the work" option of the finishing skill.
- Writes a block into the ticket description. The block sits between two plain sentinel lines and is replaced on a re-run:
  ```
  --- Hallmark (dg clickup ticket-total) ---
  Total: in .., out .., cache read .., cache write .. = $<cost> list price
  Agent time: <h> h <m> min over <n> tasks (sum of task windows)
  Reviews: <R> rounds, <F> findings, <Z> fix rounds
  | Task | Agent time | Cost | Findings | Fix rounds |
  | 1 | 1 min 44 s | $0.4635 | 0 | 0 |
  ...
  Updated <date> <time> UTC+7
  --- end Hallmark ---
  ```
- Reads the current description with `include_markdown_description: true`, replaces the block between the sentinels or appends it after a blank line, and writes with `updateTask` (`markdown_description`). Everything outside the block stays byte-for-byte in what we send. If `markdown_description` is missing or empty while the plain `description` is not, the command refuses to write (`warn:`, exit 1). After the write it reads the description back; if the read-back does not hold both sentinels exactly once it prints `warn:` and exits 1, and it never writes twice in one run. A probe on DGS-546 (plan Task 7) fixes the block form (blank lines, a table separator row, sentinels that survive ClickUp's round trip) before the hooks go live.
- Re-runnable: running it twice gives the same block except the `Updated` line. It never posts a comment.
- A failure warns and exits 1; the finishing skill prints a warning and goes on (never blocks a merge).
- Write guard: it refuses to write when the new block is empty of tasks and totals are zero (a broken registry must not blank a good block).

### Backfill
The same two commands, run after the fact. `task-stamp` needs only the registry window and the transcripts (and a ledger or `findings.md` for review numbers; without them, "not recorded"). So a ticket built before the stamp existed (DGS-683, DGS-679) gets its comments by running `task-stamp --plan-task <N> --yes` for each task and then `ticket-total --yes`. A thin helper `dg clickup task-stamp --all` (every task with a `task_end` in the registry, plus `final`) is included so the backfill is one command; it skips tasks already stamped.

## Hook points
- `skills/subagent-driven-development/SKILL.md`, step 5 "Complete the task", right after the `task-end` block and next to the checklist sync (around lines 490-511): add the block
  ```bash
  dg clickup task-stamp --task <Key> --plan-task <N> --ledger <workspace>/progress.md --yes
  ```
  Same key rule as the checklist sync (ClickUp key only; any other key skip). Non-zero exit: print a warning, append `Task stamp: failed (<first stderr line>)` to the ledger, go on. The same call runs for `final` after the `task-end --task final` / `step-end implementation` block (it needs `task_end final`) and before the Finish section deletes the workspace (the ledger must still exist).
- `skills/finishing-a-development-branch/SKILL.md`: after the `step-end ... finishing` line in the merge, push-and-PR and keep-as-is options (lines ~289, 349, 362; not the discard option), run `dg clickup ticket-total --task <Key> --yes` once. Same failure rule.
- Order inside a task: `task-tokens` line, `complete` line, `task-end`, **then** `task-stamp`. The stamp needs `task_end`.

## Protected paths this change touches
- `skills/finishing-a-development-branch/` (PROTECTED: `skills/finishing-*`). The merge needs the Maestro's approval. This is the only protected path.
- Not touched: `hooks/`, `skills/reviewer`, `packages/cli/src/reviewer/`, `packages/cli/src/autonomous/`, `scripts/nexus-api/src/scheduler/`, `.digismith/config.yml`.
- Other files: `packages/cli/src/clickup/task-stamp.ts`, `ticket-total.ts`, shared helpers `packages/cli/src/tokens/stamp.ts` (window, per-response pricing, review data, text), `packages/cli/src/clickup/index.ts` (register), their tests, `skills/subagent-driven-development/SKILL.md`, `packages/cli/src/tokens/README.md` or the `dg` docs for the two commands.

## Tests and safety
- Mocks only: a fake `ClickUpClient`, a temp `DIGISMITH_DEPOT_DIR` registry, small transcript fixtures (`fixtures.test-util.ts`). No `--yes` against a real ticket in any test.
- Cases: price per response (Haiku long-prompt tier: sum would be wrong, per response is right); each review-data source and the fallback; the three idempotence checks; a second run posts nothing; failure paths exit 1 with a `warn:` line; description block insert, replace, and a bad registry guard; times in UTC+7 across midnight.
- First real use: DGS-546's own build (read one comment back with `get-task`/comments), then DGS-683.

## Questions for Jack
None blocking. Defaults used:
1. A model with no list price shows `cost not priced` (not $0). Default kept.
2. "Agent time" is wall clock from `task_start` to `task_end` (it includes waiting for a reviewer). The text says so in the Source line only through the label "agent time"; default kept as the order says.
3. The stamps file lives in the depot, not the repo.

## Out of scope
Snapshot `cost_usd` per task (later ticket); roll-up to epic and initiative (DGS-545 rewrite); Jack's time (DGS-533); any custom field; any ClickUp status change.
