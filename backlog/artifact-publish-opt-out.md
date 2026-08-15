# `report-implementation`'s Artifact-publish has no independent opt-out

**Status:** Not applied. Idea only.

**Source:** Jack's own observation, 2026-08-15, prompted by writing the
Enforcer (Q) plan's `report-implementation` addition (Task 3).

## The gap

Task 3 of the Enforcer (Q) plan adds an unconditional "publish
`report.html` via the `Artifact` tool" step to `report-implementation`,
gated only by the existing `reporting` profile field — the same flag that
decides whether a report gets generated at all. There's no separate
toggle for "generate the report locally, but don't publish it
externally."

## Why this might matter

A consumer repo's implementation report can contain proprietary code
snippets, client-specific business logic, or other content a profile
might reasonably want kept local-only even when reporting itself stays
on. Right now, turning `reporting: true` also means "and publish it to a
Claude.ai Artifact link," with no way to decouple the two.

## Where this would land, not yet decided

Likely a new profile field (e.g. `publish: true/false`) sitting alongside
`reporting` in `profiles/<name>.yml`, consulted by both
`report-implementation`'s new publish step and `digismith:enforcer`'s own
`design.html` publish step. Not scoped or confirmed — could also turn out
that `reporting: false` is judged sufficient on its own (skip generating
the report entirely) and this never gets built.
