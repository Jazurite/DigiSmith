# DGS-624 spec: `dg reviewer table` accepts a no-findings ledger line

## The problem
The 2026-10-25 test night: a Builder wrote the ledger line `Review task N r1: no findings` for an approved review with no findings. `dg reviewer table` threw `ledger line N: not a verdict line: ...` and the Builder had to edit a scratch copy of the ledger.

## Cause (checked in code)
`packages/cli/src/reviewer/verdicts.ts`, `parseVerdictEntries`: every line that starts with `Review task ` or `Review ticket ` must match `LINE_RE` (`... : F<n> -> fixed|parked|rejected|fixing`). The no-findings line does not match, so the parser throws. `runTable` in `table.ts` calls this parser, so the table fails.

## The change
In `parseVerdictEntries` add one second pattern, `NO_FINDINGS_RE = /^Review (task|ticket) (\d+|final) r(\d+): no findings$/`. A line that matches it is accepted and produces no verdict entry (it rules on no finding). Order: test `NO_FINDINGS_RE` first, then `LINE_RE`.

Why no entry: the table row for an approved review with zero findings already comes from the review pack (`buildRows` in `table.ts`: "approved, no findings"; `buildJson`: `approvedReviews`). The ledger line only has to stop being rejected. The other two callers (`oculus/views.ts`, `autonomous/observers-real.ts`) only list or link finding verdicts, so a skipped line changes nothing for them.

Not changed: `LINE_RE`, `table.ts`, the findings parser, the reviewer card. Malformed lines still throw: `no findings` with a reason in brackets, a different case, `no finding`, extra text, a missing round, and `Review task 1 r1:` alone.

## Protected paths touched
- `packages/cli/src/reviewer/verdicts.ts`
- `packages/cli/src/reviewer/verdicts.test.ts`
- `packages/cli/src/reviewer/table.test.ts`

Merge needs the Maestro.

## First use after the merge
Conductor runs, in a scratch folder (no ClickUp, no depot write):
`mkdir -p /tmp/dgs624/reviews/task-1-r1 && printf '# r\n\n```json findings\n[]\n```\n' > /tmp/dgs624/reviews/task-1-r1/report.md && printf 'Review task 1 r1: no findings\n' > /tmp/dgs624/progress.md && dg reviewer table --workspace /tmp/dgs624 --out /tmp/dgs624/findings.md`
Expect: `wrote ... (1 row(s))` and a row `task 1 | 1 | - | - | approved, no findings`. Before the fix: `not a verdict line`.
(The Builder confirms the review-pack path and fence shape from `findings.ts` and `table.test.ts` before writing this into the report.)

Sign-off: Auto.
