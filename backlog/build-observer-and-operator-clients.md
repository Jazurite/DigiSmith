# Build the Observer and Operator clients for a project's maestro

**Status:** Idea, Jack's call (2026-10-04 11:30 UTC+7 [04:30Z], by voice, so some words are my reading): "Each project will have one maestro ...
a butler to manage our project for the end user, and the end user just uses an Operator or an Observer. Then we should write some of
them for this: to observe what the butler is doing and why, and to give it orders. The butler holds all the information, the state."
No design yet. ClickUp: **DGS-174** (list C.1: Workbox, created 2026-10-04 11:30 UTC+7 [04:30Z], task id `14zcebruqtt`).

**Source:** the DGS-170 brainstorm (the new maestro role). Jack's picture: one maestro per project acts as the project's **butler**. The
end user never talks to workers. They use a client: an **Observer** (watch) or an **Operator** (give orders). The butler holds all
state. **Blocked by DGS-170** (the roles must be defined first), and it needs the project defined (DGS-172).

## What the clients are for

- **Observer (read-only).** Shows what the maestro is doing now **and why**: the current focus, the roster of workers and their status, what
  each is waiting on, the questions that wait for the end user, the orders given and the decisions made (with the reason), and what is
  next. It never types, so it cannot disturb the maestro.
- **Operator (can type).** Gives orders, answers the maestro's questions, approves or stops a step. One typist at a time (herdr allows
  one typing client per pane).
- **The end user uses only these two.** No direct talk to a worker.

## The part that makes "why" visible: the maestro's state

"The butler holds all the information, the state." Today the maestro's state is spread across prose: the handoff note
(`.digismith/sessions/<name>/note.md`), the runbook tables (untracked), ClickUp, git, memory, and the pane itself. An Observer would have
to scrape a terminal. So the maestro should publish its state in one structured place, and the clients read it:

- a state file in the session folder (the roster, the open questions for the end user, the decision log with a reason for each, the next
  steps), kept current by the maestro as it works;
- the herdr panes read through `herdr pane read`, which never types into the pane.

This state file is a requirement for DGS-170's design.

## Shapes to compare

- A terminal view (`dg observe`, `dg operate`) over SSH and herdr.
- A web page behind an SSH tunnel.
- The Claude Desktop app attached over SSH, or `opencode attach` (option B of DGS-169).
- A mix: the Observer as a page, the Operator as the chat the user already has.

A first prototype needs no new server: the Observer can be built from `herdr pane read`, the maestro's note and the runbook tables.

## Open questions

- What must the Observer show first: now, why, and what is waiting on the end user?
- How does the maestro record the "why" cheaply (one line per decision) without slowing its work?
- Who writes the state file, and does it replace the handoff note or sit beside it?
- How does an Operator take over a pane from the maestro and hand it back?
- Is this a `dg` command, a page, or both? It touches `dg workbox` (DGS-151).

The Observer role itself is defined in DGS-175 (`backlog/define-the-observer-role.md`), split out of DGS-170 on 2026-10-04.

## Related

[brainstorm-the-new-maestro-role.md](brainstorm-the-new-maestro-role.md) (DGS-170), [define-project-and-project-workflow.md](define-project-and-project-workflow.md)
(DGS-172), [document-the-current-project-workflow.md](document-the-current-project-workflow.md) (DGS-173),
[maestro-in-herdr.md](maestro-in-herdr.md) (DGS-169), [dg-workbox-package.md](dg-workbox-package.md) (DGS-151),
[workbox-idle-cleanup.md](workbox-idle-cleanup.md) (DGS-153).
