# Persistent concurrent worker pool for offload dispatch (K.8)

**Status:** Idea only, not scoped. Depends on K.2, K.3, K.6, V.1.

**Map item:** **K.8**, sibling to K.2/K.3/K.5/K.6/K.7 under **K** ("Model tiering").
Tentative number — next free slot in the K lineage, not yet reserved in `MEMORY.md`.

**Source:** 2026-09-04, voice-dictated during a session that also fixed K.6's `is_error`
bug and reshuffled the roadmap's Tier 5/6 split.

## The idea

Today, `digismith:depot` (V.1) owns exactly **one** shared `opencode serve` process,
started on demand the first time `digismith:offload-implementer` (K.2) needs it, and
left running until explicitly stopped. Every dispatch — regardless of gateway (K.3:
Chutes/TokenReply) or runner (K.6: OpenCode/Claude Code) — funnels through that single
warm process, one task at a time.

Jack's proposal: instead of one on-demand server, run a **pool of persistent worker
services**, each already warm and hooked into a gateway (Chutes/TokenReply), running
24/7 until explicitly stopped — analogous to a goroutine worker pool in Go. A main
Claude Code session would act as dispatcher, handing offload work to whichever worker
is free, rather than paying cold-start latency per task.

**Motivation, confirmed:** startup latency. Spinning up (or resuming) the shared server
per task feels slow; the goal is workers already warm and ready so dispatch is
effectively instant.

**Scope, confirmed:** this is a new, bigger item than K.5 — a general-purpose
concurrent worker pool for running *many different* offloaded tasks at once, not
K.5's narrower idea (same task run through two gateways simultaneously for
cost/quality/speed comparison). K.5 would likely become one use case running on top
of this pool, not be replaced by it.

## Open questions, not yet scoped

- How many workers, and is the pool per-vendor, per-runner, or mixed? K.3's
  per-profile `task_offload_provider` and K.6's per-profile `task_offload_runner`
  currently resolve to a single choice per dispatch — a pool needs a story for
  whether a profile gets its own dedicated worker(s) or draws from a shared mixed pool.
- How is a worker claimed/released for a given dispatch, and what happens to
  `offload-implementer`'s existing single-session-per-dispatch model (Step 2's
  `ensure-opencode-server` / `ensure-claude-code`) once there's more than one
  live server to route to?
- Does this replace or extend V.1 Depot's single-server lifecycle model? Depot
  currently tracks exactly one `{pid, port}` at `~/.digismith/opencode-server.json`;
  Depot's own "Out of Scope" section explicitly declines a "generalized
  multi-resource interface" until "a fourth real resource needs the same shape" —
  a worker pool is a different shape (N processes, not one), so this may need new
  Depot operations rather than reusing `ensure-opencode-server` as-is.
- **Standing cost tradeoff, not yet discussed in depth:** real concurrency means
  multiple warm gateway-backed processes running continuously (346-556MB each,
  per Depot's own observed single-server footprint) instead of the current
  cold-start-but-free-when-idle model. Needs an explicit cost/latency tradeoff
  discussion before this is designed for real — this is a personal, single-operator
  tool, and most tickets never touch offload at all today.
- Relationship to K.5 (comparison) and K.7 (vendor benchmark) — both would likely
  run as workloads *on* this pool rather than being separate mechanisms.

## Why not applied yet

Idea only, captured verbatim rather than brainstormed — explicitly deferred at
Jack's request ("just write down the concept, we don't need to brainstorm anything").
Depends on K.2/K.3/K.6 (all shipped) and V.1's current single-server model, which
this would need to extend or replace. No design, no map-letter reservation yet.
