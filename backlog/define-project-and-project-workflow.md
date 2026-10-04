# Define a project and the project workflow

**Status:** Design decided by Jack (2026-10-04 12:16 UTC+7 [05:16Z]): "absolutely spot on about your project definition; one more thing is that one
project can only have one maestro." Raised 11:27 UTC+7: "I think we should have one maestro for a project. Do we have a project workflow? What
defines a project?" ClickUp: **DGS-172** (list E.4: Workflows, created 2026-10-04 11:27 UTC+7 [04:27Z], task id `14zcebruqtp`).

**Source:** the DGS-170 brainstorm (the new maestro role). Jack first said the maestro count should not be one for the system, nor one per
client or repo, and that the Operator decides it. After the question "what is a maestro's unit?", he settled on **one maestro per
project**. That needs a definition of "project", and the repo has none. It **unblocks DGS-176** (the Maestro role).

## What exists today (checked 2026-10-04)

- **A project as practiced today** (Jack, 2026-10-04): a name, a Git repository (or a vault) and a dedicated herdr session, with a Desktop
  maestro of the same name. Written up in DGS-173 (`backlog/document-the-current-project-workflow.md`), an input to this item. The profile
  bullet below is only part of it.
- **A ticket workflow, not a project workflow.** `init` to `bootstrap` or `adopt`, then `brainstorming`, `writing-plans`, execution,
  `finishing-a-development-branch`, and the handoff. It runs per ticket.
- **An informal maestro playbook**, in the untracked Workbox runbook and in the maestro's memory: brief a worker, answer at checkpoints,
  order the merge with the post-finish hooks, close the worker, update the tables. Nothing writes the project level down.
- **ClickUp's structure** (clan folders, lineage lists). The convention (DGS-158) stopped using clan and lineage letters in the repo.
  ClickUp keeps them. They are an index, not a project.
- **Profiles** (`profiles/digismith.yml`, `emma.yml`, `jazurite.yml`, `personal.yml`): per-repo or per-client rules (`ticket`, `standards`,
  `reporting`, offload provider). The only project-like object we have, but it is defined by a repo or a client, which Jack ruled out as
  the unit.
- **De facto projects.** The ticket-based naming work is one: DGS-158, DGS-159 (six parts) and the tickets spun out of it (DGS-164 to
  DGS-166). So are Flux (DGS-154) and the plugin refresh (DGS-161, DGS-162). None has a parent ticket, a note or an end condition. DGS-159
  stands in as the parent today.

## The project (decided, Jack, 2026-10-04)

A **project** is the long-lived thing, not a goal with an end: `DigiSmith`, `Emma`, `Soveron`. It has:

1. **A name and its places.** One or more Git repositories or vaults. `Emma` already spans many repos in one herdr session. A repo belongs to
   exactly one project.
2. **One tracker,** named by the project: ClickUp (DGS keys) or JIRA (EMKT keys). It is today's `ticket:` setting in the profile.
3. **A dedicated herdr session** named after the project, holding its worker workspaces and shells.
4. **Exactly one maestro. A project can only have one maestro** (Jack). The start command refuses to start a second one. A reset or a
   renewal restarts the same maestro (its note and state), never a second.

- **Who ends a project:** the Master, by a `dg` command that stops it and archives its notes. Nothing ends automatically.
- **Goals are parent tickets inside a project,** not projects. "Ticket-based naming" is a goal in the DigiSmith project: a parent ticket
  with children (DGS-158, DGS-159 and its parts, DGS-164 to DGS-166). It ends. It does not get a maestro.
- **ClickUp's clans (A to E, O)** are areas inside the DigiSmith project: an index, not projects.
- **A registry records every project:** one machine-wide file (for example `~/.digismith-depot/projects.yml`) with the name, its places, the
  tracker, the profile, the herdr session and the maestro. The `dg` start command reads it, and enforces one maestro per project. Because
  every ticket belongs to exactly one project, and a project has one maestro, no two maestros can brief a worker for the same ticket.
  What the projects still share is VPS-wide: the Claude seats, the memory, the roster of workers (DGS-151 `dg workbox`).
- **Vocabulary:** **project** (long-lived) and **goal** (a parent ticket). Whether the Methodology list (DGS-156) types a project workflow as
  a Process is left to that list.

## The project workflow (as it will be)

1. The Master decides a project exists and runs the `dg` command with its name, places and tracker. The registry gets the entry.
2. The command creates the herdr session named after the project, starts its one maestro with a project brief, and records the maestro.
3. The maestro works the project's tickets with the existing ticket workflow: workers in workspaces of that herdr session, one per ticket.
4. A goal is a parent ticket the maestro splits into child tickets and works to its end.
5. The Master stops the project with a command: the maestro's final note is archived, the herdr session is closed.

## What changes in the repo

- A registry file and its `dg` commands (start, stop, list): part of `dg workbox` (DGS-151) or a sibling. Not built yet.
- Today's three projects are written into the registry first: `DigiSmith`, `Emma`, `Soveron` (DGS-173 lists their places).
- The profile stays per repo. The registry says which profile a repo uses.

## Log of Jack's statements (kept for the record)

- 11:27: "I think we should have one maestro for a project. Do we have a project workflow? What defines a project?"
- 11:3x: "The current workflow for a project is: you have a name, like DigiSmith, or a Git repository, and a dedicated herdr session."
- 12:16: "You're absolutely spot on about your project definition; one more thing is that one project can only have one maestro."
  (The five defaults he confirmed: a project is the long-lived thing; it can span repos; the tracker is named by the project; the Master ends
  it by a command; it is recorded in one registry.)

## Related

[document-the-current-project-workflow.md](document-the-current-project-workflow.md) (DGS-173, an input), [brainstorm-the-new-maestro-role.md](brainstorm-the-new-maestro-role.md) (DGS-170, done),
[maestro-in-herdr.md](maestro-in-herdr.md) (DGS-169), [worker-and-maestro-conventions.md](worker-and-maestro-conventions.md) (DGS-158),
[maestro-merges-worker-material.md](maestro-merges-worker-material.md) (DGS-160), DGS-154 Flux, DGS-156.
