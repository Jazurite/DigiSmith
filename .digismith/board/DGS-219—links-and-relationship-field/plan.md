# Plan: DGS-219 dependency and link commands + DGS-345 Relationship values in --field

Worker `dgs-219`, branch `dgs-219` (worktree `.worktrees/dgs-219`). 2026-10-11 (UTC+7). Checkpoint 1: plan only, no code.
Note: init ran bootstrap with the profile `ticket: false` and a key from the brief; I skipped jira-intake (Jira) and did the design inside this plan.

## Endpoint shapes (ClickUp API v2 reference, read 2026-10-11)
| Call | Request | Response |
|---|---|---|
| Add dependency | `POST /task/{task_id}/dependency`, body `{"depends_on": id}` OR `{"dependency_of": id}` (one only) | `200 {}` |
| Remove dependency | `DELETE /task/{task_id}/dependency?depends_on=id` OR `?dependency_of=id` (query, not body) | `200 {}` |
| Add link | `POST /task/{task_id}/link/{links_to}` | `200 {task}` with `linked_tasks[]` |
| Remove link | `DELETE /task/{task_id}/link/{links_to}` (the reference page for it is not in the docs I could fetch; same path as add. Confirm on first live use) | `200 {task}` |
| Set Relationship field | `POST /task/{task_id}/field/{field_id}`, body `{"value": {"add": [ids], "rem": [ids]}}` | `200 {}` |

All accept `custom_task_ids=true&team_id=<workspace>`. I do NOT use it: the CLI resolves `DGS-n` keys to task ids itself (one read each, `GET /task/DGS-n?custom_task_ids=true&team_id=...`), so the dry run can print the real ids and names, and an unknown key is an error before any write.
Meaning: `--task A --waiting-on B` = A depends on B = `POST /task/A/dependency {depends_on: B}`. `--task A --blocking B` = B waits for A = `POST /task/A/dependency {dependency_of: B}`.

## Commands (new files in `packages/cli/src/clickup/`, registered in `index.ts`)
- `add-dependency --task <id|key> (--waiting-on <id|key> | --blocking <id|key>) [--yes]`
- `remove-dependency` same flags.
- `add-link --task <id|key> --to <id|key> [--yes]`, `remove-link` same.
- Exactly one of `--waiting-on` / `--blocking`; task and target must differ; ids = digits/alnum ClickUp ids, keys = `DGS-<n>` (custom id pattern `^[A-Z]+-\d+$`).
- Both ends are read first (`GET /task/...`): unknown task = error, nothing written. After a write, read the task back and print the relation (dependencies / linked_tasks) so the result is shown, as the ticket requires.
- Add is idempotent-checked: if the relation already exists, print "already set" and send nothing. Remove of a missing relation: error "not set".
- Never deletes a task; remove-* only touches the relation.

### Dry run (same as the task-type commands)
Default is a dry run: prints `METHOD path body` (via the existing `printCall`) plus "nothing sent; add --yes to send" and sends nothing. Known flaw of move-folder: the client factory runs `checkCredentials` even for a dry run. Fix here: build the client lazily, and when both ends are plain ids, a dry run makes no network call and needs no auth. When a key is used, a dry run does the read-only key lookup (needs auth; reads only) and says so. Test: a dry run with ids and no `.env` succeeds with a client factory that throws.

## DGS-345: Relationship values in `--field`
In `field-set.ts`: `resolveValue` stays sync for existing types; add a Relationship branch (`type === "list_relationship"`, `"tasks"` accepted too, the field type name needs one live confirmation) that needs async key resolution, so `resolveFieldArgs` becomes: parse value, split on `,`, each item optional `-` prefix (remove), resolve keys to ids through the client, build `{add: [...], rem: [...]}`. Rules: unknown key = error before any write; same id in add and rem = error; empty list = error; ids pass through unchecked but are read once to verify the task exists. `applyFields` already posts `{value}`; the value is just the object. Read-back: `update-task`/`create-task` already re-read the task and print it; I add one line per Relationship field naming the linked tasks (key and name). `list-fields` unchanged (already prints type). Wire `create-task` too if it uses `--field` (it shares `resolveFieldArgs`; check in code, no new flag).
Also add `list_relationship` to the client types so the union is honest.

## Order of parts (TDD, each a small title-only commit)
1. Client: `getTaskByRef` (key or id), `addDependency`, `removeDependency`, `addLink`, `removeLink` (+ tests with a mocked http).
2. Shared helper `relation-write.ts` (ref check, lazy client, dry-run print, readback) + tests.
3. The four commands + tests (dry run no-network, bad flags, both ends exist, already set, write path with a fake client).
4. DGS-345 value parsing + tests (add, remove, mix, keys, ids, unknown key, conflict, unsupported types still refused).
5. Wire into `index.ts`, `--help` text, docs line in the CLI README if one lists commands. Full test run (`pnpm`; one known e2e `--help` colour failure is pre-existing).

## Allow rules (`.claude/settings.json`, narrow, as for the task-type commands)
Proposal:
- `Bash(dg clickup add-dependency:*)` and `Bash(dg clickup add-link:*)`: yes. Additive, easy to undo, both ends verified, and DGS-338 Dawn needs many of them.
- `Bash(dg clickup remove-dependency:*)` and `Bash(dg clickup remove-link:*)`: NO rule. They remove data, like delete-task-type (no rule). Each asks Jack.
- No rule for `--field` writes (it rides on update-task, which has none today).
Jack decides; I add only what he approves.

## How Relationship values are tested without the Epic field
- Unit tests: fixtures only (a `list_relationship` field object, a fake client). No ClickUp call.
- Live test: I checked the DigiSmith space (Imperium, D.3, C.0 lists; fields are workspace-wide): there is NO Relationship field today, and the public API cannot create fields (Frontdoor only, that is DGS-344, waiting for Jack's capture). So a live test needs one of:
  a. Jack adds a throwaway Relationship field in the UI (name `ZZ Relationship Test`, on one list), I test on two throwaway tasks in that list, then archive the tasks (never delete) and Jack removes the field; or
  b. wait for DGS-344 (Epic, Initiative) and test on those at first use after merge.
  Recommended: (a) is not needed before the merge; unit tests plus the dry run are enough to merge, and first live use is `--field "Epic=DGS-343"` once DGS-344 exists. For DGS-219 dependencies and links I need NO new field: a live test on two throwaway tickets in D.3 (create, link, depend, remove, archive) after Jack's yes, or the first real use (Dawn waiting on DGS-327).
- The ticket's "does a link show in a Rollup column on the epic" check needs the UI and a Rollup field: not built here; report only, Jack's call.

## Questions for Jack
1. Allow rules as proposed (add-* yes, remove-* no)?
2. Live test: throwaway test in D.3 for dependencies/links before merge (needs a ClickUp write: your yes), or only dry runs and first real use?
3. Relationship live test: (a) you add a throwaway field, or (b) wait for DGS-344?
