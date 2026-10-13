# DGS-437 report: desktop sessions get their Maestro card and catch-up

## What was built
- `scripts/session-cards/prompt-identity.ts`: pre-prompt handler, FIRST in `PRE_PROMPT_HANDLERS` (the one UserPromptSubmit entry; `hooks.json` unchanged). A session with no `HERDR_PANE_ID`, no `DIGISMITH_ROLE` and a folder named by one identity record gets its Maestro card on its first prompt (same identity branch as DGS-411) and the identity line as context. Idempotent: a session with a card gets nothing.
- Catch-up intent on the prompt that wrote the card: runs `catch-up-cli.ts` (identity, session, conductor, project from the record; same output and note write as DGS-428); exit 3 or 4 still count as output; if it fails, `cli.ts consult --project` as the fallback. Total budget 20 s. Any error = no text, exit 0, prompt never blocked.
- `card-hook.ts`: `StartResult` also returns the `identity`.
- `CLAUDE.md` (new, shared file, Jack's yes): the backup that needs no hooks.

## Rules kept
- Herdr sessions with env win; the conductor and workers never reach the identity branch (tests: herdr pane, `DIGISMITH_ROLE`, no record: no card, no command run).
- The regex is narrow on purpose (the whole prompt must be the catch-up phrase, under 80 characters). It is only the fallback for a session that has no card yet; once the session has its card, the skill `digismith:catch-up` handles any wording. A miss costs nothing.

## Hook events
Hook events not measured separately: classifier blocked the logging hook; measured by the first use. If Jack's new desktop session writes a card on its first message, UserPromptSubmit fires there; if not, the `CLAUDE.md` line is the working path. (Step 1 was dropped by the Maestro.)

## Review
Claude whole-branch review (independent subagent), 3 verified findings, all fixed:
1. The regex matched the bare word "status" anywhere ("git status"): now the whole prompt must be the phrase.
2. Catch-up also ran for a session that already had a card (double catch-up with the idle handler or the skill): now only on the prompt that wrote the card.
3. From the plugin cache, `catch-up-cli.ts` finds its repo from its own path (git log and reports would fail): the handler now uses the identity folder's own `scripts/conductor/` script when it exists.
No security findings (args array, no shell, `isSafeName` on every value).

## Tests
Full suite 1818 pass before the fixes; `scripts/session-cards` 54 pass after (new: handler, intent matcher, own-folder script, no catch-up with an existing card).

## First use
See probe.md.
