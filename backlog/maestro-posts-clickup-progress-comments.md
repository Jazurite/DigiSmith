# The maestro posts ClickUp progress comments automatically (DGS-159 first)

**Status:** Decided for DGS-159, an idea for the rest. Jack's call (2026-10-04 14:26 UTC+7 [07:26Z]): "For 159 you have my permission to do it and should do it
automatically from now on. Add backlog item if not exists." ClickUp: **DGS-178** (created 2026-10-04 14:26 UTC+7 [07:26Z] in E.4: Workflows, task id `14zcebrur0g`; since 2026-10-10 a subtask of the
epic DGS-213 ClickUp Synchronization, list Town Hall).

**Source:** the DGS-159 and DGS-161 progress comments. The maestro asked for a yes before each one. Jack: "for 159 ... do it automatically
from now on." No existing backlog item covers it: `clickup-ticket-writeback-i1-analog.md` is the consumer-repo write-back through
`generate-comment` (a skill for a repo that tracks tickets in ClickUp), not the maestro reporting on its own work.

## The rule (decided, Jack, 2026-10-04)

- **For DGS-159, the maestro posts the ClickUp progress comment itself, without asking, from now on.** When a part merges, or a part is done,
  the maestro writes one comment on the ticket: what merged (the range, the commits, the plugin version), the tests, the decisions made, what
  is next, and what was spun out. Times in UTC+7 with UTC in brackets. No AI attribution. The two comments already posted are the model:
  DGS-161 (`1301150000057741`) and DGS-159 (`1301150000057742` and `1301150000057856`).
- **Still asked, until Jack says otherwise:** a status change (including `done`) on DGS-159, and comments on any other ticket. The
  automatic ticket creation and description sync (DGS-163) are separate and already automatic.

## To build

1. **A durable command.** The `dg` ClickUp CLI has no add-comment command. Today the maestro writes a one-off script, posts, and deletes it
   (it uses the client's own credential loader and never reads a token). Add `dg clickup add-comment --task <id> --file <path>` (or
   `--text`), with tests, so the step is one safe command.
2. **A comment template** in the repo (the model above), so every progress comment has the same shape.
3. **A trigger in the maestro's post-merge procedure:** after the post-finish hooks succeed, post the comment. This belongs next to the other
   post-merge steps (verify, reload, close the worker, update the tables).

## Generalizing (open)

- **Which tickets, and which events.** Every ticket the maestro works? Merge, checkpoint, blocked? Too many comments are noise.
- **It is a permission.** Under the autonomy model (DGS-176, the Master-written policy, default deny), "post a progress comment on a ticket in
  this project's tracker" becomes a line in the policy. DGS-159 is the first entry.
- **Status changes** (`in progress`, `done`): automatic or the Master's call? Jack has so far said yes ticket by ticket.
- **ClickUp only,** or JIRA too for a `ticket: true` project (`jira-progress-write-back` already does that for JIRA).

## Related

[backlog-item-gets-clickup-task.md](backlog-item-gets-clickup-task.md) (DGS-163, the ticket-creation and description-sync rule),
[define-the-maestro-role.md](define-the-maestro-role.md) (DGS-176, autonomy and the policy), [clickup-ticket-writeback-i1-analog.md](clickup-ticket-writeback-i1-analog.md)
(the consumer-repo write-back), [dg-workbox-package.md](dg-workbox-package.md) (DGS-151), DGS-159, DGS-161.
