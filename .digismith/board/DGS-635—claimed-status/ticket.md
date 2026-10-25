# Replace status 'ready' with 'claimed': the factory picks up 'to do' + Mode Autonomous and marks it claimed; in progress when the Builder starts

**Key:** DGS-635
**ClickUp:** https://app.clickup.com/t/14zcebrwjvw
**List:** B.6: Nightwatch

Jack, 2026-10-25 (Maestro session "Oculus"), after seeing Warren's "Claimed" run step: drop the ready status; any ticket in to do is ready for the factory; a picked-up ticket has status claimed. Jack confirmed: claimed -> in progress when the Builder starts building.

Decided flow (replaces the ready design of DGS-600/601)
to do + Mode Autonomous: the factory may claim it (night window or away).
to do + Mode Manual: attended work; the factory never claims it.
The scan claims a ticket: status claimed (was in progress at claim).
The conductor sets in progress when the Builder starts building (claimed covers the hand-off: order, worktree, Builder start).
scheduled: at "Scheduled at" the starter moves the ticket to to do (both Modes); Mode decides the rest.

Changes
ClickUp: rename status ready to claimed and place it between to do and in progress on every list that has it (through dg; if dg has no status rename, add the command first). No ticket sits in ready today.
Scan (packages/cli/src/autonomous/scan.ts, tracker): candidates = to do + Mode Autonomous + Definition of Ready; claim writes claimed; the missing-status check looks for claimed; release/retry paths and the already-done/drift checks use the new names.
Order text and runbook: the conductor sets in progress at the Builder start (read back).
DGS-601 scheduled starter: target to do for both Modes.
Oculus: the "Claimed" step reads from the claim as today; "Ready waiting" in the top bar becomes "To do (autonomous) waiting".
DGS-488 ticket flow doc and the autonomous README/WATCHDOG.md.

First use
Dry run lists a to do + Autonomous ticket as ready and skips a to do + Manual one; one claim from the real job (away on, throwaway ticket, as in DGS-623) shows claimed, then the conductor's Builder start shows in progress.

Sign-off: Auto. Before tonight if possible.

## Scope addition (Maestro, 2026-10-25)

The scan runs 24/7: no off outcome outside 23:00-06:00; it claims at any time, one ticket at a time; the breaker and the lock do not change. The away switch only marks the time as unattended. Shifts and a seat-headroom check are a separate follow-up.
