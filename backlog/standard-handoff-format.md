# Standardized session handoff document format (no letter yet)

**Status:** The Step 7-triggered sub-case has a map letter and design spec
— see **W.12** below. The broader "any DigiSmith session, any handoff"
convention remains raw idea only, no letter of its own, still needs
`digismith:brainstorming` if pursued.

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

## 2026-09-24: Step 7 case split out and built as W.12

The specific trigger noted here — `finishing-a-development-branch`'s Step 7
("Offer to Clear Context") only giving a verbal warning, never writing
anything down before `clear_session` fires — was brainstormed and shipped
as map item **W.12**. See `.digismith/docs/W/W.2-handoff-on-clear/design.html`
for the design: Step 7 now writes a 5-section markdown handoff to
`.digismith/sessions/<session-id>.md` on every clear, and W.10's
`SessionStart` hook points to it.

**What's still open, unbuilt:** the broader idea this file originally
described — a single reusable handoff structure for *any* DigiSmith
session writing a handoff, not just Step 7's automatic case. Ad-hoc root
`HANDOFF-*.md` files (like the one this very brainstorm resumed from) and
cross-session `SendMessage` handoffs remain hand-written and
unstandardized. The 5 candidate sections below are now validated in
practice by W.12's format — reuse them as-is if this broader convention
is ever designed.
