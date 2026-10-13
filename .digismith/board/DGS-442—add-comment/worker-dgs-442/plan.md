# Plan: DGS-442 `dg clickup add-comment`

Worker `dgs-442`, list D.3 (ClickUp Channel). Written 2026-10-13, UTC+7.

## Goal
`dg clickup add-comment --task <id or key> (--text <s> | --markdown-file <path>) [--yes]`.
A dry run unless `--yes`. After posting, it reads the comment back. Same style as `add-link`.

## Findings
- `add-link` is `createRelationCommand` in `packages/cli/src/clickup/relation-write.ts`. It has the pattern:
  - parse flags with no network;
  - plain id and no `--yes`: print the call, no credentials needed;
  - a key or `--yes`: resolve with `getTaskByRef`;
  - `--yes`: write, read back, `read back OK` or an error;
  - errors go to `console.error`, `process.exitCode = 1`.
- `printCall(method, path, body)` is in `task-type-write.ts`. `REF` and `KEY` are in `refs.ts`.
- `ClickUpClient` (`packages/clickup-client/src/client.ts`) has no comment method. Add two.
- Public API: `POST /v2/task/{id}/comment` with body `{ comment_text, notify_all }`, answer `{ id, hist_id, date }`.
  `GET /v2/task/{id}/comment` returns `{ comments: [{ id, comment_text, ... }] }` (newest first, 25 per page).
  Both take `custom_task_ids` and `team_id` for a key, but we resolve the key to the task id first, so we never send them.

## Shape
1. `packages/clickup-client/src/client.ts`
   - `addTaskComment(taskId, text): Promise<ClickUpCommentCreated>` posts `{ comment_text: text, notify_all: false }`.
   - `getTaskComments(taskId): Promise<ClickUpComment[]>` reads the comment list.
   - Types in `types.ts`.
   - `notify_all: false` on purpose: a comment must not ping the whole task. No flag for it now.
2. `packages/cli/src/clickup/add-comment.ts` (new), registered in `index.ts`.
   - `parseCommentArgv(argv)`: no network. `--task` must match `REF`. Exactly one of `--text` and `--markdown-file`. A text that is empty after trim is an error. A file that cannot be read, or is empty, is an error.
   - `--markdown-file` is read as UTF-8 and sent as `comment_text`. The text is sent as written. No conversion (the public API comment field takes plain text; see Open points).
   - Dry run, plain id: print `POST /task/<id>/comment` and the body, then `nothing sent; add --yes to send`. No network, no credentials.
   - Dry run, key: one `getTaskByRef` to resolve, then the same print, plus `read 1 task (read-only call) to resolve; no write made`.
   - `--yes`: resolve, `addTaskComment`, then `getTaskComments` and look for the returned comment id. Found: `added comment <id> on DGS-436 (<task id>); read back OK`. Not found: error `sent, but read-back ... does not show the comment`; the write was sent.
   - The comment text is printed in the dry run only as a body, never anything else from the environment. No token or env is touched beyond `createClient`.
   - No "already set" check: a comment is not idempotent. Posting twice makes two comments. The dry run says so.
3. `packages/cli/README.md`: add the command next to `add-link`.

## TDD order
Each step: failing test first, then the code, run `pnpm --filter ... test`.
1. client: `addTaskComment` posts the right path and body; `getTaskComments` returns the list (axios mock, as the other client tests).
2. `parseCommentArgv`: bad ref; none of the two sources; both sources; empty text; whitespace text; missing file; empty file; file read.
3. Command, dry run with a plain id: prints the call and body, no client made (factory throws), exit 0.
4. Command, dry run with a key: resolves, prints, sends nothing.
5. Command `--yes`: posts with the resolved id, reads back, prints `read back OK`, exit 0.
6. Command `--yes`, read-back misses the comment id: exit 1, the post was sent.
7. Command, unknown key: error, no post.
8. Command `--yes` with `--markdown-file`: the file text is the body.

Run with pnpm only.

## Out of scope
- Edit or delete of comments, threads, replies, @mentions, assignees on a comment.
- Markdown to ClickUp rich text (see Open points).

## Open points
- The v2 comment API takes `comment_text` as plain text. ClickUp may keep `**bold**` as typed characters. `--markdown-file` therefore means "read the text from a file", not "convert". If the first use or a probe shows ClickUp accepts a markdown field on this endpoint, a later ticket adds it. I will probe with the DGS-436 comment and note what the read-back shows in `probe.md`.
- Paging: the read-back reads the first page (newest first). A new comment is first, so one page is enough.

## First use (after Conductor's "go: merge")
Post one comment on DGS-436: `Lineage A.5: Scheduling created 2026-10-13 (DGS-441); DGS-434, DGS-435, DGS-439 moved in.`
Dry run first, then `--yes`, then read it back. Keep the run in `probe.md`.

## Merge
Hooks 01 (bump), 02 (`claude plugin update digismith@jazurite`, no cache flush), 03 (depot history). Repo `history.html` stays frozen. Then push, remove the worktree and branch. I do not set the ticket done.
