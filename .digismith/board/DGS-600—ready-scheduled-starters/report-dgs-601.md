# DGS-601 report: the scheduled starter

Ticket DGS-601. Branch `DGS-601__scheduled-starter`, order scheduling-03. Commit range `700fa88..85d2f57`.

## What changed
- `dg autonomous schedule-release [--dry-run]` moves each `scheduled` ticket whose "Scheduled at" is past: Mode Autonomous to `ready`, Mode Manual to `to do`. It reads the status back after each move. It writes `schedule-move` and `schedule-move-failed` events. It comments once per problem (empty date, bad date, empty Mode, failed move) and keeps those notes in `schedule-notes.json`.
- A failed event write never stops the run: the other tickets still move and the notes are still saved. A `schedule-move-failed` event is written once per failure text, not on every run.
- The Nexus job `schedule-release` runs the command every 5 minutes, all day (`00:00`-`23:59` UTC+7), `catchUp: 'skip'`, order 45 (before the scan). No model tokens.
- The tracker reads "Scheduled at" (`LoTask.scheduledAt`: ms, `null` when empty, `"invalid"` for a bad value).
- `dg clickup create-field --type date` creates a date field. The "date body is not captured yet" hint shows only on a 4xx; a 5xx, a network error or an expired session gives the plain error.
- `--field` on `create-task` and `update-task` writes a date and time to a date field: `YYYY-MM-DD HH:MM` (UTC+7) or an ISO time with an offset. A plain day is refused.
- `dg clickup create-view` creates a list view at a space, filtered on one status and sorted by one custom field (field ids). It refuses a name clash, a blank status and a blank sort field, and reads the view back.
- The ClickUp client has `setCustomField(..., valueOptions)`, `getSpaceViews` and `createSpaceView`.

## Tests
- Whole suites after the fix wave (45722ec): `clickup-client` 156 passed; CLI 144 files, 2111 passed; `tsc` (build config) clean; `nexus-api` 410 passed. After 85d2f57: CLI 2111 passed.
- Strip-types smoke: `autonomous schedule-release --help` and `clickup create-view --help` both print help.
- Type check over the test files: the branch adds no new error. The same 9 test-file errors are on `main` (700fa88) and on the branch.

## Review
Eight tasks, each reviewed: all Approved (Tasks 4 and 7 with no findings; 10 Minor findings deferred). Whole-branch review round 1: With fixes (F1 Important: an event-write error aborted the run; F2 Important: the capture hint showed on every error; F3-F11 Minor). One fix wave (45722ec) fixed all eleven. Round 2: all addressed, one new Minor F12 (a test that passed on an error path), fixed in 85d2f57. Every finding is fixed. See `findings-dgs-601.md`.

## For the setup after the merge
- Before the Nexus restart in B3, run `dg autonomous schedule-release --help` once from the rebuilt main-checkout CLI.
- The `POST /space/{id}/view` body (status filter, `cf_<id>` sort and columns) is not checked against a capture. After B2, Jack looks at the Schedule view once in ClickUp.
- The ClickUp date-field create body is not captured either: B1 sends it once and stops on a 4xx.
