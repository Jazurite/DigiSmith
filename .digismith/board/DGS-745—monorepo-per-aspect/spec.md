# DGS-745 Spec: DigiSmith monorepo, a package per Aspect

Ticket: DGS-745 (parent DGS-740 Development Procedures). Sign-off Auto, Mode Manual.
Written 2026-11-14 by the refine worker dgs-745-refine. Refinement only: no code moves in this ticket.
Facts below come from the main checkout on 2026-11-14 (commit 32ecb0c6). Items I did not verify are marked **Unverified**.

## 1. Settled by Jack (not reopened)

- One pnpm workspace.
- `aspects/scripture` = `@digismith/scripture`. `aspects/oculus` = `@digismith/oculus`.
- `libs/clickup-client` = `@digismith/clickup-client`. `libs/jira-client` = `@digismith/jira-client`.
- Changesets gives each package its own version and changelog.
- The suite manifest is out of scope.
- The separate Oculus repo is dropped. Oculus tracks in the OCU space. Scripture and the roadmap track in DGS.

## 2. Target layout

```
aspects/scripture/        @digismith/scripture   plugin + dg CLI (public candidate)
  .claude-plugin/plugin.json
  skills/ hooks/ standards/ profiles/ vendored/
  scripts/                (Scripture-owned scripts, section 4)
  src/                    (today's packages/cli/src, Scripture part)
aspects/oculus/           @digismith/oculus      the factory engine (private)
  src/                    (Oculus part of packages/cli/src)
  scripts/                (Oculus-owned scripts, section 4)
libs/clickup-client/      @digismith/clickup-client
libs/jira-client/         @digismith/jira-client
apps/nexus-api|nexus-web|nexus-shared/           (section 4, one taste flag in section 11)
.claude-plugin/marketplace.json    stays at the repo root, source -> ./aspects/scripture
.changeset/               Changesets config and pending change files
.digismith/               board, hooks, config: repo-level, stays at the root
docs/ toolchain.yml CLAUDE.md pnpm-workspace.yaml
```

Workspace globs: `aspects/*`, `libs/*`, `apps/*`.

## 3. Decision 1: where `packages/cli/src` goes

Import edges were counted with `grep` over non-test files. Today only **one** Scripture-side file imports Oculus code: `run/limit-check.ts` (imports `autonomous/guardrails`, `autonomous/state`, `conductor/drivers`). Everything else already flows Oculus to Scripture. That makes a clean split possible.

| Folder / file | Lines (src+tests) | Destination | Why |
|---|---|---|---|
| `index.ts` (dispatcher) | 82 | Scripture | Owns the `dg` binary. Static imports of Oculus groups are replaced by the forward table (section 5). |
| `ticket-key.ts` | 6 | Scripture | Used by autonomous, run, salvage. |
| `lib/` (brand-help) | 50 | Scripture | Dispatcher help text. |
| `shared/` (digismith-repo) | 120 | Scripture | Used by `vps`. |
| `clickup/` | 13029 | Scripture | ClickUp commands over `@digismith/clickup-client`. Steward and Oculus use it. |
| `tokens/` | 4534 | Scripture | Token ledger. `clickup` imports it 17 times. Token Economics gets its own package only when it has its own code. |
| `steward/` | 2439 | Scripture | Imports only `clickup` and `tokens`. |
| `reviewer/` | 1689 | Scripture | Imports nothing. Reviewer skill and verdict files. `tokens` and Oculus read its verdict types. |
| `sessions/` | 353 | Scripture | Session cleanup. No imports. |
| `depot/` | 1110 | Scripture | Backs the `digismith:depot` skill. Imports only its own `process-lifecycle`. |
| `vps/` | 1458 | Scripture | VPS session CLI. Skill-driven. |
| `shopee/` | 1580 | Scripture (temporary) | Shopee order import. Belongs to neither Aspect. It stays in Scripture and is excluded from the public fraction (section 8). A later ticket may give it a home. |
| `run/` (record layer: `paths`, `events`, `record`, `read`, `schema`, `role`, `seat`, `hook`, `auto`, `label`, `lifecycle`, `identity-folder`, `repo-info`, `run-index`, test helpers) | ~2900 | Scripture | The SessionStart hook writes a run for every session that has the plugin. Oculus reads these files (`run/README.md`: "Oculus and later tickets read these files and nothing else"). Writer = Scripture, reader = Oculus. |
| `run/` dispatch part (`start` and `limit` commands in `run/index.ts`, `limit.ts`, `limit-check.ts`) | ~550 | Oculus | The concurrency count reads the factory lock and the conductor driver. It is factory policy. First step: move it to `src/dispatch/` inside Scripture (move ticket 4), then out (ticket 7). |
| `autonomous/` | 12197 | Oculus | The factory loop. |
| `conductor/`, `conductor-registry/` | 862 + 348 | Oculus | Registry is used by conductor, autonomous and `scripts/conductor`. |
| `nightwatch/` | 1024 | Oculus | Reads run records. Imports `autonomous` 13 times. |
| `oculus/` | 1807 | Oculus | The `dg oculus view` command. |
| `salvage/` | 535 | Oculus | Imports `autonomous`. |

Size: about 16.8k of 46.6k lines (36%) go to Oculus.

`run/index.ts` composes six commands: `start`, `event`, `list`, `limit`, `show`, `tail`. Only `start` and `limit` use `limit-check`. **Unverified:** I did not read `start`'s body in full. Ticket 4 confirms the cut before it moves anything.

## 4. Decision 2: scripts and the Nexus

Scripts are split by who owns the behaviour, not by where they sit today.

**Scripture** (`aspects/scripture/scripts/`): `session-cards/`, `session-init.ts`, `run-events/`, `workbox-health/` (the four that `hooks/hooks.json` runs through `${CLAUDE_PLUGIN_ROOT}/scripts/`); the loose skill-support files (`board-path`, `catch-up`, `config*`, `identity*`, `notes-*`, `session-*`, `voice*`, `preferences`, `toolchain`, `fill-template`, `check_vendored_skills`, `model_offload`, `lineage-handoff`, `depot-dir`, `cli-args`); `git-hooks/`; `claude-account/`; `agentic-bridge/`, `runners/`, `providers/` (offload-implementer); `token-counter/` (Token Economics, no package yet); `demo/`.

**Oculus** (`aspects/oculus/scripts/`): `conductor/` (catch-up, consult, flux, idle-check, watch), `herdr/`, `opencode-boot/`.

**Nexus** (`scripts/nexus-api`, `nexus-web`, `nexus-shared`): moves to `apps/nexus-api`, `apps/nexus-web`, `apps/nexus-shared`. Reasons:
1. Nexus is the Public Edition pillar (DGS-406: the CLI and Nexus ship publicly). It is not the Software Factory.
2. It has **no code import** from `packages/cli`. `nexus-api` reads Oculus data by running `dg oculus view` and `dg nightwatch view` and parsing JSON (`nightwatch-reader.ts`, `oculus-reader.ts`). That is already the process contract of section 5.
3. Its package names `@digismith/nexus-*` already exist and are `private: true`, so they need no new version until Nexus has its own epic.
Install files (`*.plist.tmpl`, `install.sh`) move with it. `scripts/caddy/` follows the Nexus if it fronts the Nexus API. **Unverified:** I did not read the Caddyfile. Ticket 8 checks it first.

Three files outside `scripts/` reference conductor or herdr scripts (`catch-up` skill, `CLAUDE.md`, one doc). Ticket 7 rewrites them to call `dg conductor ...`, never a path into Oculus.

## 5. Decision 3: the boundary

**Dependency direction (enforced by a test):**

```
libs  <-  scripture  <-  oculus
apps (Nexus) depend on nothing in aspects; they call dg.
```

- `libs/*` import no aspect.
- `@digismith/scripture` imports only `libs/*`. It never imports Oculus code.
- `@digismith/oculus` imports `libs/*` and Scripture, **only through Scripture's declared `exports`**: `./run`, `./tokens`, `./steward`, `./clickup`, `./reviewer`, `./ticket-key`. A deep import into `scripture/src/...` fails the test.
- Nexus imports no package from `aspects/*`.

**How Scripture calls Oculus: the `dg` command line, JSON on stdout. Nothing else.**
- The `dg` dispatcher lives in Scripture. It holds a **forward table** of command prefixes: `autonomous`, `oculus`, `conductor`, `nightwatch`, `salvage`, `run start`, `run limit`. When one matches, `dg` runs the `oculus` binary (shipped by `@digismith/oculus`) with the same arguments and passes through stdout, stderr and the exit code. If the binary is not installed, `dg` prints one line: `<group> needs @digismith/oculus` and exits 1.
- Skills and hooks keep today's words (`dg autonomous ...`, `dg run start ...`). No user-visible change.
- Shared state travels as **files** with a versioned schema, never as an import. The run record (`nightwatch-run/v1`, `~/.digismith-depot/runs/`) is the model. The factory lock and limits file are the same kind of contract.

Reasons for this choice over a package API for Scripture to Oculus:
1. The Scripture package must install and run with Oculus absent (public fraction, section 8). A code import breaks that. A process call degrades with one clear line.
2. The pattern already works: Nexus reads Oculus this way today.
3. A process hop costs one Node start (about 100 ms, **Unverified**). The forwarded commands (`start`, factory groups) are called rarely, not in hot hooks.

Oculus to Scripture stays a code import (through `exports`) because Oculus is private and always ships with Scripture. It also keeps the type checks.

## 6. Decision 4: the plugin root

Target: `aspects/scripture/` is the plugin. `.claude-plugin/plugin.json`, `skills/`, `hooks/`, `standards/`, `profiles/`, `vendored/` and Scripture's `scripts/` move together under it. The repo-root `.claude-plugin/marketplace.json` stays and changes `"source": "./"` to `"source": "./aspects/scripture"`.

Why move everything together: skills find their scripts by relative path (`init` uses "two levels up from this skill's base directory", then `scripts/board-path.ts`) and hooks use `${CLAUDE_PLUGIN_ROOT}/scripts/...`. If `skills/`, `hooks/` and `scripts/` move as one unit, every relative link keeps working. The plugin cache then holds Scripture only, so an Oculus change no longer touches the plugin the sessions load. That is the problem DGS-745 exists to fix.

Risk: the install source changes. **Unverified:** that `claude plugin marketplace update` plus `claude plugin update` follows a changed relative `source` for an installed plugin. Relative subfolder sources are a standard marketplace pattern, but I did not test it. Ticket 6 therefore starts with a probe against a throwaway marketplace in a scratch repo, and only then switches the real one. The probe touches `~/.claude`, so the conductor or Jack runs it, not a worker.

The version in `plugin.json` and `marketplace.json` is no longer edited by hand or by the diff-based bump script. It is copied from `aspects/scripture/package.json` by one sync script (section 7). The two numbers must be equal, because `claude plugin update` detects change by version.

## 7. Decision 5: depot paths and the `dg` shim

**Depot paths.** 14 files under `skills/`, `hooks/`, `scripts/`, `standards/`, `profiles/` and `CLAUDE.md` hard-code `~/.digismith-depot/repo/packages/...`: 37 references to `packages/cli/src/tokens/...` (the `entry.ts` call in the init skill is one) and 10 to `packages/jira-client/src/cli.ts`. The depot clone is sparse (`git sparse-checkout list` shows only `packages`).

Decisions:
1. Rewrite the paths mechanically in the ticket that moves the package (`packages/cli/src` becomes `aspects/scripture/src`, `packages/jira-client` becomes `libs/jira-client`). Each move ticket carries its own rewrite, so no skill ever points at a missing path.
2. Add a repo test that fails on any string `packages/cli` or `packages/jira-client` in `skills/`, `hooks/`, `scripts/`, `standards/`, `profiles/`, `CLAUDE.md`, after the move. This catches the next stale reference.
3. Ticket 1 extends the depot sparse-checkout to `aspects libs apps` while `packages` still exists. That change is harmless before the move and required after it.
4. Plugin cache and depot clone update separately. A running session on an old plugin version still calls `packages/cli/...` after the move. So ticket 3 leaves **`packages/cli` as a symlink to `aspects/scripture`** for one release cycle, and ticket 9 removes it. Hook 02 (plugin reinstall) gets one added step: `git -C ~/.digismith-depot/repo pull --ff-only`, run before the plugin update.

**The `dg` shim.** `/Users/workbox/Library/pnpm/bin/dg` runs `.../global/v11/<hash>/node_modules/@digismith/cli/dist/index.js`: a **built copy installed by pnpm globally**, not a link to the repo. After the rename it is stale. Decisions:
1. The `dg` and `digismith` bins belong to `@digismith/scripture` (same `bin` map as today). The name `@digismith/cli` is retired.
2. Ticket 3 ends with a reinstall step: `pnpm remove -g @digismith/cli` then the global install of `@digismith/scripture` from `aspects/scripture`. That touches Jack's installs, so the conductor runs it, not a worker.
3. Ticket 7 adds the second global bin `oculus` the same way.
4. **Unverified:** whether `@digismith/cli` was ever published to npm (`publishConfig` says public). Ticket 3 checks with `pnpm view @digismith/cli`. If it exists, deprecating it is a public action and goes to Jack.

## 8. Decision 7: public fraction (DGS-406) stays separable

DGS-406 is still a concept. It says the public fraction is the plugin (Marketplace pillar) and the CLI and Nexus (Public Edition pillar); the engine stays private. This spec only has to keep that cut possible. Rules:

1. Public candidates: `@digismith/scripture` (minus `shopee`), both libs, the Nexus apps. Private: `@digismith/oculus`.
2. The direction rule of section 5 is the separability rule: a public package never imports a private one. The boundary test (ticket 1, red-listed until ticket 4) fails the build on a breach.
3. `aspects/oculus/package.json` sets `"private": true`. Changesets lists nothing as published for it.
4. Scripture runs with Oculus absent. Ticket 7 includes a test that runs `dg` with the `oculus` binary missing and checks the one-line message.
5. `shopee/` and any other non-public folder go into one list file, `aspects/scripture/public-exclude.txt`, that the future publish path (a DGS-406 ticket) reads. This spec does not build the publish path.

## 9. Decision 6: Changesets, post-finish hook 01, DGS-707

**The constraint that shapes this.** Hook 02 runs `claude plugin update`, and that command only refreshes the cache when the version changed. So Scripture must still get a new version on **every merge that changes Scripture**. Versioning only at epic close would stop plugin updates in between. Changesets therefore declares the change; `changeset version` runs per merge.

**New flow:**
1. A ticket that changes a package adds `.changeset/<ticket-key>-<slug>.md` in its branch: the package name(s) and a level. Task = `patch`. A ticket touching only Oculus never names Scripture, so the Scripture version and the plugin cache do not move. A helper writes the file: `dg changeset add --ticket <key> --package <name> --level <patch|minor|major>`. The `report-implementation` step calls it, and the file is committed with `report.html` and `plan.md` (the existing "commit with the report" rule).
2. Hook 01 (version bump) is rewritten. After the merge it runs `pnpm changeset version`, then the sync script that copies `aspects/scripture/package.json` version into `plugin.json` and `marketplace.json`, then commits `chore: version packages` by pathspec and pushes. It replaces `bump-plugin-version.ts`, which infers the bump from the merge diff. It keeps the pinned-range guard and the stop-on-failure rule of today's hook.
3. Hook 01 prints `BUMPED scripture` only when the Scripture version changed. Hook 02 runs the plugin update only then. Hook 03 (history) records the package and version per entry. No other change to 03.
4. Epic close (the "bump, note, tag, GitHub release" procedure): the epic's closing ticket adds a `minor` changeset for its package. The tag keeps today's form for Scripture (`vX.Y.0`) and uses `oculus-vX.Y.0` for Oculus. `CHANGELOG.md` per package comes from Changesets and feeds the release note.
5. Baselines: `@digismith/scripture` starts at the current plugin version (1.82.0 at 2026-11-14). `@digismith/oculus` starts at `0.1.0`: it has never released.

**Relation to DGS-707** (read only; I do not edit it). DGS-707's version half (patch = task, minor = epic, major = arc, from the ticket type) becomes the rule that picks the `--level` in step 1. Its focus-check half is unchanged. The saga/arc reset rule in DGS-707 was written for one plugin number. With per-package versions it applies to Scripture only, until a suite manifest exists (out of scope here). Whether Oculus gets saga/arc majors is a question for DGS-707. The conductor should note this on DGS-707 so it is retargeted rather than built twice.

**Changesets itself** (ticket 5): `@changesets/cli` as a root devDependency, `.changeset/config.json` with `access: restricted`, `baseBranch: main`, `ignore` for the Nexus apps and any private package that should not version, `updateInternalDependencies: patch`. pnpm only. **Unverified:** the exact `workspace:^` range behaviour of `changeset version` with `@digismith/clickup-client`; ticket 5 includes a dry run on a scratch copy before the hook is switched.

## 10. Decision 8: ordered move tickets

All tickets are separate. **Every one is blocked by DGS-699 (Director) merging**, and each is blocked by the one before it unless noted. Every one needs the factory idle (no worker in a worktree off main) and runs Mode Manual. The conductor files them after the Maestro approves this spec (ClickUp writes are the conductor's). Proposed parent: DGS-745, as sub-tasks; the conductor may file them under epic DGS-740 instead.

| # | Ticket | Size | Notes |
|---|---|---|---|
| 1 | Workspace skeleton: globs `aspects/* libs/* apps/*`, empty `aspects/scripture` and `aspects/oculus` package shells, depot sparse-checkout extended, boundary test written and listing today's one violation as a known failure | S | No code moves. Tests first. |
| 2 | Move `packages/clickup-client` and `packages/jira-client` to `libs/`; fix the vitest alias, the `pnpm --filter` build line, 10 jira paths in skills | S | Needs 1. |
| 3 | Move `packages/cli` to `aspects/scripture` whole (`git mv`, package renamed `@digismith/scripture`); rewrite the 37 depot paths; leave `packages/cli` as a symlink; stale-path test; global reinstall of `dg`; npm check | M | Needs 2. The reinstall and the npm check are conductor / Jack steps. |
| 4 | Cut the one Scripture to Oculus edge inside the package: move `run` dispatch (`start`, `limit`, `limit.ts`, `limit-check.ts`) to `src/dispatch/`; boundary test goes green | S | Needs 3. Confirms the `run/index.ts` cut first. |
| 5 | Changesets: install, config, `dg changeset add`, `report-implementation` step, rewrite hooks 01 and 02 (and the 03 version field), sync script, baselines | M | Needs 4. Dry run on a scratch copy first. Protected path (release flow). |
| 6 | Plugin root: probe a throwaway marketplace, then move `.claude-plugin/plugin.json`, `skills/`, `hooks/`, `standards/`, `profiles/`, `vendored/`, Scripture `scripts/` under `aspects/scripture`; switch the marketplace `source`; fix `hooks.json`, `CLAUDE.md`, docs | L | Needs 5. The probe and the real plugin update touch `~/.claude`: conductor / Jack. |
| 7 | Split Oculus: create the package, move `dispatch/`, `autonomous/`, `conductor*`, `nightwatch/`, `oculus/`, `salvage/` and the Oculus scripts; Scripture `exports`; forward table; `oculus` bin and its global install; rewrite the 3 conductor/herdr references; Oculus-absent test; `private: true` | L | Needs 6. Biggest conflict surface, so it goes last of the Aspect moves. |
| 8 | Move the Nexus to `apps/`; check and move `scripts/caddy`; fix install scripts and plist templates | M | Needs 1 only. Can run beside 5 to 7. LaunchAgent, Caddy and DNS changes are not part of it: file paths only, and the installed copies are reinstalled by Jack. |
| 9 | Remove the `packages/cli` symlink and the old `packages/` folder | S | Needs 7. **A delete: needs Jack's order for that exact target.** Gate: one night passed since ticket 3 and no live session on a plugin version older than ticket 3. |

Parallel runs: only 8 runs beside the chain. Merges are serial. DGS-744 (factory reads both spaces) is independent. It should land before ticket 7, because ticket 7 moves the scan code it changes; the conductor decides the order.

Each ticket's "done" evidence: the full test suite green, the stale-path test green, and one real call of each moved entry point (`dg tokens ...`, `dg autonomous ...` through the forward table, a hook firing).

## 11. For the Maestro: items that need a word

1. **Taste (one):** the new top-level folder name `apps/` for the Nexus. Default if no answer: `apps/`. Jack settled `aspects/` and `libs/` only.
2. **Approval, not taste:** tickets 3, 5, 6 and 7 touch the plugin install, the release flow or Jack's global installs. Mode Manual covers this. The conductor needs Jack's go for the reinstall and probe steps.
3. **For DGS-707:** the note in section 9 (version rules per package, saga/arc scope).

## 12. Not in this ticket

Moving any code. The suite manifest. DGS-744 (the scan reading both spaces). The DGS-406 publish path. A Token Economics package. Giving `shopee/` a home.
