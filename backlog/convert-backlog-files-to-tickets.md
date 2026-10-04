# Convert every `backlog/` file into a ClickUp ticket, then move the content to the board

**Status:** Idea, Jack's call (2026-10-04, answering the DGS-159 split, Part 7): "All but that's another backlog ticket." No design yet.
ClickUp: **DGS-165** (list E.3: Conventions, created 2026-10-04 10:16 UTC+7 [03:16Z], task id `14zcebruqt1`).

**Source:** DGS-159 (ticket-based naming: modify the code and move the files), Part 7. "No ticket, no work": every idea gets a ticket
first, so the `backlog/` files become tickets. DGS-159 does not do this part.

## Scope

- All the `backlog/*.md` files (92 on 2026-10-04, with `backlog/README.md` as the index). Each file becomes a ClickUp ticket, and its
  content moves to `.digismith/board/<KEY>—<slug>/`.
- Many files already have a key (DGS-146, DGS-147, DGS-151, DGS-153, DGS-158 to DGS-162 and others). They keep it. The rest get one.
- The README index then points at the board, or goes away. The README says "delete an item's file once it's been applied": decide what
  that means for the board.

## Constraints

- A ClickUp write needs Jack's yes for that write. About 90 writes need a rule Jack approves once, for example: create the tickets in
  batches he has seen listed. Never hard-delete a ticket.
- DGS-147 and DGS-149 stay for reuse (do not archive).
- Move the content with `git mv`. Delete no content without Jack's ok.

## Open questions

- Which ClickUp list each item goes in (the lists keep their clan names), and who decides.
- The batch rule for approving about 90 ticket creations.
- Duplicates and stale items: merge or discard, never delete (the stale-ticket rule).
- Who does the work: a worker per batch, with the maestro posting.

## Related

[backfill-tickets-for-historical-docs.md](backfill-tickets-for-historical-docs.md), [worker-and-maestro-conventions.md](worker-and-maestro-conventions.md)
(DGS-158), DGS-159, `backlog/README.md`.
