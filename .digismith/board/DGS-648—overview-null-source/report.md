# DGS-648 report: Oculus overview answered 503

## What shipped
`GET /api/v1/oculus/overview` answered 503 `internal_invalid` because `overviewView` labelled each worker's recent events with `source: w.ticket`. A ticketless run (DGS-598) gave null, and the strict shared schema refused the whole answer. The source is now `w.ticket ?? w.project ?? w.run`. The shared schema stays strict.

## Files
- `packages/cli/src/oculus/views.ts`: the one-line fix.
- `packages/cli/src/oculus/views.test.ts`: ticket, project and run-id sources, plus a schema parse of the whole overview.
- `scripts/nexus-api/src/oculus-route.test.ts`: 200 for a ticketless worker with a string source; 503 `internal_invalid` for a null source.

## Commits
- docs(dgs-648): add the spec and plan
- fix(oculus): give a ticketless session's events a string source
- test(oculus): pin the strict overview schema and cover the project source

## Reviews
Task 1 review: approved, 1 Minor (accepted). Ticket review: clean, 3 Minor (2 fixed, 1 accepted). See `findings.md`.

## Verification
oculus + route tests 127 passed; `scripts/nexus-api/src` 399 passed; web `oc` tests 74 passed; `@digismith/cli` build (tsc) passed. The first use (an API check of `/api/v1/oculus/overview`) is the conductor's after the dist rebuild.
