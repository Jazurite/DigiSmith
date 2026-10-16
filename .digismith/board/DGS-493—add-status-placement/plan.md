# DGS-493: dg clickup add-status --after / --before

Design decided by the Maestro (brief `order-dgs-493-add-status-placement.md`, 2026-10-16). No plan stop.

## Change
- `--after <status>` / `--before <status>` on `dg clickup add-status`. They conflict (yargs `conflicts`, and `planStatusAdd` refuses both too).
- Anchor match: trim, case-insensitive. Unknown name: error that lists the existing names.
- No flag: today's behaviour (before the closed status), unchanged, no order-rule check.
- Order rule (anchored adds only): rank open=0, custom=1, done=2, closed=3. New rank >= left neighbour, <= right neighbour.
  Refusal names both neighbours and their types. The existing set's own order is not validated.
- All other statuses stay as read (id, name, type, color, relative order); orderindex re-numbered dense from 0.
- Dry run: full new order; position line `position: after "<x>"` / `before "<y>"`.
- After a real add: `verify()` read-back stays; on success the set as read back is printed (orderindex, name, type).
- `--help` names the flags; `packages/cli/README.md` updated if it lists add-status.

## Files
- `packages/cli/src/clickup/add-status.ts`, `add-status.test.ts`, `packages/cli/README.md` (if listed).

## Tests (TDD, fake Frontdoor client)
--after/--before in the middle, after open, before closed, each with an "unchanged apart from new status" check; unknown name;
both flags; four order-rule refusals; default path unchanged; dry run sends nothing; read-back printed after success.

## First use
After "go: merge": dry run then `--yes` for refinement (after discovery) and acceptance (after review) in space 1301150000001271;
read back with `get-lists`; comment on DGS-488.

## Left out
Nothing.
