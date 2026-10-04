# Every new backlog item gets its ClickUp task automatically

**Status:** Idea, Jack's call (2026-10-04 10:2x UTC+7 [03:2xZ]). Jack had to say "yep create the ticket" after the maestro wrote a
backlog item and asked. His rule: "You should know it and do it automatically next time, another backlog for E clan." And: "the action
that you should automatically create a ClickUp task for backlog item goes to E clan". No design yet. ClickUp: **DGS-163** (list E.4: Workflows, clan E: Methodology,
Kind: Procedure; created 2026-10-04 10:16 UTC+7 [03:16Z], task id `14zcebruqrz`, without asking, by its own rule).

**Source:** the `reload-plugins` item (DGS-162), 2026-10-04. The maestro wrote `backlog/reload-plugins-after-merge.md`, then asked Jack for a
yes before creating its ClickUp ticket. "No ticket, no work" already says every idea gets a ticket, so the question was one step too many.

## The rule (Jack, 2026-10-04)

When the maestro (or any session) adds a backlog item, it creates the matching ClickUp task in the same step, without asking:

1. Pick the list by the item's area. Clan E (Methodology) items go in E.0 to E.4. Hooks and lifecycle go in A.3. Use the existing list
   that fits, never a new clan or list without Jack.
2. Create the task with the item's title, a short description (the status line, the source, the scope), status `backlog`, and a pointer
   to the repo file.
3. Read the new key back (`custom_id`, for example `DGS-162`) and write it into the item's status line and into the `backlog/README.md`
   index line. Commit the two files and push.
4. Tell Jack the key and the list in the next message. He can move or discard the ticket. Nothing is hard-deleted.

This covers creating the task for a new backlog item. It does not cover other ClickUp writes (a status change, a progress comment, a
rename, a move). Those still need Jack's yes for each write, and a ticket is never hard-deleted.

## Where the knowledge must live

A cleared maestro knows only what it reads. So the rule has to be in:

- the maestro's memory (a feedback note, written 2026-10-04);
- the backlog README header, one line, so any session that adds an item sees it;
- ideally the tooling: a script or `dg` command that writes the backlog file, creates the ClickUp task, reads the key back and updates
  both lines (`dg backlog add`). The CLI has no add-comment command today, and `dg clickup create-task` exists.

## Open questions

- A `dg backlog add` command, or a skill, so the steps do not depend on the maestro remembering them?
- The mapping from an item's area to a ClickUp list, written once (a table in the README).
- Does a worker that finds an item create the task too, or does it hand the item to the maestro? Today only the maestro posts to ClickUp.
- A guard: a check (a hook or a CI step) that fails when a `backlog/` file has no ticket key in its status line.

## Related

[reload-plugins-after-merge.md](reload-plugins-after-merge.md) (DGS-162), [convert-backlog-files-to-tickets.md](convert-backlog-files-to-tickets.md),
[worker-and-maestro-conventions.md](worker-and-maestro-conventions.md) (DGS-158, "no ticket, no work"),
[dg-workbox-package.md](dg-workbox-package.md) (DGS-151).
