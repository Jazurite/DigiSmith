# Plan: DGS-134 `dg clickup create-field`

## Public API check
Done 2026-10-11. ClickUp's public API (v2, v3) has no create-custom-field endpoint: it can list fields and set values only (developer.clickup.com/docs/customfields; feedback.clickup.com "Custom Field Creation via API"). The repo's public client has only `getListFields` and `setCustomField`. So Frontdoor is right. No stop needed.

## The call
1. `POST /customFields/v2/field?ignore_existing=true`. Body (ticket, captured 2026-10-02): `name`, `description`, `type: "drop_down"`, `type_config {new_drop_down: true, sorting: "manual", options: [{id: null, name, color, orderindex: null}]}`, `category_id: <folder id>`, `required`, `required_on_subtasks`, `pinned`, `private`, `hide_from_guests` all false, `permission_level: null`, `members: []`, `groups: []`. 200 = the field, option ids, orderindex 0..n.
   - The 2026-10-10 capture also sent `team_id`; the 2026-10-02 proven call sent `category_id` and no `team_id`. I send `category_id` only (the proven folder shape).
2. `PUT /field/v3/experience/workspaces/{workspace}/fields/{id}/locations`: only for a second location or a list. NOT used for `--folder` (category_id sets it, confirmed 2026-10-02).
3. Read-back: the command prints the response; I verify with `list-fields` (public API) on I.4 and I.5.

## Client (`packages/clickup-client`)
- `types.ts`: `FrontdoorFieldCreateBody` (above), `FrontdoorFieldCreateOption {id: null; name; color; orderindex: null}`.
- `frontdoor.ts`: `createField(body): Promise<FrontdoorField>` (POST above). `setFieldLocations(...)`: NOT built. It would be dead code: no `--list` (see below). I will say so in the report; the ticket's wording lists it, so tell me if you want it built anyway (typed `{type: 5|7, id}`, 204).
- Test: a client test like the existing `updateField` one (path, method, body, 401 -> FrontdoorAuthError).

## Command (`packages/cli/src/clickup/create-field.ts` + `.test.ts`, registered in `index.ts`)
`dg clickup create-field --name <n> --type drop_down --option <name>[:<color>] ... --folder <id> [--description <t>] [--yes]`
- `--type`: only `drop_down` (choices); others refused with a clear message.
- `--option`: repeatable, at least one. Split at the LAST `:` only when the tail looks like a hex colour (`#rgb`/`#rrggbb`, with or without `#`; stored with `#`), so a name with a colon is safe. No colour = a default palette cycled by position: `#7C4DFF #1bbc9c #F9D900 #e50000 #0079bf #ff7800 #81b1ff #b5bcc2`.
- Validation: name non-empty; no empty option name; no duplicate option names (case-insensitive); `--folder` required and numeric.
- `--list`: refused: "--list is not supported yet: the list location type is not captured (DGS-134). Use --folder." Proposal: park a follow-up ticket to capture the list type (link to DGS-134). Say if you prefer otherwise.
- Dry run (no `--yes`): `printCall("POST", "/customFields/v2/field?ignore_existing=true", body)` (reused from `task-type-write.ts`) + "nothing sent; add --yes to send". No network read in the dry run.
- Duplicate guard: ignore_existing=true means ClickUp may return an existing field. The command prints the id so the caller sees it; the first-use steps below check for an existing Profile first.
- `--yes`: prints `field <id>` and one line `option <id> <name> (orderindex n)` per option. Exit 0; errors `clickup create-field: <msg>`, exit 1 (like update-field).

## Tests (tests first, see them fail)
Fake client `{createField}` like `update-field.test.ts`: dry run sends nothing and prints the body; `--yes` sends the exact body (colour parse, default colours, order); prints field and option ids; refuses `--list`, non-drop_down, no option, duplicate option, empty name; error path sets exit code 1. `index` help lists the command; `index.e2e.test.ts` with `FORCE_COLOR=1`.

## Allow rule
`.claude/settings.json` has allow rules for `create-task-type`, `update-task-type`, `move-folder`, `move-list`, `add-dependency`, `add-link`, but NONE for `create-folder`, `create-list` or `update-field` (the nearest siblings: fields, create). Proposal: add NO rule; the command is a dry run unless `--yes`, and Jack's call decides per use. Say if you want `Bash(dg clickup create-field:*)`. No rule for any delete.

## First use (after merge + push)
1. `dg clickup list-fields 1301150000002907` (I.4) and `... 1301150000002253` (I.5). If any field named Profile exists: STOP and report.
2. Dry run: `dg clickup create-field --name Profile --type drop_down --option DigiSmith --option Emma --option Jazurite --option Personal --folder 1301150000002921` and check the body.
3. Same with `--yes` (retry once on a 404 and say so). Note the field id and option ids.
4. Read back with `list-fields` on I.4 and I.5: Profile with 4 options in order.
5. `dg clickup update-task 14zcebrunt8` status `done`, start and due `2026-10-11T04:00:00+07:00` (flags from `--help`), read back with `get-task`.

## Later steps
Branch `dgs-134` in `.worktrees/dgs-134` from origin/main, pnpm only, Claude whole-branch review, report.md + report.html with my own pins, rebase, `FORCE_COLOR=1 pnpm test`, CLI build, ff merge, hooks 01-03, rebuild, `--help` check, push, first use, cleanup.
