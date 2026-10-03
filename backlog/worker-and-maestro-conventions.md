# Conventions for the worker and the maestro (names, brief, docs location, report, list)

**Status:** Idea, Jack's call (2026-10-03). No design yet. The interim rules below are in force until a design replaces
them. ClickUp: no ticket yet. The home is list **E.3: Conventions** (doc and naming conventions, map G.3).

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

## Interim rules (the maestro's pick, 2026-10-03)

1. **Names.** A worker's Claude session title and its herdr workspace label are `DGS-<n> <short name>`, for example
   `DGS-154 Flux`. Its herdr agent name is `dgs-<n>`, with a short word added when one ticket has two workers
   (`dgs-154-comment`). The maestro sessions keep their names (`DigiSmith`, `Emma`, `Soveron`). Workers that already run keep
   their lineage-based names until they close.
2. **Docs location.** The maestro names the docs folder in the brief, by the nested convention
   (`.digismith/docs/<Clan>/<Clan.N>/`, see [docs-convention-letter-nesting.md](docs-convention-letter-nesting.md)). The worker
   writes its design, plan and report there and does not derive the folder itself.
3. **Brief.** The brief lives in that docs folder as `brief.md` (git-excluded). It names the ticket, the task, the docs
   folder, what to report, and the standing limits (never print a token, stop and tell the maestro when a call is blocked).

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

## Related

DGS-154 Flux (E.4, the design is on branch `flux-protocol`, not merged), DGS-157 Workbox guidelines (E.4),
[maestro-delegates-builds-to-workers.md](maestro-delegates-builds-to-workers.md) (DGS-146),
[maestro-relays-tiny-decisions.md](maestro-relays-tiny-decisions.md), [dg-workbox-package.md](dg-workbox-package.md) (DGS-151),
[docs-convention-letter-nesting.md](docs-convention-letter-nesting.md) (G.3).
