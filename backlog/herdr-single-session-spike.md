# Spike: one herdr session, a workspace per project, a tab per ticket, the maestro in the first tab

**Status:** Spike, Jack (2026-10-09 ~03:00 UTC+7 [2026-10-08 ~20:00Z]). Jack prefers this to the current layout. ClickUp: **DGS-198** (C.1: Workbox, task id `14zcebrvbn9`). Tested first on Soveron (started 2026-10-09). **Jack: DigiSmith is next** (2026-10-09 ~03:30 UTC+7): the layout is applied to DigiSmith after the Soveron test, as the next piece of work there. emma stays as it is until the spike is judged.

## Today's layout

- One herdr session **per project**: `DigiSmith`, `emma`, `Soveron`, plus the stopped `default`.
- One workspace **per ticket** (Jack's rule of 2026-10-03: a new ticket starts a new workspace and agent, and cleanup closes it).
- The maestro runs **outside** herdr, in a Claude Desktop session, and targets one session with `herdr --session <name>`.

## Jack's idea

- **One** session (`default`).
- One **workspace per project**: Emma, DigiSmith, Soveron.
- Inside each workspace, one **tab per ticket** (or per standing job). Each tab holds one or more panes, and each pane can run an agent.
- The **maestro is the first tab** of its project's workspace, a persistent agent inside herdr.
- A tab is closed when its ticket finishes (the old "close at Step 10", one level lower).

## Why Jack likes it

One place to look at everything (`herdr session attach`), one server, a simple sidebar, and it matches how he thinks: the project is the room and the ticket is a page.

## Risks to check in the spike

- **Shared fate.** One server serves every project. The VPS lost a worker to an out-of-memory crash on 2026-09-29, and a crash would now stop all projects. Separate sessions limit that.
- **Mix-ups.** Maestros target a session today, so they cannot touch another project. In one session, a maestro could send keys to the wrong project's pane. Needs a guardrail: a maestro only touches its own workspace.
- **Names are unique across the whole session** (`day-cultivation`, `dgs-184`, and so on).
- **A new agent needs a free pane.** Herdr never creates a pane itself, so a tab or split must exist first.
- **Runbooks and memory** assume one session per project (`.digismith/sessions/workbox.md`, "one Desktop maestro per herdr session"). They need updating if the spike is adopted.
- **First-run questions.** Each new Claude agent stops at "trust this folder" (found live on 2026-10-09). A new pane needs that answered once per folder.
- **A maestro inside herdr is a new Claude instance.** It does not carry over a Desktop session's chat. Its context must come from files and memory.

## The spike (Soveron only)

Soveron's session (`--session Soveron`, already running on the Mac Workbox) was rebuilt on 2026-10-09 as the test:

| Workspace | Tab | Agent |
|---|---|---|
| `Soveron` (w7) | 1 Maestro | `maestro` |
| | 2 Day Cultivation | `day-cultivation` |
| | 3 Week Cultivation | `week-cultivation` |
| | 4 Month Cultivation | `month-cultivation` |

State when written: all four agents started and blocked at Claude Code's "trust this folder" question; waiting for Jack's yes. The Desktop session is still the maestro until Jack switches.

## What to measure

1. Does the layout stay readable with a second and third ticket tab open?
2. Does each worker pick up its role from files and memory, with no chat history?
3. Can a maestro reach only its own workspace? How is that enforced?
4. What happens after a reboot (herdr sessions do not survive one: re-attach, then restart the agents)?
5. Is one tab per ticket, closed at the end, as clean as one workspace per ticket?

## Decision rule

Jack (2026-10-09): do this **next on DigiSmith**. Order: (1) the Soveron test, already built; (2) DigiSmith, a workspace `DigiSmith` with the maestro as tab 1 and a tab per ticket, started when its live workers are idle (do not move running workers; a tab for a new ticket is the safe way in); (3) emma last, if the first two work. If it fails, return to one session per project. Update the runbooks (`.digismith/sessions/workbox.md`) when DigiSmith is moved.

## Related

- DGS-158 (the ticket is the unit), DGS-169 to DGS-171 (the persistent maestro, Observer and Operator).
- The Soveron workers: a day, a week and a month cultivation worker (this spike creates them).
