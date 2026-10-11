# DGS-387 report: show each task type's icon in dg clickup list-task-types

Status: built and committed on branch dgs-387. No new call and no ClickUp write in the build.

- `dg clickup list-task-types` prints a fifth, tab-separated column: the icon as `source value` (for example `fas flag`). A type with no avatar, or an avatar with empty source and value, prints `-`. Plain Task (id 0) prints `-`.
- The first four columns are unchanged. The command reads the same `getTaskTypes()` answer; `ClickUpTaskType.avatar` already existed, so the client is untouched.
- Files: `packages/cli/src/clickup/list-task-types.ts`, its test, and one line in `packages/cli/README.md`. No other task-type command was touched.
- Tests (written first, seen failing): avatar `fas flag`, null avatar, `{source: null, value: null}`, and the plain Task line.

## Review
Claude whole-branch review (subagent): no code findings. One doc nit (README line 30 did not list the icon column): verified and fixed.
