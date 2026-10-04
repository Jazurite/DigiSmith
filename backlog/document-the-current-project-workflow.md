# Document the current project workflow: a name, a Git repository, a dedicated herdr session

**Status:** Idea, Jack's call (2026-10-04 11:28 UTC+7 [04:28Z], by voice): "Another backlog for the project. The current workflow for a project is:
you have a name, like DigiSmith, or a Git repository, and a dedicated herdr session." No design yet. ClickUp: **DGS-173** (list E.4: Workflows, created 2026-10-04 11:28 UTC+7 [04:28Z], task id `14zcebruqtr`).

**Source:** the DGS-172 discussion (what defines a project). Today's practice is a definition nobody wrote down. This item records it
before DGS-172 designs a different one. **It is an input to DGS-172** (and so to DGS-170 and DGS-169).

## What a project is today (checked on the VPS, 2026-10-04)

A project is three things that share a name:

1. **A name and a place.** `DigiSmith` (`/root/Workspace/Jazurite/DigiSmith`), `Emma` (repos under `/root/Workspace/Emma/`, for example
   `shopify-hub`), `Soveron` (the Obsidian vault `/root/Obsidian/Knowpolis/1. Soveron`). A Git repository, or a vault.
2. **A dedicated herdr session.** `herdr session list` shows `default`, `DigiSmith`, `Soveron` and `emma`. Each has its own folder and socket
   under `/root/.config/herdr/sessions/<name>`. The session holds that project's workspaces: one per worker (a ticket each), and plain
   shells. `herdr session` has `list`, `attach`, `stop` and `delete`; how a session is first created is to confirm.
3. **A Desktop maestro with the same name.** Since 2026-10-02: `DigiSmith` drives the herdr session `DigiSmith`, `Emma` drives `emma`,
   `Soveron` drives `Soveron` (sidebar group Workbox).

Around it: a profile (`profile:` in the repo's `.digismith/config.yml`, rules in `profiles/<name>.yml`: `ticket`, `standards`, `reporting`,
offload provider), a runbook (`.digismith/sessions/workbox.md`, untracked) and ClickUp for the tickets.

## The workflow, as practiced

1. Pick a name. 2. Have or create the Git repository (or vault) on the VPS. 3. Start a herdr session named after it. 4. Open a Desktop
maestro session with the same name in that folder. 5. The repo gets a profile (and `digismith:bootstrap` or `adopt` on the first ticket).
6. Workers start as workspaces in that herdr session, one per ticket, from the maestro's brief.

## Why write it down

- The runbook describes workers and the maestro, not how a project starts or what it is.
- `Emma` and `Soveron` were set up by hand on 2026-10-02. A new project today means repeating those steps from memory.
- DGS-172 will define a project as a goal with a parent ticket. This is the thing it replaces or extends. The difference should be known.
- A facts note for the Observer and Operator design (DGS-170): one pane has one typing client at a time ("only one attached client owns
  input and resize for a pane", herdr docs, persistence-remote). Two Operators typing collide by herdr's own rule.

## Output

A short tracked document in the ticket's board folder: the definition above, the start-up steps as commands, what a new project needs
(and what `dg workbox`, DGS-151, would automate), and a table of the three projects we have (`DigiSmith`, `Emma`, `Soveron`).

## Open questions

- How is a herdr session first created, and how is the maestro bound to it (the title only, or something else)?
- Does every project need a Git repository (Soveron is a vault)? What does `ticket: false` do for a vault?
- The `default` herdr session holds what today?

## Related

[define-project-and-project-workflow.md](define-project-and-project-workflow.md) (DGS-172, builds on this),
[brainstorm-the-new-maestro-role.md](brainstorm-the-new-maestro-role.md) (DGS-170), [maestro-in-herdr.md](maestro-in-herdr.md) (DGS-169),
[dg-workbox-package.md](dg-workbox-package.md) (DGS-151), [vps-cli-named-herdr-session.md](vps-cli-named-herdr-session.md),
[herdr-persistent-multiplexer-x.md](herdr-persistent-multiplexer-x.md), the runbook sections "Attach from any machine" and
"Control from a Claude Desktop app on any machine".
