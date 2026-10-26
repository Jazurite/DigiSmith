# DGS-624 plan: accept `Review task N rR: no findings`

Spec: `spec.md` in this folder. Work in the worktree `.worktrees/dgs-624`. Test first in every task.

Setup (fresh worktree): `pnpm install --frozen-lockfile` (inside the worktree only, never in the depot clone). The reviewer code does not use the client package, so `pnpm --filter @digismith/clickup-client build` is needed only if a test import fails for a missing build.
Run tests: `pnpm vitest run packages/cli/src/reviewer`.

### Task 1: Parser accepts the line, still rejects bad ones
Files: `packages/cli/src/reviewer/verdicts.ts`, `packages/cli/src/reviewer/verdicts.test.ts`.
1. Test first, in `verdicts.test.ts`, new `describe("no-findings lines")`:
   - `parseVerdictEntries skips "Review task 3 r1: no findings" and a ticket final line`: input has `Review task 3 r1: no findings`, `- Review ticket final r2: no findings` (dash prefix) and `Review task 4 r1: F1 -> fixed`; result has exactly one entry (task 4).
   - `parseVerdictLines ignores a no-findings line` (map size 0).
   - `parseVerdictEntries still throws on a malformed no-findings line`: `it.each` over `Review task 3 r1: no findings (ok)`, `Review task 3 r1: No findings`, `Review task 3 r1: no finding`, `Review task 3: no findings`, `Review task 3 r1: no findings.` each throws `/ledger line 1: not a verdict line/`.
2. Run the tests: the first two fail.
3. `verdicts.ts`: add `const NO_FINDINGS_RE = /^Review (task|ticket) (\d+|final) r(\d+): no findings$/;` under `LINE_RE`. In `parseVerdictEntries`, after the `startsWith` filter and before `LINE_RE.exec`, add `if (NO_FINDINGS_RE.test(text)) return;`.
4. Run the tests: pass. Run `pnpm vitest run packages/cli/src/reviewer packages/cli/src/oculus packages/cli/src/autonomous`.
5. Commit: `fix(reviewer): accept a no-findings ledger line`

### Task 2: The table runs on such a ledger
Files: `packages/cli/src/reviewer/table.test.ts`.
1. Test first. Follow the existing `runTable` tests in this file (temp workspace, fake review folders, no ClickUp, no network). Add:
   - `buildRows gives the approved row for a no-findings review whose ledger line is "no findings"`: reviews `[review("task","1",1,[])]`, entries from `parseVerdictEntries("Review task 1 r1: no findings\n")`; rows equal one row `task 1`, `what: "approved, no findings"`.
   - `buildJson lists it under approvedReviews`.
   - `runTable writes the table from a ledger holding a no-findings line next to a finding line`: workspace with `reviews/task-1-r1` (empty findings block) and `reviews/task-2-r1` (one finding), ledger `Review task 1 r1: no findings\nReview task 2 r1: F1 -> fixed (commit abc1234)\n`; output has both rows, no throw.
   - `runTable still fails on a malformed Review line`: ledger `Review task 1 r1: nothing found\n` throws `/not a verdict line/`.
2. Run the tests: they pass with Task 1 already in (this task pins the table end to end; confirm one fails when the Task 1 change is temporarily reverted, then restore it).
3. Run `pnpm vitest run packages/cli/src/reviewer`.
4. Commit: `test(reviewer): pin the table on a no-findings ledger`

### Task 3: Final check
1. `pnpm vitest run` for the whole repo: green (report any failure that is also on `main` as pre-existing).
2. `git status` clean; two commits on the branch.
3. No commit for this task.
