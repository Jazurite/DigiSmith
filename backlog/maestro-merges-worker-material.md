# The maestro merges the material of several workers on one ticket

**Status:** Idea, Jack's call (2026-10-03 22:16 UTC+7 [15:16Z]: "We'll another backlog"). No design yet. ClickUp: **DGS-160** (list
E.4: Workflows, created 2026-10-03 22:19 UTC+7 [15:19Z]). Under "no ticket, no work" every item has a ticket.

**Source:** the DGS-158 design (ticket-based naming architecture), the open points about two workers on one ticket.

## The rule so far (Jack, 2026-10-03)

- A ticket with two or more workers gets a nested folder for each worker in the ticket folder:
  `.digismith/board/<KEY>—<slug>/worker-<agent session name>/`, for example `worker-dgs-154` and `worker-dgs-154-comment`.
- The workers do not know about each other. Only the maestro knows. Each worker writes only in its own folder, and the maestro
  names that folder in the worker's brief.
- When the ticket is finished, the maestro sums and merges all the material into one set in the ticket folder (one design, one
  plan, one report, and so on). The workers do not merge.
- After the merge, the maestro removes the nested folders (Jack: "removed").
- A second worker that joins a ticket whose first worker already wrote in the ticket folder is the maestro's problem to solve,
  not a worker-side rule.

## Open questions for the design

- The merge rule: what the maestro does when two workers wrote the same file name (`design.html`, `report.html`), or wrote
  conflicting content.
- The safe order for the removal, so nothing is lost for good: commit the nested folders first when the profile commits board
  files, merge, check, then remove.
- How the maestro sees that a ticket is finished, and how it checks the merged set before it removes the folders.
- The late-joining worker: where the first worker's files go, and how the maestro tells the new worker its folder.
- Who reviews the merged material, and where the merge is recorded (the ticket, the report).
- Whether this is a Procedure of the maestro (Kind field in clan E) and where it lives in the runbook and the Flux protocol.

## Related

[worker-and-maestro-conventions.md](worker-and-maestro-conventions.md) (DGS-158), DGS-159 (code and file moves),
DGS-154 Flux (the close-out step in the runbook).
