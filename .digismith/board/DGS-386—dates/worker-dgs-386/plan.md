# DGS-386 plan: plain dates are that day in UTC+7

## Findings
- Only `create-task` and `update-task` take date flags. Both call `buildTaskWriteBody` in `packages/cli/src/clickup/lib.ts`, which does `new Date(str).getTime()`. No other command has `--start-date` or `--due-date`.
- `ClickUpTaskWriteBody` already has `start_date_time` and `due_date_time`.
- `ClickUpClient.request` (`packages/clickup-client/src/client.ts`) lets axios throw "Request failed with status code 400"; the body is lost.

## Change
1. New `packages/cli/src/clickup/parse-date.ts`: `parseDateFlag(value, flagName) -> { ms, hasTime }`.
   - `YYYY-MM-DD` (strict, calendar-valid) -> that day 04:00 UTC+7 (= 21:00 UTC the day before), `hasTime` false.
   - A value with a time or offset (`2026-10-11T04:00:00+07:00`, `...Z`) -> `Date` parse as is, `hasTime` true. A time without an offset: refused (zone unclear).
   - Anything else: the existing "invalid --start-date ..." error.
2. `buildTaskWriteBody` uses it: sets `start_date` / `due_date`, plus `start_date_time` / `due_date_time` = `hasTime` (false for plain dates; true for explicit times, so ClickUp shows the time).
3. Order check, same file: `checkDateOrder(body, existing?)`. Both given: compare in the builder (throw "due date is before the start date"). Only one given (update-task only): read the task with `client.get('/task/<id>')`, compare to its stored `start_date` / `due_date`, throw a clear message naming both dates in UTC+7. `create-task` has no stored task, so only the both-given check applies. If the read returns null for the other date, no check.
4. `ClickUpClient.request`: catch axios errors with a response and rethrow `Error("ClickUp <status>: <body JSON>")`. Applies to every command; the error text of existing tests that match "status code" will be checked.

## Tests (first, see them fail)
- `parse-date.test.ts`: plain date -> `1791666000000` for 2026-10-11 (and a leap day, bad day 2026-02-30 refused); offset and Z values pass through; time without offset refused; garbage refused.
- `lib.test.ts`: update the two old date expectations; plain dates set `*_date_time` false; explicit time sets true; due before start refused.
- `update-task.test.ts` (create if missing, else add): only `--due-date` earlier than the stored start -> refused, no PUT made; only `--start-date` later than the stored due -> refused; ok case sends the PUT; stored date null -> no check.
- `create-task.test.ts`: both dates in wrong order refused.
- `client.test.ts`: a 400 with a body gives a message containing the body.

## First use (after merge and push)
`dg clickup update-task 14zcebrvdde --status done --start-date 2026-10-11 --due-date 2026-10-11`, then `get-task`: both dates must read `1791666000000` (2026-10-11 04:00 UTC+7).

## Left out
- A `--timezone` flag: not asked; UTC+7 is fixed in the helper as a named constant.
- The Frontdoor commands: they have no date flags.
