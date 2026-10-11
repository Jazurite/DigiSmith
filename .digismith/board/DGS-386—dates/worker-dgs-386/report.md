# DGS-386 report: plain dates are that day in UTC+7

Worker `dgs-386`, 2026-10-11 (UTC+7). Branch `dgs-386`.

## Built
- `parse-date.ts`: `parseDateFlag`, `formatUtc7`, `assertDateOrder`. A plain `YYYY-MM-DD` is that day at 04:00 UTC+7 and sends `start_date_time` / `due_date_time` false. A value with a time and an offset is sent as it is (flag true). A time without an offset, or a day that does not exist, is refused.
- `buildTaskWriteBody` uses it for `create-task` and `update-task` (the only commands with date flags) and refuses a due before the start when both are given.
- `update-task` with one date reads the task once and checks the other stored date before the PUT.
- `ClickUpClient.request` adds ClickUp's error body to the message of the same axios error, so `err.response` stays. `applyFields` no longer prints the body twice.
- Tests: parser, body builder, both commands, client (body shown, `response` kept), field-set. Whole repo passes with `FORCE_COLOR=1`; CLI build clean.

## Not built
- A `--timezone` flag: not asked; UTC+7 is a named constant.

## Review
Claude whole-branch review, two verified finds, fixed with tests: a timed value on a day that does not exist (`2026-02-30T...`) rolled over silently; a string error body was printed twice by `applyFields`. Repo-wide grep found no code that matches the old "status code" text; `FrontdoorClient` has its own request path and is unaffected.

## First use
Close DGS-386 with `--start-date 2026-10-11 --due-date 2026-10-11`; both must read `1791666000000`. See the maestro report.
