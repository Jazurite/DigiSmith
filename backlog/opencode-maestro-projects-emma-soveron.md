# Emma and Soveron maestro projects on the shared OpenCode server (guarded config per project)

**Status:** Idea, Jack (2026-10-10 ~14:3x UTC+7 [07:3xZ]). ClickUp: **DGS-225** (C.5: Nexus, subtask of DGS-223, task id `14zcebrvcp1`). No design yet.

## Why

Jack wants a maestro session per project on the shared OpenCode server (DGS-223): DigiSmith, Emma and Soveron. Only DigiSmith has a guarded maestro
config today (branch `dgs-169`). A session opened in a folder with no project config runs OpenCode's default agent, which has full shell and edit
rights and **no guardrail**. OpenCode has no safety classifier like Claude Code's auto mode, so the limits must be written as permission rules.
Emma is a company repo: no unguarded agent there.

## To do

- Port the DigiSmith maestro config (template from DGS-169 / DGS-223) to:
  - **Emma**: `~/Workspace/Emma/shopify-hub`, herdr workspace w3, its own rules prompt (Emma GitHub rules, main checkout stays clean, work in
    `.worktrees/`).
  - **Soveron**: `~/Obsidian/Knowpolis/1. Soveron`, herdr workspace w4, its own rules prompt (an Obsidian vault, not a code repo).
- Each: guarded `maestro` and `maestro-review` agents, `HERDR_WS` for its own workspace only, no `default_agent`, one STANDBY maestro session.
- Where the config lives: in each project folder (Emma's needs care: a company repo, never committed there without the Emma rules), or outside
  the repo through the server's config. Decide in the design.
- Prove each guardrail with the free no-model probes before Jack uses the session.

## Related

DGS-223 ([shared-opencode-server.md](shared-opencode-server.md)), DGS-169 ([maestro-in-herdr.md](maestro-in-herdr.md)), DGS-224 (model sources).
