# Reusable Jira comment templates beyond the single fixed Progress Update shape (map item I.3)

**Status:** Not applied. Feature idea, not yet scoped. Numbered **I.3** — that slot has been
free since 2026-08-26, when the original I.3 (Figma visual regression) was split out into its
own independent letter, **S**; see `MEMORY.md`'s **S** row. Never reused since.

**Source:** Surfaced live in a separate session while working `EMKT-799` (Make.com IN
fulfillment webhook incident) in `shopify-hub` — progress-update and investigation-update
comments were drafted ad-hoc each time instead of following a consistent format. Captured
first at `.digismith/backlog/jira-comment-templates.md` in that ticket's worktree; ported
here since DigiSmith's own `backlog/` is the canonical holding pen, not a per-repo copy.

## What's confirmed

`skills/jira-progress-write-back/SKILL.md` (**I.1**) ships exactly one fixed comment
template today — the "📣 Progress Update" heading + "✅ What's done" / "Next Steps" ADF
shape (see its Step 7-9 area, around line 335). It's scoped tightly to the
ephemeral-deploy-capture flow: it also touches a "🔗 Materials & Links" description entry
and the "📦 Track" checklist's Technical Development line, both PR/deploy-centric. There's
no second template shape anywhere in the skill, and nothing generalizes the comment-drafting
step beyond this one format.

## The idea

Add reusable comment templates for the recurring Jira comment types DigiSmith posts on
tickets, so format doesn't get reinvented per-incident:

- **Progress Update** — already exists (I.1's current shape), but currently hardcoded
  rather than a named, reusable template.
- **Investigation Update** — new. Incident/bug-investigation tickets need a different
  comment shape (what's done, what's found, what's needed from whom) that doesn't map onto
  I.1's current PR-deploy-flow assumptions (there's no ephemeral URL, no Materials & Links,
  no Track checklist for a pure investigation ticket).

## Why

Tickets like incident/bug investigations repeatedly need the same kind of status comment.
A standard template keeps formatting consistent across engineers and saves re-drafting time
each occurrence.

## Where this would land

**I.3**, parallel to how **I.2** (multi-repo distribution) split off from **I.1**. Not yet
decided whether it lives inside `jira-progress-write-back` itself (a second template branch,
selected by ticket type/context) or as its own skill. No design done yet.
