# Oculus overview returns 503 when a running session has no ticket (spec)

Written by the Maestro on Jack's order ("Oculus API: self refine and put on to do"), 2026-10-25 23:1x UTC+7. Sign-off: Auto. Mode: Autonomous.

## What is wrong (measured 2026-10-25 22:5x UTC+7)
- `GET /api/v1/oculus/overview` answers `503 {"error":"internal_invalid"}`. The routes `runs`, `live` and `attention` answer 200. The Oculus index page therefore shows no overview.
- `dg oculus view overview` prints a normal answer. Checking that answer against the shared schema (`overviewViewSchema`, `scripts/nexus-shared/oculus.ts`) fails on `lastEvents[i].source`: "expected string, received null". The API checks the CLI's answer with that strict schema and refuses it.

## Cause
- `packages/cli/src/oculus/views.ts`, in the overview view: `runFacts` labels each worker's recent events with `source: w.ticket`.
- Since DGS-598 every Claude session is a run, and a run may have **no ticket** (`ticket: null`; for example a session in the shoppable-video project). Its events get `source: null`.
- The schema says `lastEvents[].source` is `z.string()`. The CLI's own row type already allows a null ticket (runs view, DGS-598), so this was the one place left behind.
- The web page (`scripts/nexus-web/app/components/oc/LastEvents.vue`) prints `source` as plain text in the Source column. It is not a link and not a key.

## Fix (CLI only; the schema stays strict)
`source` is always a string, in this order: the worker's ticket; else its project; else its run id.
`source: w.ticket ?? w.project ?? w.run`.
No change to `overviewViewSchema`, the API route or the web page. A ticketless session shows its project name (for example `shoppable-video`) in the Source column.

## Out of scope
- Making the schema accept null (the strict schema is what catches drift).
- Showing a run link in the Source column.
- Other fields of the overview.

## Tests (fakes only)
1. `views.test.ts`: an overview with a healthy worker whose ticket is null and project is `shoppable-video`: its events in `lastEvents` have `source: "shoppable-video"`.
2. Same worker with project null: `source` is the run id.
3. A worker with a ticket keeps `source: ticket` (the existing check at line 68 stays green).
4. Contract: the whole overview of a depot that holds a ticketless run passes `overviewViewSchema.parse` (the check that failed in production).
5. `scripts/nexus-api/src/oculus-route.test.ts`: the overview route answers 200 when the CLI's answer contains a ticketless run's events (a fixture with `ticket: null`).

## First use (the conductor, after the merge)
1. Rebuild the CLI dist (the API runs the built CLI). No API restart is needed if no API file changed; if one did, install and restart it.
2. `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4300/api/v1/oculus/overview` prints 200.
3. Open oculus.pazurite.com: the index page shows the overview; a ticketless session's events show its project in the Source column.
