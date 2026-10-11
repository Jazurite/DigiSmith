# DGS-134 report: `dg clickup create-field`

Worker `dgs-134`, 2026-10-11 (UTC+7). Branch `dgs-134`.

## Built
- `FrontdoorClient.createField(body)`: `POST /customFields/v2/field?ignore_existing=true`. Types `FrontdoorFieldCreateBody` and `FrontdoorFieldCreateOption`.
- `dg clickup create-field --name <n> --type drop_down --option <name>[:<color>]... --folder <id> [--description <t>] [--yes]`. A dry run unless `--yes`; it prints the call (no header). With `--yes` it prints the field id and each option id. The folder scope uses `category_id` in the create body; no location call.
- The public API (v2, v3) cannot create custom fields, so Frontdoor is used.
- Tests: client 1 new, CLI 14 new; whole repo passes with `FORCE_COLOR=1`; CLI build clean.

## Not built
- `setFieldLocations`: dead code without `--list`. `--list` is refused with a clear message (the list location type is not captured).
- No allow rule (like create-folder, create-list, update-field).

## Review
Claude whole-branch review, two verified finds, fixed with tests: (1) a bare 3-digit hex tail such as `Plan:add` was read as a colour, now only `#rgb`, `#rrggbb` or `rrggbb` count; (2) a repeated `--name`, `--folder` or `--description` gave a poor error, now refused with a clear one.

## Follow-ups
- Capture the list location type (PUT `.../fields/{id}/locations`), then build `--list` and `setFieldLocations`.

## First use
Pending at the time of this report; see the maestro report for the field id and option ids.
