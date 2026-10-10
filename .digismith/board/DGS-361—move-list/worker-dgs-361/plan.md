# DGS-361 plan (updated 2026-10-11 ~01:3x UTC+7 for Jack's change: FRONTDOOR, not public)

**Approved checkpoint 1 with a change.** The public API has no List move (docs read, see below), so the build is on the Frontdoor call from Jack's capture `Raw_10_11_2026_00_54_03.folder`, entry [188] (read with `dg clickup frontdoor dump`, request line and body only):

`PUT /hierarchy/v2/subcategory/{list_id}/position?v2=true&conflict_modal=true&return_conflict_on_cancel=true`, body `{"position": n, "include_archived": false, "category": "<folder id>"}`, answer `200 {}`. The web app's follow-up `PUT /hierarchy/v1/project/{space}` (default_category) is NOT sent.

Changes against the text below: no throwaway test, no ClickUp write at all before checkpoint 2; the method is `FrontdoorClient.moveList` (session auth, dry run builds no client, like create-task-type); no own-folder check (needs a read with the token); `--position` defaults to 0; first use moves to DGS-365 (Master orders it after the merge). Notes list `1301150000003591` and the space default folder are left alone. Allow rule `Bash(dg clickup move-list:*)` added on the branch; same as move-folder, the `:*` lets `--yes` through unprompted (Jack approved that for move-folder, same here).

---

# DGS-361 plan: dg clickup move-list (checkpoint 1)

Written 2026-10-11 (UTC+7), worker dgs-361. Nothing is built. No ClickUp write was made.

## Endpoint: the docs name none

Read 2026-10-11 (read-only):
- developer.clickup.com/llms.txt: the only moves are Move Folder (`PUT /v2/folder/{id}/position`) and Move Task (v3 `home_list`). No List move in v2 or v3 (the v3 section has Chat, Docs, Attachments, ACL, audit log, time estimate only).
- Lists reference (`/reference/getlists`): Get Lists, Get Folderless Lists, Get List. All GET.
- feedback.clickup.com/public-api/p/move-list-to-another-parent-folder-via-api: open request since 2021, still asking in 2026. So the public API probably cannot move a List.

So the order's fallback applies: try `PUT /v2/list/{id}/position` on a THROWAWAY list and folder. If it works, build on it. If it fails, I stop and report (the Frontdoor route would need a Jack capture of a List drag; that would change the ticket's API Type to Frontdoor).

## Throwaway test (a ClickUp write: needs Jack's yes at checkpoint 1)

Calls, in the DigiSmith space, through dg only:
1. `dg clickup create-folder --name "ZZ throwaway move-list A"` (folder A)
2. `dg clickup create-folder --name "ZZ throwaway move-list B"` (folder B)
3. `dg clickup create-list --name "ZZ throwaway list" --folder <A>` (list L)
4. The move, `PUT /v2/list/<L>/position` body `{"folder_id": "<B>", "position": 0}` (a guess; also tried: `{"parent_folder_id": "<B>"}` like the folder move). Sent with the new `dg clickup move-list --yes` once built on the branch.
5. Read back: `dg clickup get-lists` (L under B?).
6. Archive A, B and L (update-list has no archive flag unless I find one; if no dg command archives, I stop and ask Jack, no one-off script, no delete).
Retry once on a 404 (DGS-136) and say so.

The test comes after the code and its unit tests are on the branch, so the real command is the tool. The branch is made only after "approved: checkpoint 1".

## Code (if the endpoint works; shape follows move-folder, DGS-266)

`packages/clickup-client/src/types.ts`: `MoveListTarget = { folderId: string; position?: number }`.
`client.ts`: `moveList(listId, target)` -> `PUT /list/{id}/position` with `{ folder_id, position? }` (body keys final after the test). ClickUp answers `{}`.
`packages/cli/src/clickup/move-list.ts`, registered in `index.ts` after move-folder.

Flags: `--list <id>` required, `--folder <id>` required, `--position <n>` optional, `--yes` sends (else dry run).
Validation before any call (also in the dry run): ids are digits only; `--position` a whole number, 0 or more; a list cannot move to its own folder. The "own folder" check needs the list's current folder, so it is read-only: `get-lists` for the target folder is not enough. Plan: the dry run and `--yes` call `getListFolder` (GET `/list/{id}` returns `folder.id`) once and stop with "list is already in that folder". Dry run needs the token for this one read; the move-folder test "dry run never builds the client" does not carry over. If Jack prefers no read, the check drops and ClickUp's own answer stands.

Dry run output:
```
PUT /list/1301150000002956/position
{
  "folder_id": "1301150000002921",
  "position": 1
}
nothing sent; add --yes to send
```
`--yes`: sends, prints `moved list <id> into folder <id>; check it with dg clickup get-lists`. Errors: `clickup move-list: <message>`, exit 1.

## Tests (TDD, vitest, pnpm only)
- `client.test.ts`: `moveList` PUTs the exact path and body, with and without position.
- `move-list.test.ts` (fake client): dry run prints call, sends nothing; `--yes` calls `moveList` with the target; `--position 0/3` goes through, `-1`, `1.5` fail; non-digit ids fail; own-folder fails; error path exit 1.
- `index.test.ts`: command registered. Full `FORCE_COLOR=1 pnpm test` at the end (the --help colour e2e fails without it; not mine).

## Allow rule
`Bash(dg clickup move-list:*)` in `.claude/settings.json` next to move-folder's (line 8), added on the branch only after approval. Same as move-folder: the `:*` also lets `--yes` through without a prompt, which Jack approved for move-folder. Same here.

## First use (only after Jack's yes at checkpoint 2)
1. Read the old C.3 description (`get-lists`, `get-list`).
2. `dg clickup move-list --list 1301150000002956 --folder 1301150000002921 --position 1 --yes`; read back with `get-lists`.
3. `dg clickup update-list --list 1301150000002956 --name "I.1: Capacity"` with a description from the old one (seats, usage, limit stops, load balancing; "2026-10-11: moved from C: Platform").
4. Report before and after.
Checkpoint 2 is the diff, tests and the dry run for C.3 into I at position 1 (read only).

## Reports
`report.md` and `report.html` (copy the "— Implementation Report" structure from the DGS-266 report.html) in this folder at the end. No push or merge without Jack's yes; merge order carries hooks 01-03 and `pnpm --filter @digismith/cli build` in main.

## Questions for Jack
1. Yes to the throwaway test (calls 1-6 above, `/v2/list/{id}/position` guess)?
2. Own-folder check by one read of the list (needs token in dry run), or drop it?
3. If the guess fails: stop and report, or capture a List drag in the web app (Frontdoor)?
