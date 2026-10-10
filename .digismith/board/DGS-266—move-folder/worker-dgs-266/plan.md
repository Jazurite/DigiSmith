# DGS-266 plan: move-folder on the public API (checkpoint 1)

Written 2026-10-10 (UTC+7), worker dgs-266. Nothing is built. No ClickUp write was made.

## What the branch has now (dgs-266, HEAD 2de9465, built on Frontdoor)
- `FrontdoorClient.moveFolder` (+ test) and type `FrontdoorMoveFolderBody` in `packages/clickup-client`.
- `packages/cli/src/clickup/move-folder.ts` + `.test.ts` (8 tests): flags `--folder`, `--parent`, `--position`, `--yes`; dry run by default via `printCall`; `--parent none` refused; Sol fix (dry run never builds the client); registered in `index.ts`.
- Allow rule `Bash(dg clickup move-folder:*)` in `.claude/settings.json`.
- The branch is behind main. Its own diff (merge-base to HEAD) is only these 7 files. Merge order should rebase or merge main first.

## What changes

### Client: `packages/clickup-client/src/client.ts`
```ts
export type MoveFolderTarget =
  | { parentFolderId: string; position?: number }
  | { spaceId: string; position?: number };

async moveFolder(folderId: string, target: MoveFolderTarget): Promise<void>
// PUT /folder/{folderId}/position   (public API, CLICKUP_API_TOKEN, rate limiter included)
// body {"parent_folder_id": "..."} or {"space_id": "..."}, plus "position" only when given
```
- The type lives in `types.ts` (exported through `export *`). The union makes "both" impossible to build in TypeScript; the CLI checks it at run time too.
- ClickUp answers `{}`; the method returns nothing.
- Test (`client.test.ts`, same style as the other client tests with a mocked axios): exact path, both bodies, position only when given, never `PUT /folder/{id}`.

### Frontdoor method: removed
Checked: `grep moveFolder|FrontdoorMoveFolderBody` shows only this branch uses them (command, its test, `frontdoor.ts`, `frontdoor.test.ts`, `types.ts`). I delete the Frontdoor method, its test and its body type. `frontdoor.ts`, `frontdoor.test.ts` and `types.ts` then match main again for these lines.

### Command: `dg clickup move-folder`
`--folder <id>` (required, digits). Exactly one of `--parent <folder id>` or `--space <space id>` (digits). `--position <n>` optional, whole number 0 or more, sent only when given (the old default 0 is dropped: the public call has no need for it, and omitting it keeps ClickUp's own default). `--yes` sends.

Validation (before any call, also in the dry run), message prefix `clickup move-folder:`, exit 1:
- `--folder` not digits: `--folder must be a folder id (digits only)`
- neither `--parent` nor `--space`: `give --parent <folder id> or --space <space id>`
- both: `--parent and --space cannot be used together` (the API would let parent win; the CLI refuses instead of guessing)
- `--parent` / `--space` not digits: `--parent must be a folder id (digits only)` / `--space must be a space id (digits only)`
- `--parent` equal to `--folder`: `cannot move a folder into itself`
- bad `--position`: `--position must be a whole number, 0 or more`
- `--parent none` is no longer special: it fails the digits check with a hint: `--parent must be a folder id (digits only); to move to the space top level use --space <id>`.

Handler: the dry run prints the call and builds no client (Sol fix kept). With `--yes` it builds `createClient()` (public client, `CLICKUP_API_TOKEN`) lazily and calls `moveFolder`. The factory type changes from `() => FrontdoorClient` to `() => ClickUpClient`.

Dry-run output (method, path, body; never a header or token), for G: TBD into Clans:
```
PUT /folder/1301150000002844/position
{
  "parent_folder_id": "1301150000001850"
}
nothing sent; add --yes to send
```
With `--space`: body `{"space_id": "..."}`. With `--position 3`: `"position": 3` added.
`printCall` is in `task-type-write.ts` (reused as is).

After `--yes`: `moved folder <id> into folder <parent>` (or `to the top level of space <space>`) `; check it with dg clickup get-lists (parent_folder)`. A failed call: `clickup move-folder: <message>`, exit 1. If it 404s once, retry once by hand and say so (the DGS-136 note); no auto-retry in code.

### Allow rule
Keep `Bash(dg clickup move-folder:*)` as is (same shape as the other dg write rules). Note again: `:*` also lets `--yes` through without a prompt, since a dry run is the default. Jack approved it in the earlier round ("as recommended"); I assume that still stands and flag it at checkpoint 2.

### Docs
The command text (`describe`) changes from "(Frontdoor)" to "(public API)". Ticket field `ClickUp API Type = Public` is already set. DGS-267 (create-folder `--parent-folder`) can then be public create, then `moveFolder`; no capture needed. Not built here.

## Tests (TDD, vitest, pnpm only)
Order: write the failing client tests, then `moveFolder`; rewrite `move-folder.test.ts` against a fake `ClickUpClient`, then the command.
`move-folder.test.ts` cases:
1. dry run with `--parent`: prints `PUT /folder/<id>/position` and `parent_folder_id`; client not called; exit 0.
2. dry run builds no client (factory that throws is never called).
3. dry run with `--space`: prints `space_id`.
4. `--yes --parent`: `moveFolder(folder, {parentFolderId})`; success line mentions `get-lists`.
5. `--yes --space`: `moveFolder(folder, {spaceId})`.
6. `--position 3` goes through, absent by default.
7. bad input table: non-digit folder, non-digit parent, non-digit space, neither flag, both flags, same folder and parent, bad position, `--parent none` (hint text): client not called, exit 1.
8. failed call: `clickup move-folder: boom`, exit 1.
Also: `index.test.ts` still lists the command (already there). Full run: `pnpm test`, with `FORCE_COLOR=1` for the known `index.e2e.test.ts` colour check (not mine). Then `pnpm --filter @digismith/cli build` is NOT run by me in main; it is in the merge order.

## Checkpoint 2 will show
The diff, the test output, and the dry run `dg clickup move-folder --folder 1301150000002844 --parent 1301150000001850` (read only, no `--yes`). The first-use write waits for Jack's yes.

## Questions
None blocking. Assumptions to confirm: (1) `--position` has no default; (2) `--parent` and `--space` together is refused, not "parent wins".
