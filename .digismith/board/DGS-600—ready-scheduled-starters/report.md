# DGS-600 report: the ready starter

Ticket DGS-600. Branch `DGS-600__ready-starter`, order scheduling-03.

## What changed
- `Tracker.listByStatus(name)` replaces `listToDo()`; `LoTask.mode` reads the Mode field (`Autonomous`, `Manual` or none). `searchTeamTasks` takes an optional status filter.
- The Definition of Ready has a fifth reason: `Mode is not Autonomous (Manual or missing)`.
- `autonomous-scan` and the controller repair read `ready` only. `to do` is the attended starter. Existing tickets in `to do` stay there.
- The Steward knows `scheduled` and `ready`: `approved --into <to do|ready|scheduled>`, and `started` leaves `ready` too.
- Texts: the `dg autonomous` help, the autonomous-scan job description and the Nightwatch label (`Ready waiting`), with 14 refreshed visual baselines.
- `dg clickup get-field <id>` reads a field, its options and its locations (read only).
- `dg clickup create-field --location <type:id>` creates a team field at locations read with `get-field`. It reads the locations back after the call, de-duplicates repeated locations, and names the field id if the read-back fails.

## Tests
- Whole suites at the last code commit: `clickup-client` 153 passed; CLI 141 files, 2067 passed (the pinning test of 3d53baa adds one more); `tsc` clean. `pnpm visual` 176 passed.
- `nexus-api` and `nexus-web` each showed 2-3 timeout failures under full-suite load; every failing file passed alone (44/44 and 25/25), so none touches this diff.
- Strip-types smoke: `get-field --help` and `autonomous scan --help` both print help.

## Review
Eight tasks, each reviewed (all Approved; Task 7 had one fix wave of five Minor findings). Whole-branch review round 1: With fixes (F1 Important: the top bar baselines were not refreshed; F2-F5 Minor, fixed; F6 Minor, no code change). Round 2: all addressed, one new Minor, fixed in `3d53baa`. See `findings.md`.

Why the first visual run passed on the old baselines: the Playwright tolerance `maxDiffPixelRatio` 0.001 allows about 900 differing pixels on a 1000x900 page, and the label change is 72-75 pixels. A tighter ratio (about 0.0001) would catch such a change; that is a separate ticket.

## For the setup after the merge (F6)
Between the merge build of `dg` and setup step B1 the scan finds no `ready` status and posts one `no-starter-status` comment on DGS-548. Nothing is claimed. B1 runs right after the build, which closes the window.
