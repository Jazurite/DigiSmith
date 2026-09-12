# Wire generated artifacts to the ASD-STE100 standard (G.3.2)

**Status:** Not applied. Deferred child of **G.3** ("ASD-STE100 Writing Standard"), split out
2026-09-12 once G.3 grew into a multi-part feature. Depends on **G.3.1** (the standard file
itself) existing first.

## What this covers

Neither `digismith:generate-comment` (Q.1) nor `digismith:report-implementation` (N) currently
calls `digismith:inject-standards` at all — both just fill fixed templates. For G.3.1's standard
to actually reach PR descriptions, JIRA/Teams comments, and report prose, both skills need a new
step: consult the standard before drafting their own free-text content.

Concretely:
- `generate-comment`'s content-gathering steps (the Teams "ask line," Investigation Update's
  "what's been checked/found/needed" bullets, any free-text the templates don't already fix) need
  to draft that content following G.3.1's rules, not just fill placeholders verbatim.
- `report-implementation`'s `{{SUMMARY_PARAGRAPH}}` composition step (drawn from the plan's own
  `**Goal:**`/`**Architecture:**` lines, currently composed with no style discipline) is a direct,
  obvious target — it's already mechanically-composed prose, exactly what G.3.1 is for.
- PR descriptions themselves (written during `finishing-a-development-branch`'s Option 2) are
  arguably in scope too — worth confirming during the real brainstorm, since the global
  `CLAUDE.md` commit-style convention already governs part of this same surface for a different
  reason (avoiding AI-generated-PR flags).

## Why not applied yet

Depends on G.3.1 shipping first. Captured here so the integration points aren't lost, not because
the idea itself is in doubt.
