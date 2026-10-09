# DGS-198 plan: herdr single-session layout on DigiSmith (checkpoint 1)

Written 2026-10-09 (UTC+7). Worker `dgs-198`, account `dev0`. Nothing in herdr is changed yet.

## Found while reading (no change made)
- Session `DigiSmith` has a stale workspace `wK` labelled `DigiSmith` (cwd `/root/Workspace/...`, `restore_error`: the saved directory is gone). It is a leftover from the VPS. I do not touch it. Suggest Jack or the maestro closes it later.
- Session `default` is stopped. Its dir is `~/.config/herdr`.

## Steps (after "approved: checkpoint 1")
1. **Start the `default` server** (needs a yes: it is a new process). `nohup setsid herdr --session default server` from a plain shell, same env as `herdr-boot.sh` (`claude-account env`). Check free memory first (`vm_stat`). It does NOT survive a reboot (measure 4).
2. **Workspace**: `herdr --session default workspace create --cwd ~/Workspace/Jazurite/DigiSmith --label "DigiSmith" --no-focus`. Record the workspace id.
3. **Tab 1 `maestro-next`**: use the workspace's first tab, rename it `maestro`. Start a NEW Claude: `herdr --session default agent start maestro-next --kind claude --pane <pane> -- --name maestro-next` (account dev0, manual mode, launch flags from the guardrail below). Answer the "trust this folder" question once.
4. **Handoff prompt** to `maestro-next`: read only `.digismith/sessions/DigiSmith/note.md`, `master-check.md` and `.digismith/sessions/workbox.md`, then say in 10 lines who it is, what is live, what it must not touch. No chat history is passed. This is measure 2.
5. **Ticket tab**: `herdr --session default tab create --workspace <ws> --label "<ticket>"`, then `agent start <ticket-agent>` in its free pane (see test ticket). Unique agent names. Trust prompt answered once.
6. **Measures 1 to 5** (see design.html). Write the numbers in `report-1.md`. Update `.digismith/sessions/DigiSmith/note.md` after each step (the order asks for it).
7. Stop at checkpoint 2. Wait.

## Guardrail proposal (measure 3)
Three layers, strongest last. None edits a permission setting.
1. **Brief rule** in `maestro-next`'s first prompt: use only ids that start with its own workspace id; never `herdr session ...`, `server ...`, `workspace close/rename/create`.
2. **Launch flags** (not a settings edit): start it with `--disallowedTools "Bash(herdr *)"` and `--allowedTools "Bash(herdr-ws *)"`. Prefix rules are weak against shell tricks (`env herdr`, `sh -c`), so they are a fence, not the lock.
3. **Wrapper `herdr-ws`** (a script under `~/.digismith-depot/bin/`, or `scripts/` if Jack wants it in the repo): reads `HERDR_WS` (set by `--env` when the pane is created), allows only `agent|pane|tab` verbs, and refuses a target whose workspace is not `$HERDR_WS`. Agent names are session wide, so it resolves name to pane to workspace with `agent get` before acting. It always adds `--session default`. A test shows a refusal on a pane of another workspace.
Limit I will say plainly in the report: any Bash-capable agent can still call the real `herdr` binary. Only a settings deny rule or an OS sandbox closes that. That is Jack's call, so I only describe it.

## Reboot path (describe only, DGS-190)
`~/.local/bin/herdr-boot.sh` last line is `exec herdr --session DigiSmith server`. For the shared session it becomes `exec herdr --session default server`. Also: after a reboot herdr restores workspaces but not agents, so a start-agents step (maestro first, then ticket tabs from a list) is needed. The root-owned plist stays as is. I do not edit the script.

## Test ticket proposal
DGS-197 stays where it runs (wS in session `DigiSmith`, untouched). Options for the new layout:
- **A (my pick):** a throwaway standing job: a read-only Scout agent `dgs-198-scout` in tab 2 (for example "list open backlog files"). It tests tab, free pane, trust prompt, naming, tab close, with no real work at risk. Then a second tab to see measure 1 with three tabs.
- **B:** a real small ticket Jack names. Better evidence, so I need his pick.
- **C:** DGS-197 restarted in the new layout. Only if Jack decides; the maestro said not to touch it.

## I will NOT touch
Sessions `emma` and `Soveron`; session `DigiSmith` and its workspaces wM, wP, wS, wT(own), and wK; `~/.local/bin/herdr-boot.sh`; the plist; any permission setting; any token, key or `.env`; ClickUp; git push or merge. No repo code change.
