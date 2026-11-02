# Hallmark: task stamps and ticket total Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each SDD task posts one plain-text comment with its tokens, list-price cost, agent time and review numbers on its ClickUp ticket, and the finishing skill writes the ticket total into the description once.

**Architecture:** A shared module `packages/cli/src/tokens/stamp.ts` collects the ticket's responses (extracted from `countTicket`), assigns each to a task with the existing `buildSnapshot` rules, prices each response alone, and renders text. Two `dg clickup` commands (`task-stamp`, `ticket-total`) use it. A depot file `<Key>.stamps.jsonl` keeps what was posted, because the SDD ledger is deleted before finishing. Two skills call the commands; a failure only warns.

**Tech Stack:** TypeScript (Node, `--experimental-strip-types`), yargs, vitest. Package manager: pnpm only.

**Spec:** `/Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-546/.digismith/board/DGS-546—hallmark/spec.md`

## Global Constraints

- Mocks only. No test calls ClickUp, uses `--yes` on a real ticket, or reads the real depot or `~/.claude`. Every test sets `DIGISMITH_TOKEN_REGISTRY_DIR` and a temp projects dir (see `packages/cli/src/tokens/fixtures.test-util.ts`).
- Price each response alone (`resolveAnthropicPrice`, `costFromPricing` from `prices/cost.ts`). Never price a sum.
- Plain text comments. Times UTC+7. Counts and ids only in the stamps file, never message text.
- A failure of either command never blocks a build: one `warn:` line on stderr, exit 1.
- `countTicket` keeps its output byte-for-byte (the Task 1 refactor is behavior-neutral; its existing tests stay green).
- **Protected path touched: `skills/finishing-a-development-branch/` (Task 8).** The merge needs the Maestro's approval. No other protected path is touched.
- Commits: title-only conventional commits, scope `dgs-546`, no AI attribution lines. Never commit to `main`. pnpm only. Run tests with `pnpm vitest run <changed files> --maxWorkers=2` from `packages/cli` (and `packages/clickup-client` for Task 5); one heavy command at a time; `uptime` under 4 before a whole-package run.

**Setup (before Task 1):** in `/Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-546` run `pnpm install --frozen-lockfile`, then `pnpm --filter @digismith/clickup-client build` (the worktree has no client dist). Never run install in the depot clone.

---

### Task 1: Collect the ticket's responses and price each one

**Files:**
- Modify: `packages/cli/src/tokens/count.ts` (extract `collectRecords`)
- Create: `packages/cli/src/tokens/stamp.ts`
- Test: `packages/cli/src/tokens/stamp.test.ts`

- [ ] **Step 1: Failing tests** in `stamp.test.ts` (temp registry + transcript fixtures):
  - `taskUsage(records, entries, taskAgents, "1")` returns per-model counts and `cost_usd` for only the responses inside task 1's window (a task 2 response is excluded).
  - Long-prompt case: one Haiku 5.5 response with prompt 50 K and a second with prompt 150 K in one task: cost = base-rate cost of the first + long-tier cost of the second, and differs from the cost of the summed counts (assert both numbers).
  - A model with no price gives `cost_usd: null`, and the task total `priced: false`.
  - A ledger `dispatch ... agent=<id>` moves that subagent's responses into the task when the window does not cover them.
  - `countTicket` output on the same fixture is unchanged (snapshot equality against the pre-refactor result captured in the test).
- [ ] **Step 2:** Run `pnpm vitest run src/tokens/stamp.test.ts src/tokens/count.test.ts --maxWorkers=2`; expect failures.
- [ ] **Step 3:** In `count.ts` move the loop that builds `records` into `export function collectRecords(opts): { records: UsageRecord[]; entries: RegistryEntry[]; inferred: string[] }`; `countTicket` calls it, then `buildSnapshot` as today.
- [ ] **Step 4:** In `stamp.ts` write `taskUsage(...)` using `taskForRecord` and the ledger rule of `buildSnapshot` (export `ledgerTask` from `snapshot.ts`, no logic change), pricing per record, returning `{ models: Record<string, {counts, cost_usd|null}>, total: {counts, cost_usd|null, priced}, window: {start, end}|null }`. The window is the `task_start` and `task_end` of the task in the registry (latest pair).
- [ ] **Step 5:** Run the same command; expect pass.
- [ ] **Step 6:** Commit: `feat(dgs-546): price a task's responses one by one`

### Task 2: Read the review numbers

**Files:**
- Create: `packages/cli/src/tokens/review-data.ts`
- Test: `packages/cli/src/tokens/review-data.test.ts`

- [ ] **Step 1: Failing tests:**
  - Ledger text with `Task 2: reviewed (2 findings)`, `Task 2: fix round 1/5 (...)`, `Task 2: reviewed (clean)`, `Task 2: parked — x — ruling: y`, `Task 2: complete (...)` gives rounds 2, findings 2, parked 1, fixed 1, fix rounds 1, source `ledger`.
  - A task with no ledger line but rows in a `findings.md` table (`task 3`, rounds 1 and 2, one `fixed (commit ..)`, one `parked (...)`, one `approved, no findings`) gives rounds 2, findings 2, fixed 1, parked 1, `fixRounds: null`, source `findings.md`.
  - `final` reads ledger lines `Task final: ...` and findings rows typed `ticket`.
  - Neither source has the task: all null, source `none`.
  - Ledger wins when both have the task.
- [ ] **Step 2:** Run `pnpm vitest run src/tokens/review-data.test.ts --maxWorkers=2`; expect failures.
- [ ] **Step 3:** Implement `reviewData(task, { ledgerText?, findingsText? })` with line regexes matching the formats in `skills/subagent-driven-development/SKILL.md` (lines 396, 450, 460, 487) and a table row parser for the `findings.md` layout of `.digismith/board/DGS-613—phase-time/findings.md`.
- [ ] **Step 4:** Run the same command; expect pass.
- [ ] **Step 5:** Commit: `feat(dgs-546): read review rounds and findings for a task`

### Task 3: Render the comment text and the time

**Files:**
- Modify: `packages/cli/src/tokens/stamp.ts`
- Test: `packages/cli/src/tokens/stamp.render.test.ts`

- [ ] **Step 1: Failing tests** with fixed input:
  - The DGS-679 task 1 numbers of `findings.md` (window `2026-10-27T09:50:59.499Z` to `09:52:43.207Z`, Sonnet and Haiku counts) render exactly the comment of `findings.md` ("Window: 2026-10-27 16:50:59 to 16:52:43 UTC+7 (agent time 1 min 44 s)", `Task total ... = $0.4635 (list price)`; Haiku line `= $0.0157` only when priced per response).
  - `final` heading reads `Hallmark final review of DGS-679`.
  - A window that crosses midnight UTC+7 shows the end date.
  - Unpriced model: line ends `cost not priced`; total line says `partly priced`.
  - Review fields null: `Reviews: not recorded | Findings: not recorded | Fix rounds: not recorded`.
- [ ] **Step 2:** Run `pnpm vitest run src/tokens/stamp.render.test.ts --maxWorkers=2`; expect failures.
- [ ] **Step 3:** Implement `renderStamp(...)`, `formatDuration(seconds)` ("1 min 44 s", "2 h 5 min", "12 s") and `utc7(iso)` (add 7 h, no library). The Source line carries `ANTHROPIC_PRICES_VERSION`.
- [ ] **Step 4:** Run the same command; expect pass.
- [ ] **Step 5:** Commit: `feat(dgs-546): render the task stamp text`

### Task 4: The stamps file

**Files:**
- Create: `packages/cli/src/tokens/stamps-store.ts`
- Test: `packages/cli/src/tokens/stamps-store.test.ts`

- [ ] **Step 1: Failing tests** (temp `DIGISMITH_TOKEN_REGISTRY_DIR`): `appendStamp` then `readStamps` round-trips; a torn last line is ignored; a second stamp for the same task keeps both lines but `stampOf(task)` returns the latest; a ticket key with a path character is refused (same `TICKET_PATTERN` rule as the registry); the file name is `<Key>.stamps.jsonl`; a stamp line has no message text field.
- [ ] **Step 2:** Run `pnpm vitest run src/tokens/stamps-store.test.ts --maxWorkers=2`; expect failures.
- [ ] **Step 3:** Implement with `appendFileSync` and the torn-tail rule used in `registry.ts`.
- [ ] **Step 4:** Run the same command; expect pass.
- [ ] **Step 5:** Commit: `feat(dgs-546): keep stamps in a depot file`

### Task 5: Page the ticket's comments

**Files:**
- Modify: `packages/clickup-client/src/client.ts`, `packages/clickup-client/src/types.ts` (only if a type is needed)
- Test: `packages/clickup-client/src/client.test.ts` (or the existing client test file for comments; find it with `grep -l getTaskComments packages/clickup-client/src/*.test.ts`)

- [ ] **Step 1: Failing test** with the stub server: `getAllTaskComments(taskId, { maxPages })` calls `GET /task/{id}/comment`, then again with `start` and `start_id` of the last row while a page has 25 rows, stops at a short page or at `maxPages` (default 8), and returns all rows. `getTaskComments` is unchanged.
- [ ] **Step 2:** Run `pnpm vitest run <that test file> --maxWorkers=2` in `packages/clickup-client`; expect failure.
- [ ] **Step 3:** Implement `getAllTaskComments` using the `date` of the last row as `start` and its `id` as `start_id` (ClickUp's documented pair). The comment row type already has `[key: string]: unknown`; read `date` from it.
- [ ] **Step 4:** Run the same command; expect pass. Then `pnpm --filter @digismith/clickup-client build`.
- [ ] **Step 5:** Commit: `feat(dgs-546): page a task's comments`

### Task 6: `dg clickup task-stamp`

**Files:**
- Create: `packages/cli/src/clickup/task-stamp.ts`
- Modify: `packages/cli/src/clickup/index.ts` (register)
- Test: `packages/cli/src/clickup/task-stamp.test.ts`

- [ ] **Step 1: Failing tests** (fake `ClickUpClient` like `add-comment.test.ts`; temp registry and transcripts; `handlerOf`):
  - Dry run (no `--yes`): prints the comment and the call, posts nothing, writes no ledger line and no stamps line.
  - `--yes`: posts once, appends `Task 1: stamped (comment <id>)` to the ledger file, appends a stamps line, reads the comment back.
  - Second run: `already stamped (ledger)`, no post. With the ledger line removed: `already stamped (stamps file)`. With both removed and the marker line in the fake comments (second page): `already stamped (ticket comments)`.
  - Task without `task_end`: `task not ended`, no post, exit 0.
  - Non-ClickUp key: `not a ClickUp key, skipped`, exit 0.
  - Client throws on post: stderr has one `warn:` line, exit code 1, no ledger line.
  - Read-back mismatch: error text says do not send again (same wording rule as `add-comment`); a stamps line is still written so the next run does not double-post.
  - `--plan-task final` posts the "final review" heading.
  - `--all`: stamps every task with a `task_end` plus `final` if present; skips stamped ones; prints one line per task.
  - Review data: ledger given, `--findings` given, neither: three outputs.
- [ ] **Step 2:** Run `pnpm vitest run src/clickup/task-stamp.test.ts --maxWorkers=2`; expect failures.
- [ ] **Step 3:** Implement with `parseTaskStampArgv` (pure, no network), the three idempotence checks in the spec order, `collectRecords` + `taskUsage` + `reviewData` + `renderStamp`, and `createTaskStampCommand(clientFactory)`; export `taskStampCommand` and register it in `index.ts`. Dry run on a key resolves the ticket with one read-only call, as `add-comment` does.
- [ ] **Step 4:** Run the same command; expect pass.
- [ ] **Step 5:** Commit: `feat(dgs-546): add dg clickup task-stamp`

### Task 7: `dg clickup ticket-total`

**Files:**
- Create: `packages/cli/src/clickup/ticket-total.ts`, `packages/cli/src/tokens/hallmark-block.ts`
- Modify: `packages/cli/src/clickup/index.ts` (register)
- Test: `packages/cli/src/tokens/hallmark-block.test.ts`, `packages/cli/src/clickup/ticket-total.test.ts`

- [ ] **Step 1: Failing tests:**
  - `hallmark-block`: `renderBlock(rows, totals)` gives the sentinel block of the spec; `applyBlock(description, block)` appends after a blank line when absent, replaces in place when present (text before and after is byte-for-byte), and a second apply with the same input changes only the `Updated` line.
  - `ticket-total`: totals sum every response of the ticket (including responses outside any task window), per-task rows come from the stamps file, a task with `task_end` and no stamp shows `(not stamped)` and `not recorded`; dry run prints the new description and writes nothing; `--yes` calls `updateTask` once with `markdown_description` and reads the description back to confirm the block; no tasks and zero totals: refuses to write (guard); client failure: `warn:` and exit 1.
- [ ] **Step 2:** Run `pnpm vitest run src/tokens/hallmark-block.test.ts src/clickup/ticket-total.test.ts --maxWorkers=2`; expect failures.
- [ ] **Step 3:** Implement both files. Read the description with `getTaskByRef` (use the Markdown field the client returns; check `get-task.ts --markdown` for the field name) and write with `updateTask`.
- [ ] **Step 4:** Run the same command; expect pass.
- [ ] **Step 5:** Commit: `feat(dgs-546): add dg clickup ticket-total`

### Task 8: Call the commands from the two skills and document them

**Files:**
- Modify: `skills/subagent-driven-development/SKILL.md` (after the `task-end` block, step 5, around lines 490-511; and after `Task final: complete`, around line 657)
- Modify: `skills/finishing-a-development-branch/SKILL.md` (**PROTECTED**; after each `step-end ... --step finishing` / `snapshot --write` pair, lines ~289, 349, 362, 400)
- Modify: `packages/cli/src/tokens/README.md` (document both commands, the stamps file and the backfill)

- [ ] **Step 1:** In the SDD skill add, after the `task-end` block, the `dg clickup task-stamp --task <Key> --plan-task <N> --ledger <workspace>/progress.md --yes` block with the key rule of the checklist sync and the failure rule: print a warning, append `Task stamp: failed (<first stderr line>)` to the ledger, go on. Add the same call for `final` after `Task final: complete`.
- [ ] **Step 2:** In the finishing skill add `dg clickup ticket-total --task <Key> --yes` after the `snapshot --write` line of each option that writes the snapshot, once per flow, with the same failure rule (warn, never block).
- [ ] **Step 3:** Document in the README.
- [ ] **Step 4: Check:** `grep -n "task-stamp" skills/subagent-driven-development/SKILL.md` shows the two blocks; `grep -n "ticket-total" skills/finishing-a-development-branch/SKILL.md` shows one per option; run the existing skill tests if any (`grep -rl "subagent-driven-development/SKILL" packages scripts --include=*.test.ts`) with `pnpm vitest run <those> --maxWorkers=2`; run `checklist/plan.test.ts` and `sync.test.ts` to confirm the plan format is unaffected.
- [ ] **Step 5:** Commit: `docs(dgs-546): call task-stamp and ticket-total from the skills`

### Task 9: Smoke on real data (dry run only)

**Files:** none changed.

- [ ] **Step 1:** From `packages/cli`: `node --experimental-strip-types src/main.ts clickup task-stamp --task DGS-679 --plan-task 1` (find the real entry with `grep '"dg"\|bin' package.json`). No `--yes`. Expected: the comment of `findings.md` with `$0.4635`, Haiku `$0.0157`, "Reviews: not recorded". One read-only ClickUp call.
- [ ] **Step 2:** Same for `--plan-task final` and `ticket-total --task DGS-679` (dry run): totals line plus a three-row table.
- [ ] **Step 3:** Run the full CLI suite once (`uptime` under 4 first): `pnpm --filter @digismith/cli vitest run --maxWorkers=2`; expect all pass.
- [ ] **Step 4:** No commit unless a fix was needed (then `fix(dgs-546): <what>`).

## How each part is checked
- Pricing and window: Task 1 tests (long-prompt case pins the Haiku bug of `findings.md`).
- Text: Task 3 renders the exact DGS-679 proof comment.
- Idempotence: Task 6 tests the three checks and the paging (Task 5).
- Never blocks a build: Tasks 6 and 7 failure tests; Task 8 skill wording.
- Real data: Task 9 dry run on DGS-679.

## First use
1. DGS-546's own build runs under key DGS-546: after the plan is approved, each task's `task-stamp` call posts with `--yes` on DGS-546 (the first live test; the conductor reads one comment back with `dg clickup get-task` and the comments).
2. After the merge the conductor runs `dg clickup task-stamp --task DGS-546 --all --yes` for any task that missed it, then `ticket-total --task DGS-546 --yes`.
3. Then DGS-683: live if not built yet, else `task-stamp --task DGS-683 --all --yes` and `ticket-total`. Read back one task comment and the total.

Note: the stamp calls are in the SDD skill at plan time, but DGS-546's own build runs with the skill version of `main`, which has no call yet. So for DGS-546 the controller runs the `task-stamp` command by hand after each `task-end` once Task 6 is merged into the branch (the worktree's `dg` build), and records it in the ledger the same way.
