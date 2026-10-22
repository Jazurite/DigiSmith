# DGS-591 implementation report

Built: `dg reviewer table` accepts the interim verdict line `Review <task|ticket> <id> r<R>: F<n> -> fixing (<what>)`, reason optional. A `fixing` line is history: findings.md shows the latest final ruling (fixed, parked, rejected); `--json` (schema 1) keeps the `fixing` entries in `history` with `verdict: "fixing"`, and `latestRound`/`latestRuling` keep their meaning. A finding whose latest line is `fixing` fails the table with `ledger line <n>: <text>: fix not finished for <id>`; all unfinished findings are named in one error. The autonomous verdict observer counts a finding as ruled only when its last ledger entry for the pack round is final. The SDD skill (role mode) and the Reviewer card show `Review task 2 r1: F1 -> fixing (check every commit)`.

Commits (a4718a3..9d7956c): ff2b6c0 ticket and design, 9cd81e7 plan, 3f7e1ce parser, 2516dfa table, baf34bd observer, 9d7956c docs.

Review: task packs skipped (small ticket, conductor order). Ticket final r1 (claude-opus-5-5): ready to merge, 0 Critical, 0 Important, 3 Minor, all parked by the conductor's ruling.

Tests: `pnpm --dir packages/cli exec vitest run`: 129 files, 1778 tests pass, including the strip-types smoke test. Manual check on a temp copy of DGS-585's workspace (27 `fixing` lines): the table builds 34 rows, no `fixing` in findings.md, 27 `fixing` history entries in `--json`, the copied ledger is byte-identical afterwards. No ledger line was deleted or rewritten. No ClickUp write.

## Follow-up for the Maestro

- F1 (Minor, parked): the observer (`packages/cli/src/autonomous/observers-real.ts:248`) reads only ledger entries of the pack's own round. `Review ticket final r3: F7 -> fixing (x)` then `Review ticket final r4: F7 -> fixed (abc)`: the table shows F7 fixed `[r4]`, the observer keeps pack r3 at `findings`. The per-round gap predates this ticket. Proposed fix: reuse the table's target rule (a later-round line rules on the latest earlier raise) in the observer. Needs its own ticket.

Files: `report.html`, `findings.md`, `plan.md`, `design.md`, `ticket.md`.
