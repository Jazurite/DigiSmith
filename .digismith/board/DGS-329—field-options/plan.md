# DGS-329 plan: --add-option and --remove-option on dg clickup update-field

Worker `dgs-329`, 2026-10-11. Checkpoint 1: no code yet.

## The captured calls (read with `dg clickup frontdoor dump`, request line and body only)
The ticket says add is call [91] of `Raw_10_03_2026_13_50_53.folder`. It is not there. The add call [91] is in `Raw_10_10_2026_12_19_58.folder`. The remove call [240] is in the 03 folder as written.

Both are `PUT /customFields/v2/field/{id}`, the same full-field body the rename already sends (`buildFieldPutBody`). Only `type_config.options` differs:

| change | `options.add` | `options.update` | `options.rem` |
|---|---|---|---|
| add (call [91]) | `[{ "name": "34", "color": "#cecece", "orderindex": 2 }]` | `[]` | `[]` |
| remove (call [240]) | `[]` | `[]` | `["0a5de2e9-a34c-4786-805e-a5798daa7f3c"]` |

- Add needs the name, a colour and an orderindex. No id: ClickUp assigns it. The orderindex was the next free one (2 after options 0 and 1), so the tool sends `max(orderindex) + 1`. The web app's default colour `#cecece` is the default for `--color`.
- Remove needs the option id only (a bare uuid string in `rem`). The CLI accepts a name or an id and resolves it to the id, like `--option` does today.
- The existing `FrontdoorFieldPutBody` type already has `add` and `rem`. The client needs no change (so no clash with DGS-333 on `frontdoor.ts`).

## What ClickUp does to values of a removed option
Before the remove call the web app sends `GET /customFields/v2/field/{id}?count_values=true&option_id=<id>` (call [235]). The answer is the whole field plus `"value_count": "<n>"`, a string: the number of tickets that hold this option. In the capture it is `"0"` (Maestro, unused). The remove response [240] is the field without the option; it says nothing about the tickets.
What happens to the tickets' values is not in any capture (count 0). I will not guess: I cannot confirm it without a real removal, which the rules forbid. So the dry run says: "N ticket(s) hold this option; removing it will change their value (what ClickUp does to them is not captured)". Jack can correct the wording at the first real use.

## Flags
- `--add-option <name>` (repeatable) with `--color <#hex>` (one colour for all adds in the call; default `#cecece`). A name that already exists (case-insensitive) is an error.
- `--remove-option <name|id>` (repeatable). Unknown or ambiguous: error with the option list, like `--option`.
- Can combine with `--name` and `--option` in one call (one PUT). An option cannot be both removed and renamed (error). A removal that leaves a name clash with an add or rename: checked on the final names.
- With `--yes`, a removal also needs `--confirm-remove "<name>"`: see "Delete safety" below.
- `nothing to change` error now says "pass --name, --option, --add-option or --remove-option".

## Dry run (default, no --yes)
```
field b04c67e0-... "Profile" (drop_down)
  current options: DigiSmith (d064...), Emma (2206...), Jazurite (f33a...), Personal (a2a4...)
  add option "Maestro" #F9D900 at position 4
  remove option "Maestro" (0a5d...)
  WARNING: 3 ticket(s) hold "Maestro"; removing it changes their value (what ClickUp does is not captured)
PUT /customFields/v2/field/...   { ...body... }
nothing sent; add --yes to send
```
The dry run reads the field, and for each `--remove-option` it makes the `count_values` GET (a read, so a dry run stays safe). With `--yes` the same count is printed as a warning line before the PUT.

## Delete safety (the allow rule)
`update-field` also adds options, so `Bash(dg clickup update-field:*)` as an allow rule would allow a removal too.
Solution: **no allow rule for `update-field`** (there is none today; I add none). Every `update-field` call, add or remove, stays a permission prompt. That keeps removal gated by Jack's answer with no pattern to get wrong (a flag-matching rule like `*--remove-option*` is bypassable: `--remove-option=x`, other spellings, `pnpm`/`node` wrappers).
Extra belt, no settings edit now: `--remove-option` with `--yes` fails unless `--confirm-remove "<option name>"` repeats the name, so no copied command removes by accident. I suggest also an `ask` rule `Bash(dg clickup update-field *--remove-option*)`, only after your approval; I do NOT touch `.claude/settings.json`.
Cost: an add (a dry run too) prompts. The first use is one dry run, so that is fine. If you want prompt-free adds later, the clean way is a separate `add-option` command; I did not choose it because the ticket and DGS-135 put both on `update-field`.

## Mocked tests (`update-field.test.ts`, mock FrontdoorClient only; remove is NEVER run for real)
1. add builds `options.add` with name, colour, next orderindex; rest of the body equals the read.
2. add default colour `#cecece`; `--color` sets it.
3. add of an existing name (any case) errors.
4. remove by name and by id puts the id in `rem`; unknown and ambiguous names error.
5. remove and rename of the same option errors; add + rename + name in one call is one PUT.
6. dry run prints current options, the plan, the used-option warning (count from a mocked `count_values` read) and sends nothing; no warning when the count is 0.
7. `--yes` with remove and no `--confirm-remove` errors and sends nothing; with it, one PUT.
8. `nothing to change` message; non-dropdown still refused.
Client: a test for the new `getFieldValueCount(id, optionId)` call (GET with `count_values=true&option_id=`), the one small addition to `frontdoor.ts`.
Report per-describe test counts against the base after editing the test file (base: 6 tests in `update-field`).

## Commits (one per call, title only)
1. `feat(clickup-client): read how many tickets hold a field option`
2. `feat(cli): dg clickup update-field --add-option and --color`
3. `feat(cli): dg clickup update-field --remove-option with a used-option warning`
4. `docs(dgs-329): plan and implementation report` (plan.md and report.html together)

## First use (after merge, by the maestro)
`--add-option` dry run only, on Profile (I: Account, `b04c67e0-c531-476b-b984-6670760ac0fd`). No real add, no remove.

## Master's ruling at checkpoint 1 (2026-10-11)
- Approved. Add and remove in one PUT; `getFieldValueCount` is a read-only GET.
- No allow rule and no ask rule for `update-field`; `.claude/settings.json` is not touched. The permission question for `--remove-option` is parked for Jack. Every call prompts as today.
- `--confirm-remove "<name>"` (exact match) approved: with `--yes`, a missing or wrong confirm exits 1 and sends nothing.
- `--remove-option` is tested with mocks only. Its first real use waits for Jack to name the field and option.
- Correction: the base had 12 tests in `update-field` (the `it.each` cases count), not 6.
