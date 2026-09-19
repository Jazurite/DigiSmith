# Herdr as a persistent multiplexer (tentative X.3/X.4)

## Status
Real spike done (2026-09-19), not yet brainstormed into an actual design/build. Jack's own
placement call (2026-09-18): this is a descendant of **X** specifically — not a new top-level
letter, not V's or K's territory — a direct extension of X's VPS-hosting scope. Tentative
numbering **X.3 or X.4**; note the map currently has no X.1/X.2 recorded yet (X's own row is
"practice dev/prod infra," and the actual shipped VPS-session-hosting mechanics live under
**V.3**, not X, per that row's own history) — whoever actually scopes this should settle the
real number against the live map at that time rather than trust X.3/X.4 as fixed.

**Spike result, in one line:** herdr genuinely survives a real SSH disconnect on the actual
VPS without needing the `loginctl enable-linger` fix V.3's tmux approach required — full detail
in `backlog/mcp-orchestration-architecture-xvk.md`'s 2026-09-19 addition, below.

## What this is
Full comparison, the herdr correction (it's a pane/process supervisor, not an inference or
dispatch layer), and the architecture diagram all live in
`backlog/mcp-orchestration-architecture-xvk.md` — that note is the source of truth, this file is
just the X-ownership pointer so X's own session has a concrete entry point instead of having to
discover it inside a three-lineage note.

Diagram: https://claude.ai/artifact/GhzA6bCwVCa6eQEb9X9nXz

One-line summary: herdr (https://herdr.dev/, Apache 2.0) is a working, open-source implementation
of "keep a coding-agent CLI's terminal session alive persistently, report its status, let agents
coordinate" — which is most of what a from-scratch X/V build would need to invent. It does not
touch K's dispatch/credential mechanics at all. The open question worth a real spike: does
standing up a herdr-managed pane avoid this environment's permission-classifier block (K's
problem), given that ongoing dispatch after setup wouldn't touch the controller's own Bash tool.

## How to apply
Read `backlog/mcp-orchestration-architecture-xvk.md` in full before scoping. This file exists so
"what's on X's plate" is discoverable from X's own lineage, not just the shared cross-lineage note.
