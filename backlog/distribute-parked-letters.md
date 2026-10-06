# Distribute the parked legacy letters B, C, D and E to their clans

**Status:** Idea, Jack's call (2026-10-06 UTC+7). Decided placement, no work done. ClickUp: **DGS-188** (Town Hall, task id `14zcebrv058`, created 2026-10-06 UTC+7).

**Source:** the DGS-186 inventory (clan F: Scripture, checkpoint 1). Four legacy letters share a character with a ClickUp clan that now means
something else, so they cannot map to the clan of the same character. Jack decided on 2026-10-06: letters B, C and D are folded into the newer
clans and parked in a future placeholder clan (Jack called it "T"; T was the old Voice letter, DGS-45, so the name needs a check), to be
distributed to the right clan later. Letter E (the spine) goes to clan A: System. His Clan Backfill subtasks DGS-27 to DGS-30 were closed as merged
into this ticket.

## The letters

| Letter | What it was | State | Goes to |
|---|---|---|---|
| B | Spec seam | never built | placeholder clan, then the right clan (its content fits design and planning in clan F: Scripture) |
| C | Live work journal | never built (intent in `MEMORY.md`) | placeholder clan, then the right clan |
| D | Delivery | never built | placeholder clan, then the right clan |
| E | The spine: E.1 `digismith:init` (shipped 2026-08-07), E.1-amend `adopt` (2026-08-16), E.2 stage-order enforcement (not started) | partly shipped | clan A: System (lineage open, probably A.0 Pavilion for E.2) |

## To do

1. Name the placeholder clan (not "T" unless Jack confirms) and decide whether it is a ClickUp folder or only a list.
2. Create one ticket per sub-item, with its real ship date and docs, in its destination. E.1 and E.1-amend are shipped: dates 2026-08-07 and
   2026-08-16, docs `.digismith/docs/using-digismith/` and `.digismith/docs/digismith-init/`.
3. Do not attach `.digismith/docs/B/`, `docs/D/D.3/`, `docs/E/E.3/` or `docs/E/E.4/`: those belong to clans B, D and E, not to the legacy letters.

## Related

DGS-186 (clan F: Scripture), DGS-25 (Clan Backfill), DGS-27 to DGS-30 (closed, merged here), DGS-187 (living history), `scripture-clan.md`, `platform-clan.md`.
