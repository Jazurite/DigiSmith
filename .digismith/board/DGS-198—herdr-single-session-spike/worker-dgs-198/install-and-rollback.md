# Install, rollback and reboot plan (Jack runs these; no sudo)

## Install (before the reboot; nothing restarts now)
```
cd ~/Workspace/Jazurite/DigiSmith/.digismith/board/DGS-198—herdr-single-session-spike/worker-dgs-198 \
&& bash -n herdr-boot.sh.new && bash -n herdr-bootstrap.sh.new \
&& cp -p ~/.local/bin/herdr-boot.sh ~/.local/bin/herdr-boot.sh.bak \
&& cp herdr-boot.sh.new ~/.local/bin/herdr-boot.sh && chmod 755 ~/.local/bin/herdr-boot.sh \
&& cp herdr-bootstrap.sh.new ~/.local/bin/herdr-bootstrap.sh && chmod 755 ~/.local/bin/herdr-bootstrap.sh
```
## Rollback
```
cp -p ~/.local/bin/herdr-boot.sh.bak ~/.local/bin/herdr-boot.sh
rm -f ~/.local/bin/herdr-bootstrap.sh
```
After a rollback and a reboot, the old per-project sessions are not restored either (they are only restored if their server is started). Start them by hand with `herdr --session <name> server` if needed.

## Before the reboot (what must be finished)
Reboot only when no worker is mid-build. Read from `agent list` at 18:0x UTC+7 [11:0xZ]:
- `dgs-197` (session DigiSmith): shows `done` now (idle at a checkpoint). Its work must be merged or parked: ask the maestro. Nothing in a pane survives as running work; only its Claude history resumes.
- `dgs-198` (me): I stop at checkpoint 3 and am idle after you read this. Tell the maestro to close me.
- `dgs-25-verify`, Soveron's four agents, `emkt-809/810/817`: idle, `done` or `unknown`; not carried over (your decision).
- `maestro-next` and `dgs-198-scout` in `default` are test tabs: not needed after the reboot (bootstrap makes a new maestro).
Also: commit or push any wanted `.digismith` notes first (git-excluded files stay on disk; they survive the reboot).

## After the reboot, in order
1. Wait for auto-login (about 1 to 2 minutes). The plist starts `herdr-boot.sh`, which starts only the `default` server.
2. In Terminal or over SSH: `herdr session list` shows `default running` only.
3. Run `~/.local/bin/herdr-bootstrap.sh` (about 15 s, tested at 14 s on a throwaway session). It creates workspaces DigiSmith, Emma, Soveron (empty plain shells for Emma and Soveron), starts a NEW `maestro` in DigiSmith tab 1 with the guardrail flags, and briefs it from `note.md`, `master-check.md` and the runbook.
4. `herdr session attach default` to look. Total: about 3 to 5 minutes.
5. Later restarts of the server (not a full reboot): run the bootstrap again. It creates nothing twice, and relaunches the maestro with its flags (herdr restores it as plain `claude --resume`, which drops the flags).

## Tested on throwaway session `bootspike` (deleted afterwards)
- Fresh server then bootstrap: 3 workspaces, maestro started and briefed, 14 s. `echo $HERDR_WS` inside the maestro = its workspace id; plain `herdr` denied.
- Stop and start the server: workspaces, tabs and the maestro come back (agent as `claude --resume <id>`, status `unknown` for a few seconds, then idle, history kept). Flags were lost. Running the bootstrap again relaunched it as `claude --resume <id> --name maestro --disallowedTools ...` in 8.5 s, history kept, `HERDR_WS` set.
- Not tested: a real reboot (not mine to do), and `herdr-ws` inside bootspike (it is fixed to session `default`).
