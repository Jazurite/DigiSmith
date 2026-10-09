# dg clickup: set a ticket's parent (`--parent`), so milestones can be built with the CLI

**Status:** Idea, Jack (2026-10-08 ~17:5x UTC+7 [10:5xZ]). ClickUp: **DGS-197** (C.2: CLI, task id `14zcebrv8mm`). No design yet.

## Why

Jack wants the Dedicated Workbox milestone (DGS-182) to hold every VPS and Workbox ticket as a subtask. A milestone is a parent ticket with
subtasks (DGS-25 "Legacy Letter Backfill" and DGS-110 are the examples). `dg clickup` can **read** a ticket's `parent` (it is in the client types) but
`create-task` and `update-task` have **no `--parent`**, so the milestone cannot be built from the CLI. The old milestones were set up another way
(a one-off script or the ClickUp UI).

## To do

1. **First, test on a throwaway task:** can ClickUp put a subtask in a **different list** than its parent? The DGS-25 children all share the parent's list
   (Town Hall). If a different list is refused, the regroup must `dg clickup move-task` the tickets into the parent's list first. Write down the result.
2. Add `--parent <task id>` to `update-task` and `create-task` in the ClickUp client and the CLI. Pass an empty value to clear the parent.
3. Tests on fixtures (request body carries `parent`; empty value clears it). Keep the diff small.
4. Acceptance: on a throwaway task, set the parent, read it back, clear it, delete nothing (never hard-delete a ticket; archive the throwaway).

## Then (Jack's order, 2026-10-08)

Fold every VPS and Workbox ticket into DGS-182 as subtasks. The candidate list is in the DGS-182 thread: C.1 and C.2 tickets first (DGS-106, 107, 109, 131,
151, 153, 169, 177, 180, 181, 183, 184, 190), then the older VPS tickets in other lists (DGS-6, 78, 115, 125, 126, 130, 132, 157) only if Jack confirms.
Tickets that already have a parent (DGS-119 to DGS-121) stay where they are.

## Related

DGS-182 (the milestone), DGS-25 (the other milestone), DGS-186 and the Town Hall items, `backlog/macbook-home-server.md`.
