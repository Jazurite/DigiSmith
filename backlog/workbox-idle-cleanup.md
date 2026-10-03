# Workbox cleanup: close idle or unused sessions and agents after 2 days

**Status:** Idea, Jack (2026-10-03). ClickUp: **DGS-153** (C.1: Workbox). No design yet.

**Rule (Jack):** close all idle or unused sessions and agents after 2 days. Hand them off first if they are suspected to be
in use.

## Why

RAM is tight: 3.7 GB, with 2.4 GB of 4 GB swap in use on 2026-10-03. Idle processes hold memory, and each worker also holds a
seat login. On 2026-10-03, 7 Claude Desktop processes ran on the VPS (119 to 292 MB each), and three of them had run for
5.0, 3.2 and 2.0 days. Uptime is not idle time, so check activity before closing anything.

## Scope

- herdr agents, workspaces and sessions: `default`, `DigiSmith`, `Soveron`, `emma`, and any later session.
- Claude Desktop sessions on the VPS. They count as load on a seat and hold memory.

## Procedure, by hand first

1. **Inventory.** For each session, workspace and agent: herdr status, session ID, last activity, account, memory use.
   Last activity is the modified time of the session's transcript file, or `lastActivityAt` for a Desktop session. herdr
   has no timestamps of its own.
2. **Classify.**
   - Active: `working`, `blocked`, or activity within 2 days.
   - Stale: `idle` or `done` for more than 2 days.
   - Suspect in use: stale, but with uncommitted work, an unmerged branch, a dirty worktree, an open PR, a loop or
     background task, or a pending prompt.
3. **Act.**
   - Suspect: write its handoff first (`digismith:handoff`), then exit it.
   - Stale: exit it with `/exit`, not `/clear`, and print the resume command.
   - Never close a maestro session. Other maestros' workers (Soveron, Emma) are theirs: tell that maestro, do not close them.
   - Keep a worker slot's workspace, and close only extra workspaces and empty herdr sessions.
4. **Record.** Update the account matrix and the live-workers table in the Workbox runbook, and report the memory freed.

## Later

`dg workbox clean --older-than 2d` in the Workbox package (next to DGS-151), with `--dry-run` as the default, and a scheduled
run. It prints the resume command of everything it closes.

## Open decisions

- Who owns closing another maestro's workers. Proposed: the maestro that owns the session.
- The exact "suspect in use" signals, and whether a loop or scheduled task alone is enough to keep an agent.
- Whether stale Desktop sessions are archived. They are not herdr agents, so the mechanism differs.
- Whether 2 days is measured from the last transcript write or from the last prompt.
