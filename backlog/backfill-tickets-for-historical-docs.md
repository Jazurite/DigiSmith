# Historical docs: give every `.digismith/docs/` folder a ClickUp ticket, then move it to the board

**Status:** Idea, Jack's call (2026-10-04, answering the DGS-159 split): "The historical 87 docs is for another backlog because we need to
backfill ticket for them." No design yet. ClickUp: **DGS-164** (created 2026-10-04 10:16 UTC+7 [03:16Z] in E.3: Conventions, task id `14zcebruqt0`; since 2026-10-10 ~18:2x UTC+7 a subtask of
the epic DGS-25 "Legacy Letter Backfill", list Imperium). Phase 1 (match folders to tickets, create missing ones) ordered the same day; the
move to the board waits for the link decision below.

**Decision (Jack, 2026-10-10 ~21:1x UTC+7): no bulk move.** A historical docs folder moves into `.digismith/board/<KEY>—<slug>/` only when work on
that ticket starts (the worker who picks it up moves it). Phase 1 (every item records its ticket) is done and merged (40430f5); this ticket's
"then move" part is replaced by that rule.

**Source:** DGS-159 (ticket-based naming: modify the code and move the files), Part 6. DGS-159's Part 6 is limited to the live session
files. This item takes the rest.

## Scope

- The 87 folders under `.digismith/docs/` (count from the DGS-159 worker, 2026-10-04): about 70 flat slug folders and the nested clan,
  lineage and letter folders. Each holds a design, a plan, a report or all three.
- Each folder needs a ticket key (the convention: `.digismith/board/<KEY>—<slug>/`). Many have a ClickUp ticket. Older work
  predates ClickUp and may never have had a key. Find the ticket by title and date, and create one (the maestro posts it, with Jack's yes)
  where none exists.
- Then move each folder with `git mv`, so the git history follows.

## Rule so far (Jack, 2026-10-04)

Work with no ticket key stays in `.digismith/docs/<slug>/`; the board holds keyed tickets only. So this item moves a historical folder
only once it has a key. A folder that never gets one stays where it is.

## Constraint (Jack, 2026-10-04)

What is already recorded is immutable. `.digismith/history.html` links to `docs/<slug>/design.html`, `plan.md` and `report.html`. A move
would break those links, and the history page itself must not be rewritten. Find a way that keeps the links working, for example a
redirect page per moved folder, or leaving the old path in place for any folder that `history.html` links to, or an alias file. Decide
before the first move.

## Known risk from DGS-159 Part 3

An old keyed `docs/<slug>/` ticket that is re-run through `jira-intake` Door 1 after the move to the board could leave two copies:
one in `docs/<slug>/` and one in `board/<KEY>—<slug>/`. It is only possible for a historical ticket that predates the board convention,
so the backfill and move should come before, or with, any re-run of an old ticket. Found by the Part 3 final review (2026-10-04).

## Open questions

- The link problem above: which option, and does it apply to `MEMORY.md` links too?
- How to find a ticket for a folder: by title in ClickUp, by the `ticket.md` inside the folder, or by hand.
- Which key an old pre-ClickUp folder gets, and which ClickUp list it goes in.
- Order of work: by clan, by date, or by whether `history.html` links to it.
- The six folders that hold a live `handoff.md` are Part 6 of DGS-159, not this item.

## Related

[worker-and-maestro-conventions.md](worker-and-maestro-conventions.md) (DGS-158),
[convert-backlog-files-to-tickets.md](convert-backlog-files-to-tickets.md), DGS-159, the convention design
`.digismith/docs/E/E.3/worker-maestro-conventions/design.html` (sections 6, 10 and 11).
