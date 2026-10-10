# DGS-364 report: dg clickup delete-folder on the public API

Status: built and committed on branch dgs-364 (not pushed, not merged; the maestro parks merges of the delete commands for Jack). No real delete and no ClickUp write was made. Only read calls ran.

- `ClickUpClient.deleteFolder(id)`: `DELETE /folder/{id}`.
- `ClickUpClient.getFolderLists(id)`: two reads, `GET /folder/{id}/list?archived=false` and `?archived=true`, merged by list id. A body without a `lists` array throws (fail closed; found by the review).
- `dg clickup delete-folder --folder <id> [--yes]`: it reads the lists first. Dry run: prints `would delete: folder N has no lists` or `would refuse: ...` with each list id and name, exit 0, sends no DELETE. With `--yes`: any list means a refusal on stderr and exit 1; no lists means the DELETE; a failed read means exit 1 and no DELETE.
- A task lives in a list, so a folder with no list (archived included) holds no task.
- No allow rule was added (decision: every real delete prompts). `.claude/settings.json` is untouched.
- Tests: client 65, CLI 514 (`FORCE_COLOR=1`); CLI build clean. Asymmetric cases: a list only in the active read, and a list only in the archived read; both are kept, so both refuse.
- Dry run against the old O folder `1301150000001877` (read only): refused, 5 lists printed (O.4, O.1, O.2, O.0, O.3), exit 0.

## ClickUp docs: non-empty folder
The public API page for Delete Folder says only "Delete a Folder from your Workspace." It does not say whether a non-empty folder is refused or deleted with its contents. So the command's own gate is the only protection.

## Accepted risks
- Race: a list added between the read and the DELETE is not guarded.
- Nested folders: the gate reads direct lists only. A folder that holds child folders but no direct list would pass. I could not verify how ClickUp's public API shows child folders or whether a delete cascades to them. Check before deleting a folder that may hold sub-folders. The old O folder holds lists, so it is refused.

## Review
Claude whole-branch review (subagent). Verified and fixed with tests: a `{}` body read as "no lists" (fail open). Not fixed, documented above: nested folders. The other points were test-gap notes with no failing path.
