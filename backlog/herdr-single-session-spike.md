# One herdr session, a workspace per project, a tab per ticket, the maestro in the first tab (adopted)

**Status:** Applied (Jack, 2026-10-09). Adopted with changes by a reboot-based cutover: the Mac Workbox rebooted at 18:45 UTC+7 [11:45Z] and only session `default` runs since. Was a spike (Jack, 2026-10-09 ~03:00 UTC+7 [2026-10-08 ~20:00Z]), tested on Soveron, then DigiSmith. ClickUp: **DGS-198** (C.1: Workbox, task id `14zcebrvbn9`), a subtask of the Dedicated Workbox milestone DGS-182. Open changes are at the end.

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

## Decision and result (2026-10-09, worker dgs-198)

Jack: **adopted with changes, by a reboot-based cutover. No carry-over of the old sessions** (DigiSmith, emma, Soveron are not restored). After the reboot only session `default` exists, and a bootstrap script sets up a workspace per project (DigiSmith, Emma, Soveron) and a new maestro in tab 1 of each (`maestro`, `emma-maestro`, `soveron-maestro`), all on STANDBY until Jack's first order (the Desktop sessions still drive today). Files in `.digismith/board/DGS-198—herdr-single-session-spike/worker-dgs-198/`: `report-1.md`, `herdr-boot.sh.new`, `herdr-bootstrap.sh.new`, `install-and-rollback.md` (install, rollback, reboot plan).

Measured:
- A new maestro rebuilt its role from three files in 9 seconds, with honest gaps. Tabs open and close cleanly; a closed tab frees the agent name.
- Guardrail: plain `herdr` and `env herdr` denied; `herdr-ws` refuses other workspaces.
- **Restore (no reboot, throwaway session):** after a server stop and start, workspaces, tabs and agents come back; an agent returns as `claude --resume <id>` with its name and history. **The launch flags are lost** (a deny rule given at start was gone). The bootstrap redoes only that: it relaunches the maestro with the flags, same session id.
- Bootstrap, three maestros: fresh start with 3 workspaces; a re-run on healthy maestros does nothing; after a server restart it relaunches all three with their flags (26 s). New folders stop at "trust this folder" (cursor starts on No); the three real ones are already trusted.

## Open changes (refreshed 2026-10-09 evening)

**Done**
- The new boot script (`--session default`) and the bootstrap are installed and were tested on a real reboot. Only `default` runs; the old sessions DigiSmith, emma and Soveron are stopped and not restored.
- Three maestros in tab 1 of their workspaces, in STANDBY: `digismith-maestro`, `emma-maestro`, `soveron-maestro` (the DigiSmith one was renamed from `maestro`, because agent names are unique across the session). The bootstrap relaunches them with their guardrail flags after a restart.
- Workers resumed from the old sessions as tabs: `emkt-817` and `emkt-809` (Emma), `week-cultivation` and `month-cultivation` (Soveron). Their conversations came back from the saved session ids.
- Real finding: herdr **does** restart agents after a reboot, as `claude --resume <id>`, with their history. The launch flags are lost, so the bootstrap redoes them.

**Follow-ups (optional, nothing here blocks the ticket: DGS-198 is done)**
1. **Optional extra safety:** close the loophole where a maestro could call the real `herdr` program by its full path and reach another workspace (a settings deny rule or a sandbox). The layout works without it; the launch flags plus the `herdr-ws` wrapper already keep a maestro to its own workspace in normal use.
2. **Standby to active needs no switch.** A maestro is active when Jack gives it its first order in its own tab (for Soveron: the Soveron workspace, tab 1). Until then it only reads its files and waits.
3. **Decided (Jack, 2026-10-09): new agents keep running in auto mode**, for workers and maestros alike. The auto-mode classifier stays the safety net.
4. Update `.digismith/sessions/workbox.md` and the maestro memory notes that still assume one session per project and say herdr does not restart agents.
5. `herdr-ws` is fixed to session `default`.
6. The bootstrap assumes tab 1 of each workspace is a free shell: after a reboot a restored test agent in that pane blocked the first run (found live). It should skip or report a pane that already holds an agent.
7. `day-cultivation` (Soveron) has no conversation to resume (it never passed the trust prompt): start it fresh if wanted.
8. Delete the old stopped sessions (`herdr session delete DigiSmith`, `emma`, `Soveron`) once Jack is sure.
9. The Conductor rename (DGS-191) will change the agent names in the bootstrap.
