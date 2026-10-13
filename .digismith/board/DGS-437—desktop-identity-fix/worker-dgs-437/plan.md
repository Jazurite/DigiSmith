# DGS-437 plan: desktop sessions get their Maestro card and catch-up

## Step 1: which hook events fire in a desktop session
Logging hook in `.claude/settings.local.json` (git-ignored, project-local, mine; removed afterwards). It appends `<UTC time> <event>` to `~/.digismith-depot/spikes/dgs-437-events.log`. It never reads stdin, so no prompt text and no secrets are logged. Events: SessionStart, UserPromptSubmit, PreToolUse, Stop, SessionEnd.

```json
{
  "hooks": {
    "SessionStart":     [{ "hooks": [{ "type": "command", "command": "echo \"$(date -u +%FT%TZ) SessionStart\" >> ~/.digismith-depot/spikes/dgs-437-events.log" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "echo \"$(date -u +%FT%TZ) UserPromptSubmit\" >> ~/.digismith-depot/spikes/dgs-437-events.log" }] }],
    "PreToolUse":       [{ "hooks": [{ "type": "command", "command": "echo \"$(date -u +%FT%TZ) PreToolUse\" >> ~/.digismith-depot/spikes/dgs-437-events.log" }] }],
    "Stop":             [{ "hooks": [{ "type": "command", "command": "echo \"$(date -u +%FT%TZ) Stop\" >> ~/.digismith-depot/spikes/dgs-437-events.log" }] }],
    "SessionEnd":       [{ "hooks": [{ "type": "command", "command": "echo \"$(date -u +%FT%TZ) SessionEnd\" >> ~/.digismith-depot/spikes/dgs-437-events.log" }] }]
  }
}
```
Jack opens ONE new desktop session in the DigiSmith folder and sends one message that makes Claude use a tool (e.g. "list the files in this folder"). I read the log, then delete the logging hook and the log file (both mine), and record the result in report.md.

## Step 2: UserPromptSubmit fallback
New pre-prompt handler `identityPromptHandler` in `scripts/session-cards/prompt-identity.ts`, FIRST in `PRE_PROMPT_HANDLERS` (one hook entry, no hooks.json change):
1. No `session_id`, or `HERDR_PANE_ID`/`DIGISMITH_ROLE` set: return nothing (herdr, conductor and workers are untouched).
2. Run `startHook(event, env)` (same identity branch as DGS-411). It writes the card only when none exists for this session, so it is idempotent. No identity match: nothing.
3. A card was just written: return the identity line as context.
4. Catch-up intent (see below) and the session is an identity session: run `scripts/conductor/cli.ts consult --project <project>` (local, 20 s timeout) and add its output as context, prefixed by a fixed marker line.
5. Any error: nothing returned, stderr note, exit 0 (runPrompt already catches).

Catch-up intent in a hook: a regex cannot read meaning, so the rule is deliberately narrow: prompt shorter than 80 characters and matching (catch me up | catch-up | how('s| is) it going | what did I miss | what('s| is) the (update|status) | status\?). A miss is harmless: the identity line plus the CLAUDE.md line (step 3) still let Claude run the consult. The idle handler stays as it is.

## Step 3: CLAUDE.md
The repo has NO CLAUDE.md today. This would create it (a new shared instruction file), after approval. Line below.

## Tasks (TDD, pnpm)
1. Tests then handler for steps 2.1-2.3 (card written once, herdr/env silent, no record silent, resume).
2. Tests then intent matcher and consult call (injectable runner; timeout and failure = no context).
3. Register in `hook-cli.ts`; `hook-cli.test.ts` order test; full suite.
4. Claude whole-branch review, fix verified findings, merge with hooks 01-03, report.md + report.html + plan.md, push, probe.md.
