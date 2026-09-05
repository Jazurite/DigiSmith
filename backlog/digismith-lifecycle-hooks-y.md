# DigiSmith lifecycle hooks (new letter, tentatively Y)

**Status:** Idea only, not brainstormed. Captured verbatim per Jack's request — a dedicated
future session will brainstorm this properly, not this one.

**Map item:** **Y** — the next actually-unclaimed letter alphabetically (T, U, X, and Z are
already tentatively claimed by other backlog ideas; see `backlog/README.md`).

**Source:** 2026-09-05, surfaced mid-brainstorm for **W.4.1** (auto version-bump on
`finishing-a-development-branch`'s Option 1). Jack's own framing: "This is similar to any open
source or software library that we need to like custom hook" — WordPress actions/filters,
webpack's tapable hooks, git hooks, and npm lifecycle scripts (`postinstall`, `prepublish`) are
all the same shape.

## The idea

A general lifecycle-hook mechanism for DigiSmith itself: specific points in its own SDLC
pipeline (e.g. post-brainstorm-approval, post-plan-approval, post-finish) each fire a hook that
can run either a **stock** hook (a behavior DigiSmith ships built-in) or a **custom** hook (Jack's
own registered instructions/script for that point, per-repo or per-profile). W.4.1's version-bump
would become the first stock hook, registered at "post-finish," instead of being wired directly
into `finishing-a-development-branch`'s own body the way it actually shipped.

## Why this didn't get folded into W.4.1

Assessed live during W.4.1's own brainstorm: building a general stock/custom hook registry across
multiple lifecycle points to serve exactly one concrete use case (the version bump) is the kind
of premature abstraction `digismith:brainstorming`'s own rules warn against ("YAGNI ruthlessly").
W.4.1 shipped as the narrow, direct fix instead — see `MEMORY.md`'s **W** row. Jack's call:
capture the general concept here, reserve the letter, and give it a fully dedicated future
session rather than a mid-conversation pivot.

## Open questions, not yet scoped

- Which lifecycle points actually need a hook? Post-finish (this item's origin) is the only
  concrete one so far — post-brainstorm-approval, post-plan-approval, pre-merge, and others are
  speculative until a second real use case shows up.
- What does a "custom hook" actually look like mechanically — a script path DigiSmith shells out
  to, a markdown file of instructions a skill reads and follows, a small TS module with a known
  export signature? Each implies a very different config/registry shape.
- Where would the registry/config live — a new `.digismith/hooks/` convention (profile-scoped,
  matching `profiles/*.yml`), or something inside `MEMORY.md`/`vendored/PROVENANCE.md`'s existing
  documentation style?
- Does every vendored/activated primitive need to know how to fire hooks, or does a small shared
  helper (in the style of `scripts/check_vendored_skills.ts`'s own self-contained scripts) do the
  firing on their behalf, keeping the primitives themselves hook-agnostic?
- Stock hooks ship as part of DigiSmith itself (this repo) — do custom hooks ever need to be
  *shared* across repos/profiles, or are they always local to one project?

## Why not applied yet

Idea only, captured verbatim rather than brainstormed, per Jack's explicit request mid-W.4.1.
Depends on there being a second real lifecycle-hook use case before the general mechanism can be
designed with any confidence — same reasoning as **Z**'s own "why not applied yet." A dedicated
future session should brainstorm this from scratch rather than resuming here.
