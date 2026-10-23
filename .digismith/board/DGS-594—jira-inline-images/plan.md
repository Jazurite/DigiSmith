# DGS-594 + DGS-595 Plan: finish the jira-inline-images branch

Tickets: DGS-594 (D.0, markdown-to-adf) and DGS-595 (F.7, skills). Finish job, no new build.

## What was finished
- Branch renamed to `DGS-594__jira-inline-images`; built work committed in two feature commits.
- Scope add (Maestro order main-11): Jack's own order to upload screenshots is the confirmation; the file list is always shown first; the cancel case still lists leftover attachments.
- Review fixes: parser rejects `=` inside a param value, duplicate params, `size` with a zero side, a malformed `![..](media:..)` line, and a malformed `{status:..}` token. Cancel and failure exits name uploaded attachments by id and filename.

## Tests
- jira-client: 66 → 73 pass (markdown-to-adf 32 → 39).
- Full repo: 248 files, 3835 tests pass. First full run needed `pnpm install --frozen-lockfile` in the worktree (nexus-api deps were missing there; unrelated to this change).

## Left for first use
The next real Jira progress update with screenshots. Both tickets stay in progress until then.
