# `standards/` has no home for process/workflow rules, only code conventions

**Status:** Not applied — new idea, not yet brainstormed.

**Source:** Jack's own observation, 2026-09-17, surfaced while resuming EMKT-791
in `shopify-template-in`. A session ran `shopify theme check` mid-task; the
rule against that — "no automated JS/theme syntax validation, done manually"
— turned out to live only in Jack's personal `~/.claude/CLAUDE.md`, invisible
to DigiSmith. Jack then explicitly asked for this to be captured as a backlog
concept rather than forced into `add-standards`.

## The gap

`standards/` (`global/`, `shopify/`, `team/`, authored via
`add-standards`/`discover-standards`, delivered via `inject-standards`) only
captures conventions about what code, commits, and PRs should *look like* —
`code-comments.md`, `commit-style.md`, `pr-descriptions.md`,
`branch-naming.md`, `snippet-render-vs-include.md`, etc. `inject-standards`'
four scenarios (Conversation, Creating a Skill, Shaping/Planning, Dispatching
a Subagent) are all framed around shaping what gets *written*.

There's no equivalent home for process/workflow constraints — rules about
what *not* to do, which tools to avoid running, which steps are deliberately
skipped in favor of a manual one instead. "No automated JS/theme syntax
validation — verification is done by hand" is a real, load-bearing rule for
every Emma Shopify theme repo, but today it only exists as a bullet in Jack's
personal CLAUDE.md — invisible to DigiSmith itself and to any subagent
DigiSmith dispatches.

## Why this might matter

Forcing a rule like this into `add-standards` would misuse the mechanism —
it's not a style convention an implementer should match when writing code,
it's a constraint on which actions are allowed at all. Without a distinct
concept, either:

- it gets shoehorned into `standards/`, where `inject-standards`'s scenarios
  don't fit it well, or
- it stays CLAUDE.md-only, where a DigiSmith-dispatched subagent (which
  doesn't necessarily inherit Jack's personal global CLAUDE.md the way the
  main session does) can silently violate it.

This is exactly what happened live: mid-EMKT-791, a syntax-check tool got run
despite the rule already being documented — just not documented anywhere
DigiSmith-aware.

## Where this would land, not yet decided

Possibly a sibling `rulesets/` directory next to `standards/`, with its own
authoring skill (or a `kind: ruleset` flag added to `add-standards` instead of
a wholly separate skill) and its own injection trigger(s) — likely different
from `inject-standards`'s scenarios, since these are "here's what's
forbidden/gated in this repo" rather than "match this style."

Enforcement is a separate question from documentation: a captured ruleset
could just be informational (injected as context, trusted to be followed) or
could drive actual `.claude/settings.json` permission denies via
`update-config` — the ruleset file as the human-readable source of truth,
settings.json as the enforced consequence. Not scoped: whether one mechanism
should do both, or whether "documented" and "enforced" are two separate
backlog items entirely.
