# DGS-600 setup log

Run 2026-10-24 17:54 UTC+7 (10:54 UTC), 2026-10-24, in the main checkout after the merge (`fd23871`, bump `8081e03`) and the CLI build. Space `1301150000001271`.

## B1 Statuses
Dry run for each, order checked, then `--yes`. Read back of the set:
`backlog, concept, discovery, refinement, scheduled, to do, ready, in progress, review, acceptance, release, done, documented, discarded, Closed`.
`scheduled` custom `#0091ff` after `refinement`; `ready` custom `#2ecd6f` after `to do`.
Scan check: `dg autonomous scan --dry-run --repo <main checkout>` prints `scan: none (0 candidates, 0 skipped)`, no `no-starter-status`.

## B2 Where Sign-off lives
`dg clickup get-field 9f85d93c-4b42-42e6-96d3-9d1891ab1592`: one location, in `categories`: `5:1301150000001908`. `teams`, `projects` and `subcategories` are empty.
The plan text says `parent.type`; the GET answer prints the same two values flat as `parent_type` and `parent_id` (the PUT body nests them as `parent.type` and `parent.id`). Both are numbers and ids, nothing was guessed.

## B3 Mode field
`dg clickup create-field --name Mode --option 'Autonomous:#2ecd6f' --option 'Manual:#e67e22' --description '...' --location 5:1301150000001908`. The dry run body had `team_id` `5738747`, the options in order Autonomous, Manual, and one location `{parent: {type: 5, id: 1301150000001908}}`. Then `--yes`.
- Field id: `c89fcfe7-d043-46fd-b6d4-b00995a465d4` (drop_down).
- Options: Autonomous `4a372d21-2269-43d5-a70a-0f9048ca095a` (orderindex 0), Manual `03d2af5c-a7dc-4923-abe9-f7a19446d3ac` (orderindex 1).
- Read back with `get-field`: one location, `5:1301150000001908`, the same as Sign-off. `dg clickup get-task DGS-600` shows Mode with options 0 Autonomous, 1 Manual.
- Defect found: the command printed `locations read back: undefined`. The answer's `locations` is an object with four arrays (`teams`, `projects`, `categories`, `subcategories`), not an array, so `.length` is undefined. The field and its location are right; only that count line is wrong. Needs a small ticket.

## B4 Lists without the new statuses
`dg clickup get-lists --space 1301150000001271` prints each list's `override_statuses` and `statuses`. Result: 61 lists in 13 folders and folderless, all with `override_statuses: false`, so they use the space's set. 59 print a status set that has `ready` and `scheduled`. The two folderless lists, Imperium and Notes, print an empty `statuses` array, as the folders do, and have `override_statuses: false`: they inherit the space set. No list keeps its own set. Nothing changed.

## B5 DGS-488 text
Six changes, word for word as in the plan (statuses in backticks as the page writes them): the `refinement` row, the `to do` row replaced by `scheduled`, `to do` and `ready`, the "Two human gates" sentence, the Definition of Ready sentence, the Lights-Out engine row, and one new line under "Statuses in the space". Written with `dg clickup update-task --markdown-description-file`; the read-back is identical to the file written, and differs from the old text only in those lines.

## B6
This file, committed on `main` with a pathspec.

# DGS-601 setup log

Run 2026-10-24 19:05 UTC+7 (12:05 UTC), in the main checkout after the merge (`7da3516`, bump `db8c0b0`) and the CLI build (`pnpm build` in `packages/cli`, exit 0).

## B1 Scheduled at field
`dg clickup create-field --type date --name 'Scheduled at' --description 'When a scheduled ticket starts (UTC+7). Then schedule-release moves it by its Mode.' --location 5:1301150000001908`. The dry run body had `type: "date"`, `type_config: {}`, `team_id` `5738747` and one location `{parent: {type: 5, id: 1301150000001908}}`. Then `--yes`, one try: it worked.
- Field id: `7e066e74-d408-4193-add8-2660a9d6fe86` (date).
- Read back with `get-field`: type date, one location in `categories`, `5:1301150000001908`, the same as Mode and Sign-off.
- The known defect again: the command printed `locations read back: undefined` (see DGS-600 B3). The field and its location are right.

## B2 Schedule view
`dg clickup create-view --space 1301150000001271 --name Schedule --status scheduled --sort-field-id 7e066e74-d408-4193-add8-2660a9d6fe86 --column-field-id 7e066e74-d408-4193-add8-2660a9d6fe86 --column-field-id c89fcfe7-d043-46fd-b6d4-b00995a465d4`. Dry run checked, then `--yes`.
- View id: `5f47v-112736` (list), read back in the space's views.
- Not checked by the worker: whether the status filter and the sort took effect. Jack looks at the view once in the ClickUp web app.

## B3 Nexus picks up the job: BLOCKED
- The rebuilt `dg autonomous schedule-release --help` printed help (before the restart).
- `launchctl kickstart -k "gui/$(id -u)/com.jazurite.digismith.nexus-api"`: exit 0. Nexus logged `listening` at 12:05:41 UTC.
- `GET /api/v1/jobs` (it answers without a token) lists `selftest`, `autonomous-scan`, `autonomous-report`, `nightwatch-watchdog`. `schedule-release` is missing.
- Why: the service runs `~/.digismith-depot/nexus-api/src/server.ts`, a copy that `scripts/nexus-api/install.sh` makes. The restart alone does not copy the new `registry.ts`. Of the Nexus source files, only `scheduler/registry.ts` differs between the main checkout and the depot copy.
- Not done: `install.sh` (it also rewrites `~/.digismith-depot/bin/nexus-api` with the node on PATH and stages the plist and sudoers files), and no copy by hand. The brief allows the restart only.

## B4 First run, read only
`dg autonomous schedule-release --dry-run`:
```
schedule-release (dry run, nothing written): 0 scheduled
```
No ticket is scheduled. The worker scheduled none.

## B3 Nexus picks up the job: DONE (2026-10-24 ~19:10 UTC+7 [12:10Z])
- The Scheduling Maestro ran `sh scripts/nexus-api/install.sh` (writes only in the depot; refreshes the copy in
  `~/.digismith-depot/nexus-api/src`), then `launchctl kickstart -k gui/$(id -u)/com.jazurite.digismith.nexus-api`.
- `GET /api/v1/jobs` lists `schedule-release`. Its 19:10 run was ok: 0 scheduled, 0 moved.
- Follow-up tickets: DGS-617 (hook 03 misses `report-<key>.html`), DGS-618 (clickup-client parameter property), DGS-611 (read-back line).
