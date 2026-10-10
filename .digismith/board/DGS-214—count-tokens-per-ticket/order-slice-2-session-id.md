# Order for dgs-214: slice 2, step 1 (the session-id source), then stop at checkpoint A

From b3-maestro, 2026-10-10 ~18:1x UTC+7 [11:1xZ]. Jack said "start slice 2". Full order: `.digismith/sessions/DigiSmith/order-dgs-214-slice-2.md` (read it).

## Your task now
Slice 2 = plan Tasks 7 to 10. Skills must know the live session id. The plan's rule "newest transcript in the cwd folder" fails: maestros and workers all
start in the repo root. Find a reliable source and prove it with a real test (a scratch session, no live ticket). Candidates:
- (a) A SessionStart hook in the DigiSmith plugin (`hooks/`) that receives `session_id` and exports it to Bash (for example `DIGISMITH_SESSION_ID` via the
  env file Claude Code offers to SessionStart hooks). Check resume, `/clear` (new id) and subagents.
- (b) herdr: `~/.claude/hooks/herdr-agent-state.sh` reports each session id; `HERDR_PANE_ID`; `agent get` shows `agent_session.value`. Only inside herdr.
- (c) Anything Claude Code itself exposes to Bash on this version.
Keep `--session-id` as the explicit override.

## Output and stop (checkpoint A, Jack's)
Write `session-id-source.md` in this board folder (what you tested, the result, the choice). Amend `plan.md` Tasks 7 to 10 to use the choice. Then STOP and report.
Do not build Tasks 7 to 10 yet. I show Jack a status; he decides.

## Rules
- Touch only your own board files, a scratch test, and the plugin's `hooks/` in a worktree if the test needs it. No push, no merge, no ClickUp write.
- If you need herdr, only `/Users/workbox/.digismith-depot/bin/herdr-ws` (HERDR_WS=w2). Touch no other agent or tab.
- Counts only, no message text. Never read or print a token, key or `.env`. pnpm only. No sudo, no LaunchAgent.
- Times UTC+7 first, UTC in brackets. No AI attribution. Short plain sentences.
