# DGS-332 plan: dg clickup add-status (Frontdoor)

Ticket: DGS-332 (ClickUp 14zcebrvd0q). Checkpoint 1: plan only, no code.

## Captured call (Raw_10_10_2026_22_39_18, [125] and [126])
`PUT /hierarchy/v1/project/<space id>/status?checkConflict=true` (project = the space). Body:
`{ "statuses": [ {id?, status, type, orderindex, color}, ... ], "status_change_map": { "<old>": "<new>" } }`. Answer: `{}`.
- Status object: `id` (`p<space>_<8 chars>`, only on existing statuses), `status` (name), `type`, `orderindex` (0..n, dense), `color`.
- A NEW status has NO `id` (captured: "documented", "discarded"). The rows are `{color, orderindex, status, type}`.
- Types seen: `open` (first), `custom`, `done`, `closed` (last). In the capture "discarded" is type `done`, not `closed`.
- `status_change_map` maps a removed or renamed status to its replacement (tasks move). Captured only on a rename.
- [122] `PUT /templates/v1/statusTemplate/<id>` saves the set as a template: not needed, not built.

## The PUT replaces the WHOLE set (destructive risk)
Yes: the body is the complete list. A status missing from it is removed. So the command must read the current set, send ALL of it back
(ids, names, types, colors untouched, same order) plus the new one. It must never send only the new one.

## Read the current set
`GET /hierarchy/v1/project/<space id>` ([35]): its `statuses[]` has id, status, type, orderindex, color (the same shape the PUT takes).
New Frontdoor client methods: `getSpaceStatuses(spaceId)` (that GET, returns `statuses`) and `putSpaceStatuses(spaceId, body)` (the PUT).

## Append, without touching the others
Pure function `planStatusAdd(current, {name, type, color})`:
- copy every current status as it is (id kept, fields untouched);
- insert the new one `{status, type, color, orderindex}` without id: before the first `closed` status (so the closed one stays last), else at the end;
- re-number `orderindex` dense from 0 (only the ones after the new one move; the capture does the same);
- no `status_change_map` (nothing is removed or renamed). UNVERIFIED: whether ClickUp wants `"status_change_map": {}` or no key; no pure add is captured. I send no key; first real use (Jack) will show it.
- refuse: empty name; a name already in the set (case-insensitive); a bad type; a bad color (`#rrggbb`); a second `open` or `closed` (ClickUp keeps one of each: from the web UI, not captured, so I refuse rather than guess).
- `--type`: `custom|done|open|closed` as ClickUp names them. The ticket said `open|closed`; the capture shows the useful types are `custom` and `done`. `--type done` = the ticket's "closed-type" discarded. `--color` default `#87909e` (grey).

## Levels
Only the SPACE level is captured. Folder and list calls are NOT captured ([134] only READS statuses per folder). I build ONLY `--space <id>`. `--folder` and `--list` are not options (a clear yargs error); they need Jack's capture. No guessing.

## Command
`dg clickup add-status --space <id> --name <n> --type custom|done|open|closed [--color #hex] [--yes]`. Dry run unless `--yes`.
Dry run (GET only, no write): prints the planned set, new one marked:
```
PUT /hierarchy/v1/project/1301150000001271/status?checkConflict=true
 0 backlog   open    #87909e
 ...
 9 discarded done    #e5484d   <- NEW
10 archived  closed  #008844
nothing sent; add --yes to send
```
then the JSON body (masked of nothing: no header printed, via `printCall`). Exit 0. With `--yes`: send, print `status added: <name>`.
The dry run reads the set with a GET (a read, not a write). Mocks only in tests.

## Conflict (`checkConflict=true`)
ClickUp may refuse when tasks use a status the new set would remove: not our case (we remove nothing). A 4xx/409 from the PUT: the client error already carries
ClickUp's body; the command prints `clickup add-status: <message>` and exit 1, nothing retried. No `force` flag. Auth errors: the existing FrontdoorAuthError text.
A stale read (set changed between GET and PUT) is the conflict case: the message says "re-run to read the current set".

## Tests (mocks, TDD, failing first)
- `planStatusAdd`: the exact PUT body: ALL existing 9 statuses preserved in order with their ids; new one has no id; inserted before `closed`; orderindex dense; custom at end when no closed; refusals (dup name case-insensitive, bad type, bad color, empty name, second open/closed).
- Frontdoor client: `getSpaceStatuses` calls GET and returns the list; `putSpaceStatuses` PUT path + body.
- Command: dry run sends no PUT and prints the planned set with NEW marked; `--yes` sends exactly one PUT with the full body; `--folder`/`--list` rejected; no `--space` rejected; conflict error exits 1.
After the edit I report per-describe test counts against the base.

## Allow rule
Propose NONE. A real add changes Jack's workspace; keep the prompt. The conductor decides.

## Files
- `packages/clickup-client/src/frontdoor.ts` (+ `frontdoor.test.ts`): two methods and the status body types; export in `index.ts`.
- `packages/cli/src/clickup/add-status.ts` (new, + `add-status.test.ts`): `planStatusAdd` and the command.
- `packages/cli/src/clickup/index.ts`: one import and one `.command(addStatusCommand)` line (shared file: minimal edit).
- This folder: `plan.md`, `report.md`, `report.html`.

## First use (conductor, after merge)
DRY RUN ONLY on the DigiSmith space (1301150000001271), printing the planned set. A real add needs Jack.
