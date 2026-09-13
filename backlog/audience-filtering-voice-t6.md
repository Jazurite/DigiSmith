# Audience-filtering content-voice skill (T.6)

**Status:** Not applied. Raw idea only, no design spec yet — needs `digismith:brainstorming`
before becoming a skill. A small, tangled numbering history worth spelling out exactly, all on
2026-09-13: this item started as a tentative standalone letter, **T** → got folded in as **G.3.6**
once "G.3" broadened from "ASD-STE100 Writing Standard" into "AI Voice" (a general umbrella for
how DigiSmith-generated content and conversation should read), recognized as a sibling facet —
audience-filtering for non-engineer readers — alongside G.3.1 (artifact sentence-level clarity,
engineer/agent readers) and G.3.5 (live-conversation response shape) → then, later the same day,
"G.3" itself promoted out of `G` into its own top-level letter — and landed back on **T**, the
same letter this item started with, now for an unrelated reason (it's the *lineage's* letter, not
this item's own). Net effect: this item ends up as **T.6**, alongside **T.1** (artifact voice) and
**T.5** (conversational voice, adapted from `ayghri/i-have-adhd`).

**Source:** Surfaced during an EMKT-756 (cross-sell component) session.
Two separate moments exposed the same gap:

1. Drafting Confluence documentation (the "Above the Fold PDP" guide's
   Cross-sell section) for webshop owners — had to consciously avoid
   dev terms and write plain click-path instructions instead.
2. Drafting an `I.1` (`digismith:jira-progress-write-back`) progress
   comment for EMKT-756 — the first draft leaked git/PR mechanics
   ("opened a new PR for hub... needed a fresh branch since the
   original PR was already merged") that a PO/PM/website-owner reader
   has no use for, and that an engineer would just read off the PR
   directly anyway.

## What this covers

A reusable content-voice skill: identify the actual reader for a given
piece of writing and write only what that reader needs.

- For a JIRA progress-update comment (`I.1`'s consumer): the audience
  is PO/PM/website-owner. Frame "what's done" as stakeholder-visible
  outcomes and feedback addressed — never implementation/git internals
  (branches, PR reuse vs. fresh, commit mechanics, file paths).
  Engineers get that detail from the PR/code itself.
- **Concrete rule found during the same session's second draft round**:
  don't mention a repo/PR by name at all unless it changes something
  the business audience directly interacts with (e.g. a Storybook
  instance they're asked to review). A same-day second draft still
  included a "hub's fix: PR #85" bullet — cut per direct feedback,
  since hub has no Storybook-visible change here and a PR link with no
  reader-facing effect is exactly the kind of engineer-only mechanic
  this skill exists to strip.
- For webshop-owner-facing documentation (Confluence-style guides):
  plain click-path instructions, no dev jargon, field names only where
  needed to locate something in Admin — this is already the *de facto*
  standard for docs like the "Above the Fold PDP" guide, just never
  captured as a named, reusable skill.

## Why a separate skill, not folded into `I.1`

`I.1` should stay focused on its own job: ADF structure, comment
matching by date, description-splicing mechanics. Prose-voice/tone
rules are a cross-cutting concern that other consumers (documentation
writing, PR descriptions, etc.) need too — better shared once than
duplicated per-skill.

## Suggested shape

- A skill (or a shared reference doc other skills load) that, given a
  target audience, filters/reframes drafted content: strip
  implementation mechanics for a business audience, strip narrative
  filler for a developer audience.
- `I.1` would call into it when drafting "What's done" / "Next Steps"
  bullets.
- Documentation-writing work (currently ad hoc, no formal DigiSmith
  skill at all) would be a second consumer.

## Why not applied yet

Single-session observation, not yet run through `digismith:brainstorming` on its own terms —
raised and scoped only as a comparison point while T.5 was being designed. `T` (and T.6's slot
under it) is now formally committed in `MEMORY.md`'s map table, so this item is unblocked
map-wise; it just hasn't had its own real brainstorm yet.
