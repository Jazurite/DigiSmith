# Ready and scheduled starters (DGS-600 + DGS-601)

**Key:** DGS-600
**URL:** https://app.clickup.com/t/14zcebrwja3
**Also covers:** DGS-601 (https://app.clickup.com/t/14zcebrwja4)
**Pitch:** DGS-434. **Initiative:** Scheduling (DGS-436).
**Story Points:** TBD

## Description

DGS-600: a new status `ready` (unattended). DigiSmith picks it up on its own. `to do` becomes attended: Jack starts and
observes it, never picked up automatically. `autonomous-scan` claims `ready` instead of `to do`. The status flow in
DGS-488 gets the new line.

DGS-601: a new status `scheduled` (parked until a date), a custom field "Scheduled at" (date and time, UTC+7), a custom
field "Mode" (`Autonomous` | `Manual`, on every ticket). A Nexus clock (a script, no model) moves a due `scheduled`
ticket: Autonomous -> `ready`, Manual -> `to do`. A Schedule view in ClickUp. The Oculus view is DGS-602 (not here).

Full text: `dg clickup get-task DGS-600`, `dg clickup get-task DGS-601`.

## Acceptance Criteria

- One spec covers both tickets; one plan per ticket (`plan.md` for DGS-600, `plan-dgs-601.md` for DGS-601).
- The scan claims `ready` only; every reader of `to do` is listed with its change.
- `schedule-release` runs every 5 min, all day, plain `dg`, idempotent, catchUp `skip`.
- The tool gaps (date field, view) get named `dg` commands.
