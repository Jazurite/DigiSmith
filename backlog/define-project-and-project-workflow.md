# Define a project and the project workflow

**Status:** Idea, raised by Jack (2026-10-04 11:27 UTC+7 [04:27Z]): "I think we should have one maestro for a project. Do we have a project
workflow? What defines a project?" No design yet. ClickUp: **DGS-172** (list E.4: Workflows, created 2026-10-04 11:27 UTC+7 [04:27Z], task id `14zcebruqtp`).

**Source:** the DGS-170 brainstorm (the new maestro role). Jack first said the maestro count should not be one for the system, nor one per
client or repo, and that the Operator decides it. After the question "what is a maestro's unit?", he settled on **one maestro per
project**. That needs a definition of "project", and the repo has none. **It blocks DGS-170.**

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

## A first proposal (to settle with Jack)

A **project** is a named goal with an end, identified by a parent ClickUp ticket (the ticket is the unit, "no ticket, no work"):

- the parent ticket holds the goal, the end condition and the child tickets (ClickUp subtasks or linked tickets);
- each child follows the existing ticket workflow, with its own worker;
- one maestro owns the project, keeps one note, and its docs live in the parent's board folder (`.digismith/board/<KEY>—<slug>/`);
- a project may touch several repos or clients;
- it closes when its end condition is met: a project report, the maestro's flux, the tables updated.

## A project workflow (sketch)

1. The Operator names the goal. 2. The parent ticket is created (automatically, like a backlog item). 3. A maestro starts with a project
brief. 4. The maestro splits the goal into tickets and dispatches workers (the existing ticket workflow). 5. Checkpoints, merges, and the
post-merge steps (verify, reload, close the worker). 6. Close: a project report, the maestro ends, the note is archived.

## Open questions

- Is a project always a parent ticket with children? What is the smallest project: one ticket?
- Can a project span repos and clients (an Emma feature across market theme repos, or Soveron and DigiSmith)?
- Who closes a project: the maestro, the Operator, or a rule (all children done)?
- How does a project relate to the old clans? Is a clan just a long-lived project, or an index only?
- Where does the Methodology vocabulary put the word (DGS-156 holds Process, Protocol, Procedure, Primitive)? A project workflow is likely a
  Process.

## Related

[document-the-current-project-workflow.md](document-the-current-project-workflow.md) (DGS-173, an input), [brainstorm-the-new-maestro-role.md](brainstorm-the-new-maestro-role.md) (DGS-170, blocked by this item),
[maestro-in-herdr.md](maestro-in-herdr.md) (DGS-169), [worker-and-maestro-conventions.md](worker-and-maestro-conventions.md) (DGS-158),
[maestro-merges-worker-material.md](maestro-merges-worker-material.md) (DGS-160), DGS-154 Flux, DGS-156.
