# Living history: one living record of all our activity, past to future

**Status:** Idea, Jack's call (2026-10-06 UTC+7). Concept only: not designed, and Jack says the shape is not decided ("we will figure out").
ClickUp: **DGS-187** (Town Hall, task id `14zcebrv052`, created 2026-10-06 UTC+7).

**Source:** Jack, 2026-10-06, while designing clan F: Scripture (DGS-186). He had said `history.html` should migrate into ClickUp. He then changed
the plan: he has "different plans" for history. It could be a **living thing recording all our activity from the past to the future**, a living
document or a website, not a static page built from merged work.

## What we know

- Today `.digismith/history.html` is a hand-and-hook-maintained page: the post-finish hook (`update-history.ts`) adds an entry for each merged
  report, and a few entries were added by hand (2026-10-06: the C and E clans, the Y and G backfill mapping, the Agentic architectures).
- Changes made by hand in ClickUp (new clans, moved tickets, closed backfill subtasks) are not recorded by the hook, so the page falls behind.
- The record should cover the past (the legacy letters and their shipped items, dated) and the future (planned work), not only merged code.

## Decisions for Scripture (DGS-186)

`history.html` is **out of scope** for clan F's design until this concept is settled. Leave the page and its hook as they are. Do not plan its
migration into ClickUp, and do not put it in lineage .7.

## Open questions

1. The form: a living document, a website, a ClickUp view, or a generated export of several sources.
2. The sources: merged reports, ClickUp tickets and their dates, the backlog, session notes, git history.
3. Who writes it: the post-finish hook, the maestro, or an automatic sync.
4. Where it lives: the repo, ClickUp, or a published page.

## Related

DGS-186 (clan F: Scripture), DGS-164 (backfill tickets for the historical docs), DGS-25 (Clan Backfill), `.digismith/history.html`,
`.digismith/hooks/post-finish/scripts/update-history.ts`.
