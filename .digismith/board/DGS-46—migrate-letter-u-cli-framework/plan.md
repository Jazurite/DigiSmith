# DGS-46 plan: Migrate Letter U (CLI command framework), checkpoint 1

Written 2026-10-10 (UTC+7). Read-only. No ClickUp write, no git change. Waiting for "approved: checkpoint 1".

## 1. Every U sub-item (current meaning)
Letter U (current meaning, from 2026-09-19) has one sub-item: U.1. No U.2 or later exists in MEMORY.md, history.html, docs or git.
Retired meaning (toolchain, merged into G.2 on 2026-09-11) is DGS-193 and DGS-194 in clan E. Not mapped again.

| Source | Item | Date (UTC+7) |
|---|---|---|
| MEMORY.md row U, history.html | U.1 CLI Domain Framework: `packages/cli` dispatcher moves from a hand-rolled `GROUPS` map to a yargs bucket/leaf `CommandModule` framework (like HubSpot `hs`), plus a branded `--help` (`src/lib/brand-help.ts`). Adds `yargs`, `picocolors`; reverses V.4's "zero runtime deps" | shipped 2026-09-19 |
| git `6a0dd06`, `fa110b9`, `d4592b8`, `c5aad89`, `7a69ed4`, `fb031a7`, `0bb39e3`, `e9df646`, `da0d933` (+ review fixes `d03948d`, `95504f8`, `e8799f4`, `508a2d2`) | design, plan, deps + brand renderer, root dispatcher migration, final fixes, ownership close-out, report | all 2026-09-19 |
| `.digismith/docs/U/U.1-formatstructure/` | `design.html`, `plan.md`, `report.html` | 2026-09-19 |
| `backlog/cli-decouple-from-depot-u.md` | the decision (Jack, 2026-09-19) that the CLI is its own letter, split from Depot's V lineage. Fulfilled by U.1; not a separate build | 2026-09-19 |
| `backlog/docs-convention-letter-nesting.md` | piloted on U.1 (`docs/U/U.1-...`). Docs convention, not a CLI item. Belongs to the docs standard (clan E), not mapped here | n/a |
| `backlog/cli-version-shorthand-flags.md` | idea: `-v`/`-V` as `--version`. Source V.4, found 2026-09-12. Status idea; may be solved by yargs (not verified) | not built |
| `backlog/cli-plugin-cache-missing-deps.md` | finding 2026-10-02: plugin-cache copy of the CLI fails, `yargs` missing. Follow-up of U.1's new dependency | not built |

Not U: the V-lineage CLI builds (VPS CLI, npm package, depot group = DGS-6, DGS-7, DGS-8 in D.2) and the later `dg clickup` and `dg shopee` commands (D.3 / C.2 / their own tickets). Their later work uses U.1's framework but is not letter U.

## 2. Tickets (all after Jack's yes)
Status `done`, start = due = ship date, unless noted.

| # | Name | One sentence | Ship date | Attach |
|---|---|---|---|---|
| 1 | CLI domain framework with branded help (U.1) | `@digismith/cli` dispatches through a yargs bucket/leaf `CommandModule` framework with a branded `--help`; every command keeps its argv shape; the CLI is now owned apart from Depot. | 2026-09-19 | `design.html`, `plan.md`, `report.html` from `docs/U/U.1-formatstructure/` |
| 2 (optional) | CLI: accept `-v` and `-V` for `--version` | Idea from 2026-09-12; status `backlog`, no dates. Check first whether yargs already covers it. | none | `backlog/cli-version-shorthand-flags.md` |
| 3 (optional) | CLI: the plugin-cache copy cannot run without `node_modules` | Finding from 2026-10-02: `yargs` is missing in the plugin cache; status `backlog`, no dates. | none | `backlog/cli-plugin-cache-missing-deps.md` |

The decouple decision folds into ticket 1's description (no ticket of its own). Recommended: ticket 1 only; 2 and 3 only if Jack wants open ideas tracked.
(Not a new ticket in Imperium. The epic DGS-25 and DGS-46 stay as they are.)

## 3. Jack's question: clan or lineage
### C.2: CLI (clan C: Platform, list `1301150000002952`)
Description: "the dg command line: the command framework, its conventions and its tests. Each command group belongs to the lineage of the feature it operates."
Tickets found by `dg clickup list-tasks` (closed and subtasks included): **3**, not 6. (The order said 6; the list returns 3.)
| Ticket | Status | Content |
|---|---|---|
| DGS-197 | done 2026-10-08 | `dg clickup` `--parent` flag |
| DGS-196 | done 2026-10-07 | `dg shopee import-orders` |
| DGS-117 | backlog | make dg depot's process lifecycle and the `--help` e2e test isomorphic |
No U history is in C.2 yet. None of the three is letter U.

### D.2: CLI & Packaging (clan D: Depot, list `1301150000002236`)
Holds 6 tickets: DGS-6 VPS session CLI, DGS-7 `@digismith/cli` npm package, DGS-8 `dg depot` command group (all V history), and DGS-244..246 jira-client (I.1, I.5, I.6; they are also CLI-shaped but belong to I).
Fit: D.2 is "Depot's CLI and npm publishing surface" (Depot's own commands and the publish path). C.2 is the framework and conventions for every command group.

### How they differ
- D.2 = what Depot ships through the CLI (VPS, depot group, npm publish). Owned by Depot's lifecycle.
- C.2 = the CLI itself: dispatcher, yargs framework, help, conventions, tests. Any command group plugs in.
- U.1 is exactly the C.2 side: it split the CLI from Depot (decouple decision). Overlap: the npm package DGS-7 (publishing) and the depot group DGS-8 stay in D.2; they are consumers of U.1.

### Options
(a) **Lineage C.2.** Fits the description word for word; no new folder; the clan has a Pavilion. Only costs: one more ticket (plus optional 2 and 3) in a list with 3 now.
(b) **New clan for the CLI.** Letter U has exactly one shipped item; a clan with one history ticket plus a Pavilion and one lineage is mostly empty lists (rule: no empty lists). Clan C already houses the CLI.

**Recommendation: (a), put the U tickets in C.2.** Add a line to DGS-7 and DGS-8 ("consumers of U.1, see the C.2 ticket") only if Jack wants cross-links; I write nothing into them without a yes.

## Questions for Jack
1. Target: C.2 (recommended) or a new clan?
2. Ticket 1 only, or also tickets 2 and 3?
3. Cross-link tickets 1 to DGS-7 and DGS-8?
