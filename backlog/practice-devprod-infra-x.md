# Practice-grade dev/prod infrastructure: relocate Agentic Bridge to the VPS, with real auth and eventually CI/CD (new letter, tentatively X)

**Status:** Idea only. Explicitly NOT a DigiSmith functional requirement — deliberately
captured as a skill-building/practice goal, not a response to an actual problem DigiSmith
has today. No design, no `superpowers:brainstorming` pass yet.

**Source:** 2026-09-11, surfaced mid-brainstorm on map item **V.3** (VPS-connect CLI,
`.digismith/docs/vps-session/design.html`). Jack's own framing, confirmed directly when
asked: "practicing professional infra as a skill/habit," explicitly not because DigiSmith
needs it, not because of an anticipated multi-user future.

**Letter note:** `X` was originally reserved for "persistent VPS-hosted session"
(`backlog/vps-session-hosting-x.md`), but that idea folded into **V.3** instead of becoming
its own letter — freeing `X` for reuse here, same precedent as letters **Q** and **R** being
freed and later reused. Thematically adjacent (also VPS-related), which is a coincidence
worth naming, not a reason the two ideas should be designed together — see below.

## What this covers

The vision, in Jack's own words: "a real development/professional development
infrastructure — a local server and a production server, and in the future a CI/CD pipeline
to deploy things." Concretely, as first proposed: relocate the Agentic Bridge (map item
**K.9**, currently a local-only HTTP proxy bound to `127.0.0.1`, managed by Depot's **V.2**)
to run on the VPS instead of on whichever local machine is active — Depot's local role for
that resource would shift from "spawn and manage a local process" to "call an API on the VPS
and return the result." Eventually, a real deploy pipeline for pushing changes to whatever
ends up running server-side.

## Why this was deliberately NOT folded into V.3

V.3 solves an actual, current need (connect to the VPS session you already set up by hand).
This is a different kind of goal — legitimate, but not something DigiSmith itself needs
functionally, and bundling it risked scope creep into V.3's much smaller, already-well-defined
design. Explicitly split apart mid-brainstorm rather than designed together; see that
session's transcript around 2026-09-11 for the full reasoning, including the initial
"required for production" framing that got walked back once the actual motivation
(practice, not necessity) was named directly.

## The real, non-negotiable constraint regardless of motivation

If the Agentic Bridge (or anything else currently `127.0.0.1`-only) ever actually runs on a
network-reachable VPS, it needs **real authentication** — an unauthenticated service exposed
to the internet is a genuine security risk independent of whether the underlying motivation
is "production" or "practice." Any future design here must treat this as a hard requirement,
not an afterthought.

## Open questions, not yet scoped

- What "local server / production server" actually means in DigiSmith's single-user context
  — there's no second real environment or second real user to separate from. Worth resolving
  explicitly before designing anything: is "local" just "whichever machine Jack's Claude Code
  session happens to be running on," and "production" just "the VPS"? Or something else?
- Which resources (just the Agentic Bridge, or eventually the OpenCode server too, or others)
  would actually move server-side, and which stay local-only.
- Auth mechanism for the network-exposed service(s) — not designed at all yet.
- What "CI/CD pipeline to deploy things" concretely deploys, how it's triggered, and whether
  it fits DigiSmith's existing `post-finish` lifecycle-hook mechanism (map item **Y**) rather
  than inventing a separate deploy mechanism from scratch.
- Whether this belongs under **V** (Depot, since it's about Depot-managed resources moving
  server-side) as a further sub-item once V.3 ships, or is different enough in kind (practice
  infra vs. functional resource provisioning) to deserve its own letter after all — genuinely
  undecided, `X` above is a placeholder, not a commitment.

## Why not applied yet

Deliberately deferred mid-brainstorm rather than designed under an unrelated task's momentum,
same disposition as most of this backlog. Needs its own dedicated `superpowers:brainstorming`
pass, starting from "what does dev/prod separation actually mean for a tool with one user and
no deploy target other than personal infra" rather than assuming the standard SaaS framing
applies as-is.
