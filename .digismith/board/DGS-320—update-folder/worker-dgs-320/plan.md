# DGS-320 plan: dg clickup update-folder (checkpoint 1)

Written 2026-10-11 (UTC+7), worker dgs-320. Nothing is built. No ClickUp write was made.

## The request (public API v2)

Checked in the ClickUp API reference (Update Folder), not live:

- `PUT https://api.clickup.com/api/v2/folder/{folder_id}`
- Body: `{"name": "<new name>"}`. `name` is the only documented field and it is required.
- Answer: the updated Folder object (`id`, `name`, `orderindex`, `hidden`, `space`, `task_count`, ...).
- `parent_folder_id` in the body is ignored by this endpoint (moving is `move-folder`).

**No description.** The ticket and brief say "--description". The API has no description field for a folder. I do not add the flag. If you want it, it needs a capture (Frontdoor), a separate ticket.

Not proven live. The first real send is DGS-321.

## Flags

`dg clickup update-folder --folder <id> --name <name> [--yes]`

- `--folder` required, digits only.
- `--name` required. Empty or whitespace-only is refused, in the dry run too. The name is sent as given (not trimmed).
- `--yes` sends. Without it, a dry run.
- A name equal to the current one: not checked. It would need a read, and the dry run adds none. ClickUp accepts a same-name rename as a no-op.

## Dry-run output

Plain ids: no client, no credentials, no network (the client factory is only called after `--yes`), like move-folder.

```
PUT /folder/1301150000001868
{
  "name": "A: Reactor"
}
nothing sent; add --yes to send
```

(uses `printCall` from `task-type-write.ts`)

## With --yes and the read-back

1. `PUT /folder/{id}` with `{name}`.
2. `GET /folder/{id}` (new client method `getFolder`), print `renamed folder <id> to "<name read back>"`.
3. If the read-back name differs from the requested one, print the mismatch and exit 1.
4. Also check by hand after the first use: `dg clickup get-lists --space <id>` shows the new name. Not in the command (it needs a space id).

Errors: `clickup update-folder: <message>`, exit code 1, same as the model.

## Code

`packages/clickup-client/src/client.ts`:

```ts
updateFolder(folderId: string, name: string): Promise<ClickUpCreatedFolder>  // PUT /folder/{id} {name}
getFolder(folderId: string): Promise<ClickUpCreatedFolder>                    // GET /folder/{id}
```

(`ClickUpCreatedFolder` = `id | name | hidden`; enough for both.)

`packages/cli/src/clickup/update-folder.ts` (new, modelled on `move-folder.ts`), registered in `index.ts`.

## Tests (TDD, vitest, pnpm)

- `client.test.ts`: `updateFolder` PUTs `{name}` to `/folder/f1` and returns the folder; `getFolder` GETs `/folder/f1`. Stub transport like the `updateList` test.
- `update-folder.test.ts`:
  - dry run prints the call and sends nothing, with a client factory that THROWS (proves no client is built);
  - empty name and whitespace name refused, factory not called, exit 1;
  - non-digit `--folder` refused;
  - `--yes` calls `updateFolder` then `getFolder`, prints the read-back name;
  - read-back mismatch exits 1;
  - API error sets exit 1.
- `index.test.ts`: command registered (if it has such a test).
- After editing a test file: per-describe counts against base. Full `pnpm test` at the end (one known e2e `--help` colour failure may exist).

## Commits (one small step each, title only)

1. `feat(clickup-client): add updateFolder and getFolder`
2. `feat(cli): add dg clickup update-folder`
3. `docs(dgs-320): plan and implementation report` (report.html + plan.md together)

## Allow rule

Propose: NONE. A rename is a write but not a delete. Without a rule each `--yes` needs a prompt. You decide. I add nothing to `settings.json`.

## After approval

`pnpm install` in `.worktrees/dgs-320` (branch `dgs-320`, board folder created), TDD build, full tests, `report.html` + `plan.md`, stop and report. No push, no merge. First use (DGS-321) is the maestro's after the merge.

## Approved 2026-10-11 (Master's maestro, checkpoint 1)
No --description (the API has none; its own ticket with a capture). No allow rule; settings.json untouched. Dry run builds no client and makes no read. After --yes: PUT then getFolder; a mismatch exits 1.
