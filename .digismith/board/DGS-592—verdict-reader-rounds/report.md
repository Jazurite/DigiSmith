# DGS-592 implementation report

Built: the verdicts observer of the Nightwatch controller (`packages/cli/src/autonomous/observers-real.ts`, `realStores().reviewerData.verdicts()`) now takes each finding's latest ruling across rounds from the same model `dg reviewer table --json` builds. `reviewer/table.ts` has a new exported `linkRulings()` (the table's one linking rule: a ledger line rules on the finding of the pack with the same round, else on the latest earlier raise) and `isOpen()` (no line, or the last line is `fixing`). `resolve()` calls the same private `link()` in strict mode, so the table keeps every check and error message. The observer reads the same folders as before (a folder without `report.md` is skipped), links all reviews once, and marks a pack `findings` when a Critical or Important finding of that pack is open. Output shape is unchanged.

Result: Important F1 raised in r3, `r3: F1 -> fixing`, `r4: F1 -> fixed`, no F1 in the r4 pack -> the r3 pack is `clean` (was `findings`). Without the r4 line it stays `findings`. When r3 and r4 both raise F1 and only an r4 line exists, the r4 line rules on the r4 finding only (r3 `findings`, r4 `clean`), as in the table.

Commits (eb0730e..6924da5): 1420730 table link step, faf9089 observer, 6924da5 spec row 4 test. Plan and ticket: eb0730e.

Review: task packs skipped (two small tasks, conductor order). Ticket final r1 (claude-opus-5-5): ready to merge, 0 Critical, 0 Important, 1 Minor. F1 (no observer test for spec row 4) fixed in 6924da5; no re-review for the test-only change (conductor order).

Tests: `pnpm --dir packages/cli exec vitest run`: 150 files, 2194 tests pass, including the strip-types smoke test.

First use (conductor, after the merge and the dist rebuild): run the observer on a fixture or ticket folder with a fixing-then-fixed finding and show no open finding.

Files: `report.html`, `findings.md`, `plan.md`, `ticket.md`, `tokens.json`.
