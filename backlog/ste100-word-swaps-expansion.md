# Expand the ASD-STE100 word-swaps table beyond AminBlg's original list

**Status:** Not applied. Raised live during G.3.1's brainstorm (2026-09-12) as a "we could do more
than just this" aside, deliberately deferred so it doesn't block G.3.1's initial ship.

## What this covers

G.3.1 ships `standards/global/ste100-word-swaps.md` adopted whole from AminBlg/SimpleEnglish's
`references/word-swaps.md` (52 rows), unchanged. Jack's aside: that table is a reasonable starting
point, not the ceiling — DigiSmith could grow it over time with slop-word entries observed
directly in its own history (real AI-generated PR descriptions, JIRA/Teams comments, report prose)
rather than staying frozen at whatever AminBlg happened to catalog.

## Open questions for a real brainstorm

- Where do new candidate entries come from — manual, ad hoc additions when Jack notices a new
  offender live? A periodic scan of DigiSmith's own generated artifacts (PRs, comments, reports)
  for repeat phrases not yet in the table? Something else?
- Does this need any tooling (a script that flags candidate slop phrases), or is it purely an
  editorial process — someone notices a bad phrase and adds a row?
- Should the table's growth be scoped to DigiSmith's own artifacts only, or stay general-purpose
  enough to track slop from anywhere?

## Why not applied yet

Raised as an aside mid-brainstorm, not while G.3.1's own scope was under discussion. Explicitly
deferred rather than built now — G.3.1 ships the table as-is (adopted whole, no changes) and this
stays a future enhancement, likely a G.3.1 follow-up rather than a new G.3.x child.
