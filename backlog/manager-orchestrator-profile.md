# Manager/orchestrator profile: one Claude session supervises herdr worker agents

**Status:** Idea only, confirmed live. No design yet. Filed as a task chip 2026-10-02.

**Source:** Live session 2026-10-02 (Claude desktop-app session "Main", manager mode: one Claude session managed herdr worker agents on EMKT-791 and EMKT-810). Full retro: [manager-mode-retro-2026-10-02.md](manager-mode-retro-2026-10-02.md).

## The idea

Add a DigiSmith profile (name to decide: `manager`, `orchestrator` or similar) and a skill set for a
supervisor/worker setup:

- The manager writes a handoff brief into the gitignored `.digismith/docs/<slug>/`: findings,
  decisions marked "do not re-ask", and a stop-and-ask list.
- The manager starts each worker with `herdr --session <s> agent start <name> --kind claude
  --pane <pane>`, and sends every prompt from a background job with
  `herdr agent prompt <name> "<msg>" --wait --timeout 7000000`, so the harness wakes the manager
  when the worker settles. No polling.
- The manager reviews each design section, the plan, each task diff, test results and the
  whole-branch review before it approves the next step. It runs the worker's checks itself
  instead of trusting the report.
- Hold pattern: `agent send-keys <name> esc`, then a short "HOLD, reply with one line" message.
- Several workers in parallel, for example one per market repo on a multi-market ticket.
- The worker knows it has a manager (a profile flag or a line in the brief), so it asks the
  manager instead of Jack.

## Approval rules to encode (learned 2026-10-02)

- Jack reviews every JIRA comment draft before it is posted. On EMKT-791 the manager pushed
  without asking Jack and Jack corrected the rule: commits and normal pushes to the ticket's PR
  branch are the manager's call. What he reviews is the JIRA draft.
- The manager must draft JIRA comments with `digismith:generate-comment`, never by hand. On
  EMKT-810 it hand-wrote one and Jack asked "use DigiSmith template, have you init DigiSmith???".
- Force-push, merge, live-theme changes, Teams posts and global theme-setting values: ask Jack.
- PRs stay draft until Jack says otherwise.

## Related

Fold these candidates into this design rather than building them alone:
[init-amend-initialized-ticket.md](init-amend-initialized-ticket.md),
[herdr-read-dim-prompt-suggestions.md](herdr-read-dim-prompt-suggestions.md),
[cross-market-port-structural-check.md](cross-market-port-structural-check.md),
[manager-ci-rerun-triage.md](manager-ci-rerun-triage.md),
[auto-trust-own-repo-agents.md](auto-trust-own-repo-agents.md). See also the existing
[herdr-auto-answer-races-external-intervention.md](herdr-auto-answer-races-external-intervention.md).

## Why not applied yet

Needs a brainstorm and Jack's approval. Recommended as the first item to brainstorm from this retro.
