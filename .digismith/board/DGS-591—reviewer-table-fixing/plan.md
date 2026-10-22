# DGS-591 plan: interim `fixing` verdict lines

Spec: `design.md` (approved: checkpoint 1). Ticket: `ticket.md`.
Code runs under `node --experimental-strip-types` (no parameter properties, enums, namespaces).
Tests: `pnpm --dir packages/cli exec vitest run src/reviewer src/autonomous`. Tests use fake ledgers in temp folders; no ledger line is deleted or rewritten.
Role mode: one ticket Reviewer at the end; no task packs (small fix, the conductor's call).

### Task 1: Parser accepts `fixing`

Files: `packages/cli/src/reviewer/verdicts.ts`, `verdicts.test.ts`.
1. Tests first: `-> fixing (x)` and a reason-less `-> fixing` parse with `verdict: "fixing"`; `parked` without a reason still fails; `parseVerdictLines` skips `fixing` entries (a later `fixing` does not replace a `fixed` judgement). Run: they fail.
2. `FINAL_VERDICTS = ["fixed","parked","rejected"]` (keep `VERDICTS` as an alias if anything imports it), `Verdict` stays final, `EntryVerdict = Verdict | "fixing"`. Regex accepts `fixing`. Reason optional for `fixed` and `fixing`. `parseVerdictLines` skips `fixing`.
3. Run the tests: pass. Commit `feat(dgs-591): accept the interim fixing verdict line`.

### Task 2: Table treats `fixing` as history, fails on an unfinished fix

Files: `packages/cli/src/reviewer/table.ts`, `table.test.ts`.
1. Tests first:
   - The real DGS-585 shape (fake, built in the test): 27 `fixing` lines plus final lines across task and ticket packs, r2+ rulings (`ticket final r4: F7 -> fixed` for an r3 finding), reason-less `fixing`. `buildRows` succeeds; no cell contains `fixing`; the verdict cells equal the final rulings.
   - `buildJson`: a finding's `history` has the `fixing` entry with `verdict: "fixing"`; `latestRound`/`latestRuling` are the final ruling.
   - A lone `fixing` line fails: `ledger line 2: Review task 1 r1: F1 -> fixing (x): fix not finished for task 1 r1 F1`.
   - `fixed` then a later `fixing` for the same finding fails the same way.
   - Two unfinished findings are both named in one error.
   - `runTable` on a temp workspace with `fixing` lines writes findings.md and the ledger bytes stay the same.
2. In `resolve`: keep the entry in history (round, verdict, reason, plus the line and text for the error). After sorting, collect findings whose last entry is `fixing`; throw one error naming each. `latest()` returns the last final entry.
3. Run the tests: pass. Commit `feat(dgs-591): show fixing lines as history in the reviewer table`.

### Task 3: Observer counts only final rulings

Files: `packages/cli/src/autonomous/observers-real.ts` and its test file.
1. Test first: a ledger with `Review task 1 r1: F1 -> fixing (x)` for an Important F1 gives `result: "findings"`; adding `... -> fixed (abc)` gives `"clean"`; `fixed` then `fixing` gives `"findings"`.
2. A finding is ruled when the last entry with the same kind, id, round and finding is not `fixing`.
3. Run the tests: pass. Commit `fix(dgs-591): count only final rulings in the verdict observer`.

### Task 4: Docs and anchors

Files: `skills/subagent-driven-development/SKILL.md` ("Verdict lines"), `skills/reviewer/SKILL.md`, `packages/cli/src/reviewer/sdd.test.ts`, `card.test.ts`.
1. Tests first: both files contain `Review task 2 r1: F1 -> fixing (check every commit)` and say "fix not finished".
2. SDD: when a fix starts you may append the interim line `... -> fixing (<what>)`; a final line must follow it, or `dg reviewer table` fails with "fix not finished"; the table shows the final ruling and `--json` keeps `fixing` in the history. Reviewer card: the same in one sentence.
3. Run the full cli suite and the strip-types smoke test. Then the manual check: copy DGS-585's `progress.md` and `reviews/` to a temp folder (read-only source) and run `dg reviewer table --workspace <tmp> --out <tmp>/findings.md` and `--json`; it succeeds. Commit `docs(dgs-591): allow the fixing line in the verdict docs`.
