# DGS-364 plan: dg clickup delete-folder (checkpoint 1)

Written 2026-10-11 (UTC+7), worker dgs-364. Nothing is built. No ClickUp write was made.

## Client (`packages/clickup-client`)

- `deleteFolder(folderId): Promise<void>` = `DELETE /folder/{id}` (v2 base URL). Same shape as `deleteTask`.
- `getFolderLists(folderId): Promise<ClickUpListSummary[]>` = two reads, merged by list id:
  - `GET /folder/{id}/list` (active lists)
  - `GET /folder/{id}/list?archived=true` (archived lists)
  Reason: the public API hides archived lists unless `archived=true` is passed. One call each, so the refusal never relies on a default.
- Types: reuse `ClickUpListSummary` (`id`, `name`) and `ClickUpListsResponse`. No new type.

## Why "no lists" is enough for "no task"

In ClickUp a task lives in a list, and a list lives in a folder. A folder with no list (archived included) holds no task. So the check reads lists only. Tasks of an archived list count as held: the list itself blocks the delete.

## Command `dg clickup delete-folder --folder <id> [--yes]`

New file `packages/cli/src/clickup/delete-folder.ts` (+ test), registered in `index.ts` after `move-folder`.

- `--folder` required, digits only (`ID` regex like move-folder). Else exit 1: `--folder must be a folder id (digits only)`.
- `--yes` boolean, default false.

Dry run (no `--yes`): never builds the client (works without credentials), prints

```
DELETE /folder/<id>
nothing sent; add --yes to send (it refuses if the folder holds a list, archived included)
```
exit 0. It makes no read at all.

With `--yes`:
1. `getFolderLists(folder)` (two GETs, read only).
2. If any list: print to stderr `clickup delete-folder: folder <id> still holds N list(s), nothing deleted:` then one line per list `  <list id>  <name>`, and exit 1. `deleteFolder` is not called.
3. If none: `deleteFolder(folder)`, print `deleted folder <id>; check it with dg clickup get-lists (it must be gone)`, exit 0.

A failed read (HTTP error, e.g. 404 for a folder that is already gone) exits 1 with the message and deletes nothing: no list proof, no delete.
Race: a list added between the read and the DELETE is not guarded. I do not know whether ClickUp itself refuses a non-empty folder; the check is ours. Accepted, the use is by one person.

## Tests (mocks only, no real call, no real delete)

Client (`client.test.ts`, mocked axios request, like `moveFolder`):
- `deleteFolder` sends `DELETE /folder/55`.
- `getFolderLists` makes both GETs (second with `params: { archived: true }`) and merges; a list in both appears once; empty both = `[]`.

Command (`delete-folder.test.ts`, fake client):
- dry run prints `DELETE /folder/<id>`, "nothing sent", calls nothing, exit 0; the factory is never called.
- `--yes`, empty folder: `deleteFolder` called once with the id; exit 0; output mentions get-lists.
- `--yes`, one active list: refuses, exit 1, stderr has list id and name, `deleteFolder` not called.
- `--yes`, only an archived list: same refusal.
- `--yes`, read fails: exit 1, `deleteFolder` not called.
- bad `--folder` (letters, empty): exit 1, no call.
- index test: the command is registered (follow how move-folder is checked, if it is).

TDD: each test first, red, then the code. `pnpm --filter @digismith/clickup-client test`, `pnpm --filter @digismith/cli test` (with `FORCE_COLOR=1` for the known e2e).

## Allow rule: a decision for Jack

move-folder has `Bash(dg clickup move-folder:*)`. Its `:*` also lets `--yes` through with no prompt. For a DELETE I do not recommend that.

Recommendation: no allow rule for `delete-folder` with `--yes`. Either no rule at all (every call prompts, dry run too), or a rule that matches only the dry run. Claude Code prefix rules cannot say "no --yes"; the rule `Bash(dg clickup delete-folder --folder:*)` still matches `--folder 1 --yes`. So the safe form is: **no allow rule**, and the maestro approves the dry run and the real run as prompts. The refusal check runs in the command either way.

I will add no rule unless the maestro (or Jack) says `Bash(dg clickup delete-folder:*)` is wanted. If it is not decided, I park it and leave `.claude/settings.json` untouched. Question for the maestro at the end of this turn.

## Files touched (small diff)

- new: `packages/cli/src/clickup/delete-folder.ts`, `delete-folder.test.ts`
- edit: `packages/clickup-client/src/client.ts` (two methods) and `client.test.ts`; `packages/cli/src/clickup/index.ts` (2 lines)
- `types.ts`: no change.
