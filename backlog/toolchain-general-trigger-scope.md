# Toolchain defaults: trigger scope beyond brainstorming

**Status:** Deferred. Map item **G.2** (Toolchain, part of **G** "Structure" — formerly its own
letter, **U**, until the 2026-09-11 merge) ships with its consult mechanism scoped
to `digismith:brainstorming`'s "Ask clarifying questions" step only. This file captures the
broader version, deliberately not folded into G.2's initial design.

**Source:** Raised 2026-09-08 by a concurrent session (working map item **X**, persistent
VPS-hosted Claude Code session) mid-live Hetzner VPS setup. Two tooling corrections happened —
pnpm preferred over npm for global CLI installs, and nvm preferred over a distro-packaged Node
install — on a task with zero connection to `digismith:brainstorming` or DigiSmith self-development
generally. The session's own observation: since both corrections came on a task that had nothing to
do with brainstorming, the underlying preference isn't brainstorming-specific — it should apply any
time a session is making a tooling choice, full stop.

## Why this didn't get folded into G.2 directly

Presented to Jack during G.2's brainstorm (then still its own letter, U) as one of three options
(keep brainstorming-only, widen to DigiSmith's other choice-points, or go fully general/always-on). Jack chose brainstorming-only for
the initial ship, same split pattern as **I.2**/**S**/**R** peeling off from a parent letter rather
than scope-creeping the parent's own spec.

## What a wider version would need

- Somewhere for the check to live that isn't gated behind a single skill's own step — candidates
  range from wiring the same `digismith:toolchain list` check into other specific choice-points
  DigiSmith already has (`digismith:offload-implementer`'s runner/provider dispatch,
  `subagent-driven-development`'s task briefs — mirrors how `digismith:inject-standards` covers four
  separate scenarios for map item **G**) up to a fully general, always-on nudge that surfaces
  regardless of which skill (if any) is active — closer to a global-instructions-style reminder than
  a skill-gated mechanism, and the hardest of the three to bound and enforce reliably.
- Whichever shape is picked, it reuses **G.2**'s existing storage (`toolchain.yml`) and skill
  (`digismith:toolchain`) as-is — this is purely a question of *where else* the consult happens, not
  a new data model.

## Why not applied yet

Single-session observation from one VPS setup, folded into G.2's design doc as a documented
scope decision rather than acted on. Revisit once the brainstorming-only version has actually
missed a real tooling choice again outside of brainstorming — not preemptively.

See `.digismith/docs/toolchain/design.html` (Out of Scope section) for how G.2's own design frames
this deferral.
