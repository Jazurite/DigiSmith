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
