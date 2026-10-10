# ClickUp Synchronization: the ticket follows the work, all the time

**Status:** Epic, Jack's call (2026-10-10 UTC+7). No design yet. ClickUp: **DGS-213** (list Town Hall, created 2026-10-10 11:46 UTC+7 [04:46Z], task id `14zcebrvck0`).

**Source:** the DGS-25 backfill session, 2026-10-10. DGS-32 (letter G) was finished but still `in progress` until Jack set it by hand, and
DGS-42 (letter Q) stayed `backlog` while we worked on Q. Jack: "for the DigiSmith profile or any profile that enables the tracker as ClickUp
... anything we do right now, right here, we need to sync or update the ClickUp ticket continuously. You will do the work, but you still
keep ClickUp updated." He named it "ClickUp Synchronization" and said "epic", not "milestone".

## Scope

For every profile whose tracker is ClickUp (the DigiSmith profile first), all work keeps its ClickUp ticket current while it happens:
ticket builds, and also the maestro's and the Master's own work (backfills, orders, Scouts, decisions).

- **Status follows the work:** picked up, building, in review, done. No ticket stays `backlog` while we work on it.
- **Progress comments** at each checkpoint and merge.
- **New work gets a ticket** in the same step (already the rule for backlog items, DGS-163).
- **Descriptions stay in step** with their repo files (`~/.digismith-depot/backlog-sync/sync.py` today).

Out of scope: Jira. Jira status changes stay manual (standing rule). A Jira profile keeps the I.1 write-back only.

## Subtasks

- **DGS-178** The maestro posts ClickUp progress comments automatically (Jack, 2026-10-10: a subtask of this epic; set 2026-10-10,
  which moved it from E.4 to Town Hall).
- Candidates, Jack confirms: DGS-79 (status follows the work), DGS-21 (ClickUp write-back, the I.1 analog), DGS-163 (each backlog item gets
  its ClickUp task, with description sync), DGS-179 (a "ready" status and a "Pickup" field).

## Known blocker

The auto mode classifier stops some of the Master's ClickUp writes ("External System Writes"). On 2026-10-10 it blocked the DGS-32
status change, but it let through the creation of this ticket and the DGS-178 parent change.
Continuous sync needs a guardrail Jack writes: a permission rule or a pre-approved script directory (the DGS-155 approach). Never route
around the classifier through another agent.

## Open questions

1. Where the mechanism lives. Jack's rule (2026-10-10): how the agent works in a session is clan A: System (probably A.3 Lifecycle Hooks),
   and the lifecycle stage is clan F: Scripture (.7 Report and sync). The epic itself sits in Town Hall, like DGS-25.
2. Which steps trigger each status move (init or bootstrap, the first checkpoint, the final review, finishing a branch, a Scout report).
3. Statuses differ per ClickUp list: one mapping per list, or read from the list.
4. "Epic" in ClickUp: DGS-25 uses ClickUp's Milestone task type. An Epic task type must be made in the ClickUp UI; `dg clickup` cannot
   set a task type yet. Does the term change for DGS-25 and DGS-182 too?
5. A better name is welcome (Jack). Option: "ClickUp Live Sync".

## Related

DGS-178, DGS-79, DGS-21, DGS-163, DGS-179, DGS-155 (approval inside a guardrail), DGS-189 (tracker catalog), DGS-186 (clan F),
`maestro-posts-clickup-progress-comments.md`, `backlog-item-gets-clickup-task.md`, `clickup-ticket-writeback-i1-analog.md`.
