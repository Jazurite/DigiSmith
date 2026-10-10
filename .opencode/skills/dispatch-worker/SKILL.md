---
name: dispatch-worker
description: Steps to dispatch one herdr worker for a ticket (workspace w2). Pilot: read and draft only until Jack lets this maestro dispatch.
---
# Dispatch one worker (steps from `.digismith/sessions/workbox.md`)
1. **Ticket first.** One ticket, one worker, one tab. Worker name `dgs-<n>`, tab label `DGS-<n> ⚚ <short name>`.
2. **Seat.** Check 5h and weekly usage of the seats `jack` and `dev0` (runbook "Reading usage"); heavy work to the seat with more 5h headroom. The usage probe reads token files: you do not run it, ask Jack or the Claude maestro.
3. **Brief.** Write `.digismith/sessions/dgs-<n>/brief.md`: goal, files to read, rules, checkpoints (plan, then diff), no push or merge without Jack, board folder `worker-dgs-<n>/`. Use a draft path in your own folder while in the pilot.
4. **Tab and agent** (w2 only): `HERDR_WS=w2 .../herdr-ws tab create --workspace w2 --label '<label>'`, then `agent start dgs-<n> --kind claude --pane <pane> ...`, then `agent prompt dgs-<n> "Read <brief> and follow it."` Never send an empty `pane run`.
5. **Checkpoints.** At each: read the plan or report, say what you would approve or change, wait for Jack. For reviews switch to `maestro-review`.
6. **Close (Step 10).** After merge and push: exit the agent, close the tab, remove worktree and branch. Only tabs you made.
In this pilot stop after step 3: draft only.
