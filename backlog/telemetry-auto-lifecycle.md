# Telemetry: automatic session lifecycle

**Status:** Not applied. Idea only. Deferred until real telemetry data
has been collected — revisit once there's enough usage history to know
what's actually worth automating.

**Source:** Jack's own note, 2026-08-14.

## The idea

Telemetry should start automatically when a session begins using
DigiSmith, and end automatically when the session closes or the user
deletes it — no manual start/stop step.

## Why this might matter

If telemetry currently requires a manual trigger, usage data collection
is only as complete as whatever discipline enforces that trigger being
called every time. A single-developer personal tool is exactly the case
where that discipline slips first.

## Open questions

- What "telemetry" currently means in DigiSmith today (what's tracked,
  where it's stored) — not yet confirmed against current code.
- What "session" boundaries map to in practice (a DigiSmith pipeline run?
  a `using-digismith` invocation? a git worktree's lifetime?).
- Deliberately deferred by Jack until there's real data to design against,
  rather than speculating on the shape of the automation now.
