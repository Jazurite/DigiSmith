# DGS-12 Plan: priority validation, only 1 to 4

Ticket: DGS-12 (ClickUp 14zcebru20m, D.3: ClickUp Channel)

## Where the check goes
`buildTaskWriteBody` in `packages/cli/src/clickup/lib.ts`, in the existing `if (argv.priority !== undefined)` block (lines 122-127).
Both handlers call this helper first, before `clientFactory()`, so one change covers create-task and update-task and no client is built on a bad value.
Other priority validation: none (grep `priority` in packages/*/src: only the option declaration and the type).

## Change
Replace `!Number.isInteger(p)` with `!Number.isInteger(p) || p < 1 || p > 4`.
`Number.isInteger` already rejects NaN, fractions, strings, Infinity. The range check rejects 0, negatives, 5, 7.
Message (unchanged text, now true): `invalid --priority "<value>" — expected an integer 1-4`.

## Tests (failing first)
lib.test.ts, replace "throws when priority is not an integer" by a table:
| value | result |
|---|---|
| 1, 2, 3, 4 | accepted, body.priority equals value |
| 0, -1, 5, 7 | throws `invalid --priority "<v>" — expected an integer 1-4` |
| NaN, 2.5, "3" (string), Infinity | throws, same message form |
Handler tests, one per command (create-task.test.ts, update-task.test.ts): `priority: 7` -> factory spy never called, no write, exit code 1, stderr has the message.

## Files touched
- packages/cli/src/clickup/lib.ts (priority lines only; DGS-11 also edits lib.ts and update-task.ts, I touch no other line)
- lib.test.ts, create-task.test.ts, update-task.test.ts (new tests only; per-describe counts reported against base)
- this plan.md, report.md, report.html in this board folder
