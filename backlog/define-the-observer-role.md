# Define the Observer role (watch a project's butler without disturbing it)

**Status:** Idea, split out of DGS-170 by Jack (2026-10-04 11:38 UTC+7 [04:38Z]): "Forget the observer, put it into another backlog now, just
focus on the master and butler." No design yet. ClickUp: **DGS-175** (list O.3: Roles, created 2026-10-04 11:38 UTC+7 [04:38Z], task id `14zcebruqu0`).

**Source:** DGS-170 (the Master role) and DGS-176 (the Maestro role). Jack had agreed with the Observer earlier the same day ("agree with observer"). He now wants
DGS-170 to focus on the roles he is naming, the master and the butler, so the Observer is decoupled.

## What was agreed so far

- The Observer is a client that watches a project's maestro (the "butler") **without disturbing it**: read-only, it reads panes and the
  maestro's published state and never types.
- The end user would use only an Operator-like client to give orders, or an Observer to watch. Never a worker directly.
- Making "why" visible needs the maestro's state in one structured place (a state file: roster, open questions for the end user, a
  decision log with a reason each, next steps). That requirement stays with DGS-170, because it is about what the butler holds.

## To define here

- What the Observer shows first: what the butler is doing now, why, and what it waits on the end user for.
- How it attaches without interfering (`herdr pane read`, `opencode attach` in a read-only mode) and why two clients on one pane are safe
  for it (herdr allows one typing client per pane; the Observer never types).
- Whether one Observer can watch several projects' butlers.

## Related

[brainstorm-the-new-maestro-role.md](brainstorm-the-new-maestro-role.md) (DGS-176, the Maestro role, blocks this item; DGS-170 is the Master role),
[build-observer-and-operator-clients.md](build-observer-and-operator-clients.md) (DGS-174, the build),
[maestro-in-herdr.md](maestro-in-herdr.md) (DGS-169), [define-project-and-project-workflow.md](define-project-and-project-workflow.md) (DGS-172).
