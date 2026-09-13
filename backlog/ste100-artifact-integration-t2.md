# Wire generated artifacts to the ASD-STE100 standard (T.2)

**Status:** Not applied. Deferred child of **T** ("AI Voice"), split out
2026-09-12 (as "G.3.2", renumbered 2026-09-13 when the whole lineage promoted out of `G` into its
own letter, `T`). Depends on **T.1** (the standard file itself) existing first.

## What this covers

Neither `digismith:generate-comment` (Q.1) nor `digismith:report-implementation` (N) currently
calls `digismith:inject-standards` at all — both just fill fixed templates. For T.1's standard
to actually reach PR descriptions, JIRA/Teams comments, and report prose, both skills need a new
step: consult the standard before drafting their own free-text content.

Concretely:
- `generate-comment`'s content-gathering steps (the Teams "ask line," Investigation Update's
  "what's been checked/found/needed" bullets, any free-text the templates don't already fix) need
  to draft that content following T.1's rules, not just fill placeholders verbatim.
- `report-implementation`'s `{{SUMMARY_PARAGRAPH}}` composition step (drawn from the plan's own
  `**Goal:**`/`**Architecture:**` lines, currently composed with no style discipline) is a direct,
  obvious target — it's already mechanically-composed prose, exactly what T.1 is for.
- PR descriptions themselves (written during `finishing-a-development-branch`'s Option 2) are
  arguably in scope too — worth confirming during the real brainstorm, since the global
  `CLAUDE.md` commit-style convention already governs part of this same surface for a different
  reason (avoiding AI-generated-PR flags).
- `SKILL.md` authoring — T.1's `ste100-use-cases.md` names it a real, current genre, but no
  skill currently checks `SKILL.md` prose against the standard (found during T.1's post-merge
  review, 2026-09-12). Whatever wires this should also decide how to treat the ~59 existing
  `e.g.` occurrences across 21 already-shipped `SKILL.md` files that predate the standard —
  apply going forward, not a retroactive audit, per `ste100-use-cases.md`'s own "DigiSmith fit"
  note for that genre.

## Why not applied yet

Depends on T.1 shipping first (it has — see `standards/global/ste100-*.md`). Captured here so the
integration points aren't lost, not because the idea itself is in doubt.
