# DGS-332 add-status — Implementation Report

Ticket: DGS-332

## What was built
`dg clickup add-status --space <id> --name <n> --type custom|done|open|closed [--color #rrggbb] [--yes]` (Frontdoor). Dry run unless `--yes`.
- Client: `getSpaceStatuses` (GET `/hierarchy/v1/project/<space>`) and `putSpaceStatuses` (PUT `.../status?checkConflict=true`).
- `planStatusAdd`: every current status kept (ids untouched), the new one has no id and goes before the closed status, `orderindex` re-numbered, no `status_change_map`. Refuses an empty name, a duplicate name (any case), a bad type or color, a second open or closed.
- Dry run: reads the set (GET only), prints the planned set with the new status marked, the PUT body, and "a real add replaces the whole status set: needs Jack's yes".
- `--yes`: prints the FULL PREVIOUS SET first (restore aid), sends one PUT, reads the set again, and exits 1 with a loud message naming any previous status that is lost or changed (id, name, type), or a missing new status.
- A failed PUT (conflict) prints ClickUp's message and exits 1; no retry.

## Not built
`--folder` and `--list`: the web app calls for those levels are not captured, so they wait for a capture (Jack). The command refuses them with that message.
Open point: a pure add has no capture; `status_change_map` is omitted. The first real add (Jack) will show whether ClickUp accepts that.

## Tests (mocks only, no write)
- `add-status.test.ts`: 15 new (planStatusAdd 7, add-status 8): exact PUT body with all statuses kept in order; post-read lost a status → exit 1 naming it; changed status; missing new status; conflict; folder/list refused; dry run sends no PUT.
- `frontdoor.test.ts`: FrontdoorClient 18 → 20, readFrontdoorAuth unchanged (26 → 28 in the file).
- Full run: 133 files, 1869 tests pass (base 1852 + 17). One earlier full run had one timeout in a 120 s spawn test under load; the rerun was clean.

## First use (conductor, after the merge)
DRY RUN ONLY on the DigiSmith space `1301150000001271`. A real add needs Jack. No allow rule proposed.
