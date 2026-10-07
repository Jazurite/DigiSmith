# Rename the Maestro to Conductor, so Master and Maestro stop clashing

**Status:** Idea, Jack (2026-10-07 19:5x UTC+7 [12:5xZ]). ClickUp: **DGS-191** (O.3: Roles, task id `14zcebrv43b`). No design yet.

## Why

Two roles have names that sound almost the same: the **Master** (Jack's Desktop session, DGS-170) and the **Maestro** (the herdr agent that dispatches
and supervises workers, DGS-176). Jack gives orders by voice, and speech recognition mixes them up: "tell the master to do the letter G" meant the Maestro.
Jack chose **Conductor** for the Maestro: easier for him to pronounce, it keeps the music metaphor, and it is not an overloaded tech word.

## Options that were weighed

- **Conductor** (chosen). Short, no clash with "master".
- **Orchestrator** (rejected). A generic tech word. This repo already uses it for other things: DGS-185 (MCP orchestration, V as the orchestrator) and the
  "Desktop orchestrator" in the runbook.
- **Rename the Master instead** (for example Owner or Principal). Not chosen, but still open if renaming the Maestro costs too much.

## What the rename touches (counted 2026-10-07, files that say "maestro")

- Code and skills: 3 skill files, 6 scripts. No hooks, packages or standards. Two scripts and the `digismith:handoff` text use the agent name `maestro`.
- The herdr agent name `maestro` in every running session, and the runbook `.digismith/sessions/workbox.md`.
- 41 backlog files and 34 session files mention it (DGS-169, DGS-170, DGS-174, DGS-176 are the main ones). History and reports are frozen records: do not rewrite them.
- ClickUp ticket titles and descriptions that say Maestro, and the memory notes.
- A plugin version bump and `/reload-plugins` in every running session after the merge.

## To decide

1. Rename only the role and the agent name, and leave frozen history alone? (Recommended.)
2. Keep "Maestro" as a nickname in prose, or remove it everywhere?
3. When: after the Legacy Letter Backfill (DGS-25), so the rename does not collide with work in flight.

## Related

DGS-170 (the Master), DGS-176 (the Maestro role), DGS-169 (the persistent maestro), DGS-185 (autonomous architecture).
