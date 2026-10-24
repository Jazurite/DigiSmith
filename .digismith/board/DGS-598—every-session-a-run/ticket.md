# Dashboard: every AI session is a run, automatically

**Key:** DGS-598
**URL:** https://app.clickup.com/t/14zcebrwj76
**Story Points:** TBD

## Description

Every Claude Code session with the DigiSmith plugin is a run, automatically (Maestro, conductor, workers, reviewers, every project). SessionStart without `DIGISMITH_RUN_ID` creates the run record itself. The run id derives from Claude's session_id, so a resume or /clear continues the same run; a new session is a new run. Role from the herdr agent name or the DigiSmith identity card; project from the repo folder name; ticket from the branch. The run lives under `runs/<ticket or project>/<run-id>/`. `dg run start` stays; an explicit `DIGISMITH_RUN_ID` wins. Each hook stays under 100 ms. The watchdog classifies only builder, reviewer and scout runs. Full text: `dg clickup get-task DGS-598`.

## Acceptance Criteria

- A fresh conductor, worker, reviewer and a Desktop Maestro session each show up in `dg run list` with the right role and project without `dg run start`.
- A resumed session continues its run.
- The watchdog flags none of the maestro or conductor runs.
