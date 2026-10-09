# DGS-198 report 1 (checkpoint 2), 2026-10-09 17:1x UTC+7 [10:1xZ]

## Built (session `default`, all in workspace w2 "DigiSmith")
- Server: started 17:0x with a detached Python launch (`start_new_session`), because macOS has no `setsid`. Same effect as the approved `nohup setsid`. Started under account dev0. Log `/tmp/herdr-default.log`. It starts with its own workspace `w1 "~"` (a shell, mine to close later).
- Tab 1 `maestro` (w2:t1): agent `maestro-next`, new Claude, dev0, session id 2be67ca1.
- Tab 2 `scout-backlog` (w2:t2): `dgs-198-scout`, read-only (Read, Grep, Glob only). Tab 3 `scout-board` (w2:t3): `dgs-198-scout2`, then closed.
- Wrapper `~/.digismith-depot/bin/herdr-ws` (python, needs `HERDR_WS=w2`, set per tab with `--env`).

## Measures
1. **Readable with 3 tabs?** Tab list shows `maestro`, `scout-backlog`, `scout-board` with status. Easy through the API. I could not look at the TUI (no terminal attach from a worker), so the visual answer is Jack's.
2. **Role from files only:** yes. Prompted to read 3 files only, `maestro-next` named itself, listed the live workers correctly (dgs-197, dgs-198, the 2 idle scouts, real maestro in wM), listed what not to touch, and listed 4 gaps: whether workers are alive, its role next to the real maestro, whether the Standing order still applies, current seat usage. That is a good handoff, but it is state at the time of the notes, not live state.
3. **Reach only its own workspace:** tested from inside `maestro-next`: plain `herdr ...` denied; `env herdr ...` denied; `herdr-ws pane read wM:p1` refused (exit 3, wM is not w2); `herdr-ws pane list` allowed, shows only w2. Not proven: a deliberate bypass (any Bash agent can run the real binary by path). Needs the settings deny rule or a sandbox, which Jack did not approve.
4. **Reboot:** not tested (no reboot allowed). Reasoned: the server I started is a child-free detached process but is not under launchd, so it does not return after a reboot. `herdr-boot.sh` last line must change to `--session default`, plus a restart-agents step (see plan.md). Not edited.
5. **Tab per ticket closed at the end vs workspace per ticket:** `herdr tab close w2:t3` closed the tab and ended its agent. The name `dgs-198-scout2` left `agent list`. Clean. One difference: closing the last tab of a workspace would close the workspace; here tab 1 stays.

## What broke or surprised
- No `setsid` on macOS (used Python).
- No "trust this folder" question appeared for any of the 3 new agents: the folder was already trusted. It will appear only for a new folder.
- New agents start in **auto mode**, not manual. `maestro-next` is in auto mode. Say if you want manual (shift+tab).
- `agent list` has no filter; `herdr-ws` filters it. Agent names are session wide, but a name in another session is simply not found.
- Stale workspace `wK` "DigiSmith" in session DigiSmith (cwd `/root/...`, restore_error): untouched, listed per your order.
- Shared fate: all of tabs 1 to 3 die with one server. Memory looked fine (free pages went 5,982 to 207,498 between my reads, other load changed).

## Context handoff to maestro-next
Prompt: read 3 files, change nothing, answer in 10 lines. Result: accurate, honest about gaps. It cost 9 seconds. It did not carry the Master's chat or Jack's decisions made outside the notes (for example today's approval text), as expected.

## Still open
- `maestro-next` and the scout are still running (idle). The throwaway scout (tab 2) and w1 are mine to close at the end; `maestro-next` stays until Jack decides.
