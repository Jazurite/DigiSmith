# DGS-749 Spec: Workspace skeleton and boundary test

Monorepo move 1 of 9 for DGS-745. Written 2026-11-15 12:45 UTC+7 (05:45 UTC). Size S. Additive only: new files and new workspace globs. No code moves.

Master plan: Task 1 of `.digismith/board/DGS-745—monorepo-per-aspect/plan.md` (master plan 8a80d8da, amendment db55c0aa). The master plan text wins over the ticket description. This spec only pins down what the builder needs on top of it.

## 1. Goal

1. The repo becomes a pnpm workspace that already knows `aspects/*`, `libs/*` and `aspects/oculus/nexus/*`.
2. Two empty package shells exist: `@digismith/scripture` and `@digismith/oculus`.
3. A boundary checker and its test exist. The test lists today's Scripture-to-Oculus imports as a KNOWN list. The list may only shrink.

## 2. Facts checked on 2026-11-15 (12:40 UTC+7)

- The checker code in the master plan (Task 1, Step 1) was copied out and run against the current `origin/main` tree (0f8d9dae). It reports exactly 8 violations, the same 8 as plan finding 1:
  - `packages/cli/src/index.ts` imports `./autonomous/index.ts`, `./autonomous/director/command.ts`, `./salvage/index.ts`, `./oculus/index.ts`, `./conductor/index.ts` (5)
  - `packages/cli/src/run/index.ts` imports `./limit-check.ts`, `./limit.ts` (2)
  - `scripts/conductor/idle-check.ts` imports `./state.ts` (1)
- `aspects/`, `libs/` and `scripts/boundaries/` do not exist yet.
- `pnpm-workspace.yaml` today lists `packages/*`, `scripts/nexus-api`, `scripts/nexus-shared`, `scripts/nexus-web`. All stay.
- `tsconfig.json` `include` today is `scripts/**/*.ts` and `packages/cli/src/**/*.ts`.
- `vitest run` finds tests by the default glob, so `scripts/boundaries/boundaries.test.ts` is picked up with no config change.
- The plugin version is 1.87.0 today (`.claude-plugin/plugin.json`), not 1.82.0 as the master plan baseline says. Nothing reads a package shell version in this move, and the plugin bump script does not touch any `package.json`. See decision D2.
- None of the files this move writes or edits is on the protected paths (section 13, DEFAULT_PROTECTED). No authority change is needed.

## 3. Scope

In scope (repo):
- Create `scripts/boundaries/boundaries.ts` and `scripts/boundaries/boundaries.test.ts`.
- Create `aspects/scripture/package.json` and `aspects/oculus/package.json`.
- Edit `pnpm-workspace.yaml` (three globs added) and `tsconfig.json` (two include entries added).
- `pnpm-lock.yaml` does not change. The shells have no dependencies, so `pnpm install` reports "Lockfile is up to date" and writes nothing (checked by the plan Reviewer with pnpm 12.14.0 in a scratch repo).

Out of scope:
- Any file move. Any import rewrite. Any change to `packages/`.
- The depot sparse checkout (`git -C ~/.digismith-depot/repo sparse-checkout set packages aspects libs`). It is outside the repo. The conductor runs it after the merge. The builder never runs it.
- An `apps/*` glob (removed by the 2026-11-14 amendment).
- Changesets, plugin sync, `exports` map on the Scripture shell (later moves).

## 4. Design decisions

D1. **Checker code is the master plan's code, with one change to the test file.** The master plan's `zoneOf` test names a path under the Oculus-owned autonomous folder of the old CLI package. That text sits on the protected paths (section 13, DEFAULT_PROTECTED) and would make the refinement gate refuse the plan. The test uses `packages/cli/src/salvage/index.ts` instead. Same assertion (zone `oculus`), different path.

D2. **Shell versions are placeholders.** `@digismith/scripture` gets `"version": "0.0.0"` and `@digismith/oculus` gets `"0.1.0"` (the master plan baseline for Oculus). Both are `"private": true`. Reason: the Scripture baseline of 1.82.0 in the master plan is stale (plugin is 1.87.0 and moves with every merge). A wrong number that looks real is worse than an obvious placeholder. Task 3 sets the real Scripture version in the same step that removes `private`. Flag to the Maestro: Task 3 Step 3, Task 5 and the Global Constraints baseline still say 1.82.0. The Task 3 builder must copy the version from `.claude-plugin/plugin.json` at that time.

D3. **The ratchet is proven by tests, not by a manual edit.** The master plan proves "fails on a new import" by temporarily deleting a KNOWN line by hand (Step 4). That stays as a smoke check, but the real proof is a fixture test: a temporary tree with a clean file, a new violation, a test file that imports Oculus, and a Nexus file that imports Scripture. `findViolations` runs on that tree. This makes "fails on any new one" a permanent, automatic test.

D4. **Test files stay outside the rule** (plan finding 4). The checker skips `*.test.ts` and `*.test-util.ts`. The fixture test proves it.

D5. **KNOWN keeps today's paths.** Keys use `packages/cli/src/...`. Task 3 renames the prefix when it moves the package.

D6. **No key in a commit scope.** Two commits, in this order: `feat: add boundary checker and ratchet test (DGS-749)` and `feat: add workspace skeleton and package shells (DGS-749)`. The key is in the title tail, never in a `feat(<scope>)` scope.

## 5. Acceptance checks (Done when)

1. `pnpm test` is green with the new boundary test.
2. The boundary test reports exactly the 8 known imports (list in section 2) and fails on any new one. It also fails when a KNOWN entry no longer matches a real import (the list may only shrink).
3. `pnpm install --frozen-lockfile` works with the new globs, and `git diff --quiet pnpm-lock.yaml` shows no change to the lockfile.
4. `aspects/scripture/package.json` has name `@digismith/scripture`. `aspects/oculus/package.json` has name `@digismith/oculus` and `private: true`.
5. The depot sparse checkout includes `aspects` and `libs`. This is the conductor's step after the merge. It is checked there with `git -C ~/.digismith-depot/repo sparse-checkout list`, expected output `packages`, `aspects`, `libs`.

## 6. Follow-ups for the Maestro

- The depot clone code writes only `packages` into the sparse-checkout file (`packages/cli/src/depot/clone/lib.ts:44`). A fresh depot clone would miss `aspects` and `libs`. A follow-up ticket must change that pattern before DGS-745 Task 2 merges. Not in this move.
- Chain gate: DGS-699 and OCL-105 must be merged before this builds.

## 7. Risks

- The tree moves between now and the build. A new Scripture-to-Oculus import landing on main changes the count. The builder reads each line of the diff before it edits KNOWN (plan Step 3). A new import is a finding for the Maestro, not a KNOWN edit.
- `findViolations` walks every `.ts` file from the repo root. It skips `node_modules`, `dist`, `.git`, `.worktrees`, `.claude`, `.digismith`. Measured on 2026-11-15: 0.2 s on the real repo. The test sets an explicit 30 s timeout anyway.
- A worktree-based builder runs the test from its own root. The test resolves the root from its own file path, so it never reads the main checkout.
