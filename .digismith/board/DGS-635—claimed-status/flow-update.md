# DGS-635 flow update

The conductor applies this after the merge. The builder did not apply it.

## 1. Replacement rows for the DGS-488 ticket flow table (ClickUp description)

| Status | Meaning |
|---|---|
| refinement | Jack shapes the ticket. When Jack approves, it moves to `to do` or `scheduled`. |
| scheduled | The ticket waits for its Scheduled at time. At that time it moves to `to do`. This holds for both Modes. |
| to do | Mode Autonomous: the factory may claim the ticket at any hour. Mode Manual: attended work. The factory never claims it. |
| claimed | The scan claimed the ticket. It wrote the order and made the worktree. The Builder starts next. |
| in progress | The conductor sets this status when the Builder starts to build. It reads the status back. |

Remove the old rows: "to do attended starter" and the `ready` row. The old `scheduled` row (Mode Autonomous to `ready`, Mode Manual to `to do`) and the old `refinement` row (to `to do`, `ready` or `scheduled`) are replaced by the rows above.

## 2. Runbook line for `.digismith/sessions/workbox.md`

Builder start: set the ticket to `in progress` and read it back (`dg clickup update-task <KEY> --status "in progress"`, then `dg clickup get-task <KEY>`).
