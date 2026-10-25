# Plan tasks become a ClickUp checklist on the ticket, ticked as SDD finishes each task

**Key:** DGS-631
**Type:** Task (F.7 Report and sync), with its tool side DGS-632 (D.3 ClickUp Channel) on the same branch
**Source:** ClickUp DGS-631 and DGS-632 (2026-10-25). Full text: `dg clickup get-task DGS-631`, `dg clickup get-task DGS-632`.

## Need
Jack wants to see a ticket's plan and its progress inside the ClickUp ticket. The plan's tasks become a checklist on the ticket (one item per
plan task, plan order, named like the task). SDD and executing-plans tick an item when its task passes. A plan change updates the checklist.

## Why a checklist, not subtasks
DGS-563 spike Q4: subtasks per plan task cost about 4 status writes per task, a new DGS key per task, no counting gain. A checklist gives the
visibility with one write per task, no new keys, no status flow.

## DGS-632 (tool side)
`dg clickup checklist sync --task <KEY> --plan <plan.md> [--done <n,...>] [--name "Plan"] [--yes]`: one idempotent entry point. Reads
`### Task N: <title>` headings, creates the checklist if missing, adds, renames or removes items by task number, ticks `--done`, prints one
JSON line. Dry run unless `--yes`. Vitest with mocks only. A failed write exits non-zero with a clear message.

## Acceptance
- The sync command exists, is idempotent and has mock tests.
- writing-plans runs it once after the plan commit (DGS- keys only; other keys skip with one line).
- SDD and executing-plans run it after each passed task with `--done` from the ledger, and once at the final step. A failed sync warns and
  never blocks the build.
