# Technical writing / content-voice skill (new letter, tentatively T)

**Status:** Not applied. Raw idea only — no map letter formally added
yet, no design spec, needs `superpowers:brainstorming` before becoming
a skill.

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

Single-session observation, not yet run through
`superpowers:brainstorming`. No map letter formally reserved — `T` is
a placeholder suggested during discussion, not committed in
`MEMORY.md`'s map table yet.
