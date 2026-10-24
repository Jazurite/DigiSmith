# DGS-592 spec and plan: the verdicts observer reads the latest ruling across rounds

Ticket: `ticket.md`. Sign-off: Auto. CLI only: no web, Playwright, Storybook or visual gate.
Code runs under `node --experimental-strip-types` (no parameter properties, enums, namespaces).
Tests: `pnpm --dir packages/cli exec vitest run src/reviewer src/autonomous`.
Role mode: one ticket Reviewer at the end; no task packs (small fix, two tasks).

## Spec

**Problem.** `realStores().reviewerData.verdicts()` (`observers-real.ts` ~line 248) keeps only the ledger entries whose round equals the pack's round. The line `Review ticket final r4: F1 -> fixed` rules on the r3 finding F1 when the r4 pack did not raise F1 again (`table.ts` `resolve()`: "same round, else the latest earlier raise"). The table shows that r3 finding as `fixed [r4]`, but the observer still reports the r3 pack as `findings`.

**The model.** `dg reviewer table --json` builds its rulings in `reviewer/table.ts` `resolve()`. That function does two things:
1. It links every ledger entry to one raised finding and sorts each finding's history by round.
2. It throws for a ledger line that no pack raised, a finding with no line, or a finding whose last line is `fixing`.

The table needs step 2. The observer cannot use step 2: a missing line or a `fixing` line means "still open" for the controller, not an error.

**Design.**
- Split `resolve()`. The new exported `linkRulings(reviews, entries)` does step 1 only. It skips a line that no pack raised (the observer reads only folders with a `report.md`, so a line for a newer round can come before that round's report; today the observer also ignores such lines). `resolve()` calls `linkRulings()` and keeps every strict check and error text unchanged. Orphan detection moves into `resolve()` with the same message.
- Export `isOpen(history)`: true when the history is empty or its last entry is `fixing`. That is the rule the observer uses today, now applied to the cross-round history.
- The observer builds one `Review` per review folder that has a `report.md` (same folders as today), calls `linkRulings()`, and marks a pack `findings` when any Critical or Important finding of that pack `isOpen`. Minor findings never block (unchanged). Output shape (`VerdictView[]`) is unchanged.
- No change to `buildRows`, `buildJson`, the JSON schema, the ledger format or `advance.ts`.

**Behaviour after the fix.**
| Ledger | Before | After |
|---|---|---|
| r3 pack raises Important F1; `r3: F1 -> fixing`, `r4: F1 -> fixed`, r4 pack has no F1 | r3 `findings` | r3 `clean` |
| same, no r4 line | r3 `findings` | r3 `findings` |
| r3 pack raises Minor F1; `r3: F1 -> fixing`, no r4 line | r3 `clean` | r3 `clean` |
| r3 and r4 packs both raise Important F1; `r4: F1 -> fixed` only | r3 `findings`, r4 `clean` | same (the r4 line rules on the r4 finding, as in the table) |

## Task 1: Shared link step in `reviewer/table.ts`

Files: `packages/cli/src/reviewer/table.ts`, `table.test.ts`.
1. Tests first, in `table.test.ts`:
   - `linkRulings`: r3 raises F1, entries `r3 fixing`, `r4 fixed`, no r4 pack -> F1's history is `[fixing r3, fixed r4]`, sorted by round.
   - `linkRulings` with a line that no pack raised -> no throw; the line is not in any history.
   - `linkRulings` with an unjudged finding and a last `fixing` -> no throw.
   - `isOpen`: `[]` -> true; `[fixing]` -> true; `[fixing, fixed]` -> false; `[fixed, fixing]` -> true.
   - The existing strict tests (orphan line, no verdict line, fix not finished) still pass with the same messages.
   Run: the new tests fail.
2. Move the linking loop and the history sort out of `resolve()` into exported `linkRulings()`; `resolve()` calls it, then runs the orphan, unjudged and unfinished checks. Export `isOpen()`. Export the `Resolved` type as needed.
3. Run the tests: pass. Commit `refactor(dgs-592): share the ruling link step of the reviewer table`.

## Task 2: Observer uses the shared model

Files: `packages/cli/src/autonomous/observers-real.ts`, `observers-real.test.ts`.
1. Tests first, in the `realStores` block (helpers `addReview`, `finding`, `sdd` as the F3/F4 tests; `addReview` gets a round argument so `pack.md` carries the right round):
   - Important F1 in `ticket-final-r3`, `ticket-final-r4` with `[]`; ledger `r3: F1 -> fixing (x)` + `r4: F1 -> fixed (abc)` -> the r3 pack is `clean`. This is the ticket's test.
   - Same, no r4 line -> the r3 pack is `findings`.
   - Minor F1 in r3 with only `r3: F1 -> fixing` -> `clean`; Critical F1 in r3 with `r3 fixing` + `r4 fixed` -> `clean`; Critical with only `r3 fixing` -> `findings`.
   - The existing F2, F3 and F4 tests stay green.
   Run: the first and fourth new tests fail.
2. In `verdicts()`: read every review folder with a `report.md` into `Review` objects (kind, id, round from the folder name; findings from `extractFindings`), keep the `pack.md` check per folder, call `linkRulings(reviews, entries)`, and for each review compute `blocking` with `isOpen(link.get(f).history)`. Update the inline comment.
3. Run the tests: pass. Run the whole CLI suite and the strip-types smoke test. Commit `fix(dgs-592): read each finding's latest ruling across rounds in the verdicts observer`.

## First use (after the merge, by the conductor)

Rebuild the CLI dist. Run the observer (`realStores(...).reviewerData.verdicts()`) on a pack fixture with r3 `fixing` + r4 `fixed` for an Important finding, and on the same fixture through `dg reviewer table --json`; both show the finding closed.
