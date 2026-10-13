# DGS-427 Implementation Report: the catch-up template

## Summary
The catch-up report of design section 7 now has a template file and a renderer. It takes structured data and prints the seven sections in a fixed order, "none" for an empty one, times UTC+7 first.

## Built
- `skills/generate-comment/templates/catch-up.md`: fixed headings and layout (the E.5 template convention).
- `scripts/catch-up.ts`: `CatchUp`, `TimeInput`, `renderCatchUp`, `formatTime`, and a CLI (`node --experimental-strip-types scripts/catch-up.ts --data <json>`).
- `scripts/catch-up.test.ts`: 16 tests (full layout, none, fixed order, placeholder in a value, UTC+7 and day rollover, tool time with UTC in brackets, shape checks, CLI).

## Not done
No data collection (DGS-422), no behaviour or command (DGS-428), no `dg` wrapper.

## Review
A Claude review subagent read the diff. Fixed: offset-less times (host time zone), missing sections or health, non-finite usage, empty names. Left: the date is not shown inside the UTC bracket, Next is cut to 3 without a marker (spec), the repeated "(UTC+7)" in the window line follows the design text.

## First use
`node --experimental-strip-types scripts/catch-up.ts --data sample.json` printed (committed before the merge):

```
# Catch-up: digismith-conductor
Window: 2026-10-13 13:00 UTC+7 to 2026-10-13 15:30 UTC+7 (UTC+7)   Maestro identity: digismith-maestro   Asked by: s-42

## Done
- DGS-417: card format merged. Report: https://example.test/r.html

## Running
- dgs-427 | DGS-427 | merge | since 2026-10-13 13:30 UTC+7

## Waiting for Jack
none

## Decided under the mandate
- seat dev0 for dgs-427 | why: spread the load | allowed by: order-roles-followups-parallel

## Parked or failed
none

## Next
1. merge DGS-427
2. merge DGS-422
3. merge DGS-418

## Health
- Seats and usage: jack: 5h 19%, weekly 59%; dev0: 5h 12%, weekly 36%
- Server: herdr up
- Open tabs: 2: w2:1 conductor, w2:5 dgs-427
```
