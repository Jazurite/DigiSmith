# Install, rollback and reboot plan, stage 3 (Jack runs these; no sudo)

Today (18:1x UTC+7) the live files are the stage 2 versions you already installed: `~/.local/bin/herdr-boot.sh` (starts only `default`) and `~/.local/bin/herdr-bootstrap.sh` (DigiSmith maestro only). `herdr-boot.sh.bak` is the pre-DGS-198 original. This stage replaces only the bootstrap.

## Install (nothing restarts now)
```
cd ~/Workspace/Jazurite/DigiSmith/.digismith/board/DGS-198—herdr-single-session-spike/worker-dgs-198 \
&& bash -n herdr-bootstrap.sh.new \
&& cp -p ~/.local/bin/herdr-bootstrap.sh ~/.local/bin/herdr-bootstrap.sh.bak \
&& cp herdr-bootstrap.sh.new ~/.local/bin/herdr-bootstrap.sh && chmod 755 ~/.local/bin/herdr-bootstrap.sh
```
(`herdr-boot.sh.new` is unchanged since stage 2 and is already live; nothing to copy for it.)

## Rollback
Bootstrap back to stage 2 (DigiSmith maestro only): `cp -p ~/.local/bin/herdr-bootstrap.sh.bak ~/.local/bin/herdr-bootstrap.sh`
Boot script back to the original: `cp -p ~/.local/bin/herdr-boot.sh.bak ~/.local/bin/herdr-boot.sh`

## Before the reboot
No worker may be mid-build. State at 18:1x UTC+7 [11:1xZ]: `dgs-197` is gone from `DigiSmith`; `dgs-198` (me) is working and stops at checkpoint 3, then idle: have the maestro close me. `dgs-25-verify` idle. In `default`: `maestro-next` and `dgs-198-scout` are test tabs, not needed after the reboot. Not carried over: emma's `emkt-809/810/817`, Soveron's four agents (your decision). Their work is in git and in the notes.
The three folders are already trusted in Claude (`~/.claude.json`: DigiSmith, `Emma/shopify-hub`, the Soveron vault), so no "trust this folder" question is expected.

## After the reboot, in order
1. Wait for auto-login, about 1 to 2 minutes. The boot script starts only `default`. Workspaces w1 to w4 come back empty (restored shells); old agents are NOT restored since their servers were not started.
   Check: `herdr session list` shows `default running`.
2. Run `~/.local/bin/herdr-bootstrap.sh`. It finds DigiSmith, Emma and Soveron by label (creates any that is missing), closes a plain `~` workspace, starts `maestro`, `emma-maestro` and `soveron-maestro` one after another (each about 10 s: start, then brief). Expect 30 to 45 seconds. Each prints `started and briefed (standby)`.
3. `herdr session attach default` and read each maestro's reply. They are on standby and wait for your first order.
4. If one prints `BLOCKED` or `is blocked`: answer its question in that pane (for "trust this folder" the cursor starts on "No, exit": press down, then Enter), then run the bootstrap again. It does not start a second copy.
5. Any later server restart: run the bootstrap again. It does nothing for a healthy maestro, and relaunches a restored one (plain `claude --resume`) with its flags.
Total: 3 to 5 minutes.

## What the bootstrap does for each case (tested on throwaway session `bootspike`, three workspaces, dummy folders, deleted afterwards)
| Case | Result |
|---|---|
| Fresh server, no agents | Workspaces created, 3 maestros started, trust prompts blocked on the new dummy folders (the real ones are trusted) |
| Re-run after the prompts were answered | The 3 up-but-unbriefed agents were briefed (33 s) |
| Re-run on healthy maestros | "already runs with its flags: nothing to do" |
| Server stop and start, then bootstrap | herdr restored workspaces and the 3 agents (plain `claude --resume`, flags lost); the bootstrap relaunched each with the same session id and flags (26 s) |
| In each maestro | `HERDR_WS` = its own workspace id (w1, w2, w3), cwd = its project folder, plain `herdr` denied |
Each reply to the standby brief: what it understood, what it would not touch, gaps; then waits.

## Files each real maestro is told to read (so you can tell Jack)
- **maestro (DigiSmith)**: `.digismith/sessions/DigiSmith/note.md`, `master-check.md`, `.digismith/sessions/workbox.md`. Runs in the DigiSmith repo.
- **emma-maestro**: runs in `~/Workspace/Emma/shopify-hub` (the workspace folder is `~/Workspace/Emma`; the maestro's note and its Claude memory live in `shopify-hub`). Reads `.digismith/sessions/Emma/note.md` (7.4 KB, updated 2026-10-09 14:22 UTC+7) and `.digismith/sessions/emkt-810/brief.md`; its auto-loaded memory is `~/.claude/projects/-Users-workbox-Workspace-Emma-shopify-hub/memory/` (10 files). Emma rules (github-emma, no `.git` on arrival, clean origin/main main checkout, work in `.worktrees/`) are written into its brief, taken from the DigiSmith memory note `reference_emma-github-on-vps`. **Gap: no Emma-specific runbook exists.** The Workbox runbook is in the DigiSmith repo and is not in its list. The brief tells it to report that gap.
- **soveron-maestro**: runs in the vault `~/Obsidian/Knowpolis/1. Soveron`. Reads `CLAUDE.md` (10.2 KB), `0. Grotto/Quick Notes/Session Handoff — 2026-09-30.md` (5 KB) and the markdown files under `System/` outside `node_modules` (only three fixture files: `System/Itinerary/src/itinerary-coverage.fixture.md`, `itinerary.fixture.md`, `System/Scripture/src/finance-lines.fixture.md`). There are no other System notes. Its auto-loaded memory: 4 files.
- All three briefs say: STANDBY (Desktop sessions still drive), drive nothing, no push, merge or external post (ClickUp, JIRA, Teams, Grafana), never read or print a secret, herdr only through `herdr-ws` in its own workspace, and the real-binary bypass is still open (do not use it).
