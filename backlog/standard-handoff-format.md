# Standardized session handoff document format (no letter yet)

**Status:** Not applied. Raw idea only — no map letter, no design spec,
needs `superpowers:brainstorming` before becoming a skill/convention.

**Source:** Surfaced live 2026-09-09 while building map item **Q**
("Templating"). Four differently-structured handoff documents/messages
exist from this short a window alone, with no shared template:

1. `HANDOFF-2026-09-05-B.md` — sections: Shipped this session / In-flight,
   safe to stop here / Known live conditions to check before resuming /
   Resume steps.
2. `HANDOFF-2026-09-05-kimi-k3-session.md` — sections: Shipped this
   session / Loose ends, none blocking / To resume.
3. A cross-session message from a peer session mid-Q-work — sections:
   Why Q exists / Scope split / Design decisions already settled / The
   three Q.1 templates / Q.2 consumer changes, concretely / Prior art —
   what NOT to treat as authoritative / Bookkeeping this needs. Strong on
   design rationale and prior-art pointers, but **no explicit resume
   command, no reference to a ledger or any concrete "what's actually
   done vs. not" status** — a receiving session has to reconstruct
   current state from git history itself.
4. `HANDOFF-2026-09-09-Q-build.md` (this session, mid-SDD-build,
   stopped because the user hit a usage limit) — sections: Where this
   fits / Task status (against the SDD ledger, with an exact resume
   point named) / Ledger / Mechanical-tier offload note / Also flagged,
   not part of this build / To resume (literal `cd` + re-invoke
   commands).

Jack noted directly that another session's handoff didn't match this
session's format and should have.

## What this covers

A single, reusable structure that any DigiSmith session uses when
writing a handoff — whether a scratch `HANDOFF-*.md` root file, a
cross-session message via `SendMessage`, or (once **P**/telemetry or a
future **C**-adjacent journal covers it) something more structured.
Goal: a receiving session (a fresh one, or the same session resumed
later) can act immediately without reconstructing state from git log,
guessing what's actually done, or asking clarifying questions the
handoff should have already answered.

**Candidate required sections**, drawn from what example 4 above got
right and 1-3 partially missed:

- **Where this fits** — map item(s), links to the relevant design.html/
  plan.md, the branch/worktree path.
- **Status per unit of work** (task, sub-item, whatever the work's own
  granularity is) — not prose summary, an explicit done/in-progress/
  not-started per item, cross-checked against whatever ledger or
  progress file already exists for that work (e.g. an SDD plan's own
  `.superpowers/sdd/<plan>/progress.md`) rather than restated from
  memory.
- **Exact resume point** — the next concrete action, named precisely
  enough that a cold session doesn't have to infer it (e.g. "dispatch
  the scoped re-review for Task 2's fix round 1, FIX_BASE = `<sha>`" —
  not "continue the build").
- **Anything flagged but deliberately out of scope** — a spawned
  background task, a deferred backlog note, a bug found in passing —
  named with its own tracking id/link so it isn't silently lost.
- **Literal resume commands** — the actual `cd`/skill-invocation a
  session would run, not just a description of what to do.

## Why not folded into an existing map item

**C** ("Live work journal") is adjacent but distinct — it's a per-ticket
working-notes artifact feeding a separate `2. Career/` tracking system,
not a session-to-session AI handoff format. **P** (Telemetry) captures
full session transcripts, which is a different granularity (everything,
raw) than a deliberately curated handoff. Neither currently defines a
structure a session should follow when writing a handoff by hand.

## Suggested shape

Not yet designed — options range from a lightweight documented
convention (a section in `MEMORY.md`'s own "Structure" notes, or a
short template file sessions are told to copy) up to an actual skill
(`digismith:write-handoff` or similar) that assembles the sections
above automatically from whatever ledger/plan/design-doc context is
available in the current session, the same way `report-implementation`
(**N**) assembles a report from a completed SDD plan's own artifacts.

## Why not applied yet

Single-session observation (though evidenced by 4 real documents), not
yet run through `superpowers:brainstorming`. No map letter suggested —
genuinely unclear whether this is its own letter, a **C** extension, or
just a documented convention with no skill at all.
