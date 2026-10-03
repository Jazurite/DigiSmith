# Rearchitect the naming conventions: ticket-based, `.digismith/board` and `.digismith/sessions` (was: conventions for the worker and the maestro)

**Status:** Idea, Jack's call (2026-10-03). No design yet. ClickUp: **DGS-158** "Ticket-based naming architecture" (list E.3:
Conventions, created 2026-10-03 21:41 UTC+7 as "Worker and maestro conventions", renamed 22:01). A worker (`dgs-158`)
brainstorms the design. Follow-up: **DGS-159** "Ticket-based naming: modify the code and move the files" (Jack, 2026-10-03 22:09 UTC+7 [15:09Z]: "158
build the convention, 159 modify the code and move the files"). It changes the skills, scripts and modules, and moves the old
`.digismith/docs/` content and the `backlog/` files to the new layout. This item is the convention only.

**Scope change (Jack, 2026-10-03 21:50 UTC+7 [14:50Z]):** "We'll rearchitect the naming conventions for everything. Remove the
clan and lineage naming conventions and migrate to a ticket-based system. Now the working files stay at `.digismith/board`.
This is where the ticket files live (design, report, ...). For maestro, worker and other sessions live under
`.digismith/sessions/`." So this item is no longer only about workers and the maestro. The clan letters, the lineage keys and
the map-item letters stop being a naming convention, and the ticket becomes the unit.

**Source:** Flux design, DGS-154 (E.4), checkpoint 2, 2026-10-03 21:30 UTC+7 [14:30Z]. Jack decided that a worker starts
from the maestro's brief only, is known by its ticket number only, and has no resume and no handoff. That left four
questions open. Jack: the names and the docs location are "another backlog for convention, now just do as you see fit",
and "focus on the backlog for convention of worker / maestro first, can circle back". The Flux design waits for him.

## Decided (Jack, 2026-10-03)

- A worker starts from the maestro's brief. It does not care about the lineage. Its identity is the ticket number
  (DGS-XXX). It has no resume and no handoff note.
- When a worker's context runs out, auto-compact is the only protection. The maestro holds all the state. If a ticket is
  too big for one worker, the maestro splits the work between workers.
- The handoff flow for a worker is removed (`finishing-a-development-branch` Step 7 must stop writing a worker handoff note
  and stop asking the clear question). The Flux build carries this clause.
- The maestro resume shows a list and asks Jack. It never continues alone. There is no check gate before the maestro clears.

## Interim rules (superseded 2026-10-03 21:50 UTC+7 by the scope change above)

The maestro's first pick was: worker names `DGS-<n> <short name>` (agent `dgs-<n>`), the docs folder named in the brief by the
nested clan convention (`.digismith/docs/<Clan>/<Clan.N>/`), and the brief as a git-excluded `brief.md` in that folder. The
worker names were replaced by Jack's decision below. The nested clan folders are dropped: the working files move to `.digismith/board/`
(ticket files) and `.digismith/sessions/` (session files).

## Direction (Jack, 2026-10-03), layout still to design

- `.digismith/board/<ticket>/` holds a ticket's working files: design, plan, report and the rest.
- `.digismith/sessions/` holds the files about sessions: the maestro, the workers and any other session. The Workbox runbook
  (`workbox.md`) already lives there.
- The ticket key comes from its tracker: DGS-nnn (ClickUp), and the EMKT-nnn style keys of JIRA.
- The folder name is the ticket key, an em dash (U+2014) with no spaces, then the title as a slug (Jack, 2026-10-03 21:59 UTC+7):
  `.digismith/board/DGS-158—ticket-based-naming-architecture/`.
- Worker names (Jack, 2026-10-03 22:07 UTC+7 [15:07Z]): session title and workspace label `<KEY> ⚚ <short name>` (the ⚚ is U+269A),
  for example `DGS-158 ⚚ Ticket-based naming`. Herdr agent name: the key in lowercase, for example `dgs-158`. Maestro sessions keep
  their names.
- Two workers on one ticket (Jack, 22:11 UTC+7 [15:11Z]): each worker writes in its own nested folder in the ticket folder,
  `.digismith/board/<KEY>—<slug>/worker-<xxx>/`. When the ticket is finished, the maestro sums and merges all the material into
  one set. Open: what `<xxx>` is, how the agent names stay unique, what the maestro does with the nested folders after the merge,
  and what happens when a second worker joins a ticket whose first worker already wrote in the ticket folder.
- ClickUp's clan folders and lists stay as they are. The change is only for the `.digismith` folder in git (Jack, 22:00 UTC+7).
- No ticket, no work: every idea gets a ticket first, so the `backlog/` files become tickets. Moving them is DGS-159.

## Open questions for the design

- A one-off worker with no ticket of its own (a comment poster, a spike): which ticket number does it carry?
- The brief template: the required sections, who writes it, tracked or excluded.
- The worker's report to the maestro: the fields the maestro needs because workers keep nothing (result, commit, comment
  ids, files, open questions).
- The maestro's own state: the shape of its note, and the shape of the list that the resume shows (candidate next tasks and
  the in-progress tickets, tasks and workers).
- Splitting a ticket that is too big: how the maestro sees it (a worker compacts twice?), and whether ClickUp subtasks are
  the unit of a split.
- Docs folders for tickets with no lineage letter, and for one-off workers.
- The limit stop: does it stay an exception that reuses the pane and the session (`--resume`)?
- The names of the maestro sessions, and one maestro for each herdr session.
- Whether a worker's brief belongs to the ticket (`board`) or to the session (`sessions`).
- What changes in the skills and scripts that read the lineage key or pick a docs folder from the map letter: the handoff skill,
  `scripts/session-init.ts`, `init`, `bootstrap`, `adopt`, `brainstorming`, `writing-plans`, `report-implementation`,
  `finishing-a-development-branch`, the `.git/info/exclude` patterns, and the unified docs convention in `MEMORY.md`.
- The Flux design (DGS-154) waits for this: its paths and the maestro's note location follow the new layout.

## Related

DGS-154 Flux (E.4, the design is on branch `flux-protocol`, not merged), DGS-157 Workbox guidelines (E.4),
[maestro-delegates-builds-to-workers.md](maestro-delegates-builds-to-workers.md) (DGS-146),
[maestro-relays-tiny-decisions.md](maestro-relays-tiny-decisions.md), [dg-workbox-package.md](dg-workbox-package.md) (DGS-151),
[docs-convention-letter-nesting.md](docs-convention-letter-nesting.md) (G.3, superseded by this item).
