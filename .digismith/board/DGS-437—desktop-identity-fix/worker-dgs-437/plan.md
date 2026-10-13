# DGS-437 plan: desktop sessions get their Maestro card and catch-up

## Step 1: DROPPED
The logging hook was to measure which hook events fire in a desktop session. The classifier blocked writing it (`.claude/settings.local.json`, Self-Modification); the Maestro dropped the step (no retry, no reroute). Hook events are not measured separately: the first use is the measurement (see report.md).

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
1. Tests then handler for steps 2.1-2.3 (review fix: catch-up only on the prompt that wrote the card; own-folder script) (card written once, herdr/env silent, no record silent, resume).
2. Tests then intent matcher and consult call (injectable runner; timeout and failure = no context).
3. Register in `hook-cli.ts`; `hook-cli.test.ts` order test; full suite.
4. Claude whole-branch review, fix verified findings, merge with hooks 01-03, report.md + report.html + plan.md, push, probe.md.
