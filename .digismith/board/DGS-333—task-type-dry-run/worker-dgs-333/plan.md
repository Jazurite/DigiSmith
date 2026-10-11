# DGS-333 plan: task-type commands, dry run without a Frontdoor session

Branch `dgs-333`, worktree `.worktrees/dgs-333`. Model: DGS-266 (move-folder).

## Option per command: (a) the read goes through the PUBLIC API, Frontdoor client only on --yes
Why not (b): create must check the name is free, update must read the full body, delete must print the count. Without the read the dry run would print less than the real call. (a) keeps the dry run as informative as today.

The public `ClickUpClient.getTaskTypes()` (GET /team/{id}/custom_item, already used by `list-task-types`) returns the same `ClickUpTaskType` shape as the Frontdoor read: id, name, name_plural, description, avatar {source, value}. Same TypeScript type in both clients. Live check 2026-10-11: `dg clickup list-task-types` (public) prints `fas note-sticky`, `fas heart-pulse` etc., so the avatar source and value come through. So update-task-type gets every PUT field (avatar_source, avatar_value, description, name, name_plural) from the public read. Missing avatar still falls back to `fas` / `user-alt` as now.

## Per command
- **create-task-type**: factories `(frontdoorFactory, publicFactory)`. Name check reads `publicFactory().getTaskTypes()`. Dry run prints the call. `--yes`: `frontdoorFactory()` is built only now, then `createTaskType`.
- **update-task-type**: same. Public read resolves the type and builds the body. `--yes` builds the Frontdoor client and calls `updateTaskType`.
- **delete-task-type**: the count already uses the public client; the type list moves to the public read too. Dry run builds no Frontdoor client. `--yes` builds it after the `--confirm-count` check passes (so a wrong count fails before any session is needed), then `mergeTaskType`.
- Dry-run path needs the team id for the printed path `/tasks/v1/<team>/customItem[/id]`. The public client keeps `teamId` protected, so the commands read it from `checkCredentials().teamId` (env file only, no session, no network). Injectable as a small `teamId` function for tests.

## Dry-run output (unchanged text)
```
PUT /tasks/v1/<team>/customItem/1005
{ avatar_source, avatar_value, description, name, name_plural }
nothing sent; add --yes to send
```
create: `POST /tasks/v1/<team>/customItem`. delete: the three existing lines (count, workspace-wide note, "To send: add --yes --confirm-count N").

## On --yes
Frontdoor client built only in that branch. A missing session gives the existing error: `CLICKUP_FRONTDOOR_AUTH is missing in ~/.digismith-depot/.env; run dg clickup frontdoor import-auth`. Nothing is sent before it. The public read happened first, which is a GET only.

## Tests (TDD, test first and see it fail)
Per command (create, update, delete):
1. A THROWING Frontdoor factory is passed; a dry run with a stubbed public client succeeds, prints the call, exit code 0, the factory is never called.
2. `--yes` with the stubbed public client calls the Frontdoor factory once and sends the call (existing tests move to the new factories).
3. `--yes` with a throwing Frontdoor factory: error printed, exit code 1, nothing sent.
Existing tests keep their cases (name clash, built-in refusal, no change, confirm-count) on the public stub.
Also: update test that the body takes avatar source/value from the public read.

## Commits (one per command, title only)
1. `fix(dgs-333): create-task-type dry run needs no Frontdoor session`
2. `fix(dgs-333): update-task-type dry run needs no Frontdoor session`
3. `fix(dgs-333): delete-task-type dry run needs no Frontdoor session`
Then full tests, report.html + plan.md committed together. `packages/clickup-client` is not edited (no conflict with the DGS-329 worker on frontdoor.ts).
