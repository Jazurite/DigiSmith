# DGS-745 Monorepo per Aspect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the DigiSmith repo into one pnpm workspace with a package per Aspect (`@digismith/scripture`, `@digismith/oculus`), two libs, Changesets versions per package, and no code import from Scripture into Oculus.

**Architecture:** Nine ordered move tickets (Tasks 1-9). Each is its own ticket, its own branch and its own review. A boundary test (Task 1) lists every Scripture-to-Oculus import that exists today and only allows that list to shrink. Scripture reaches Oculus through the `dg` forward table (process call); Oculus imports Scripture through declared `exports`.

**Tech Stack:** pnpm workspace, Node 24 with `--experimental-strip-types`, TypeScript, vitest, yargs, `@changesets/cli`.

**Spec:** `.digismith/board/DGS-745—monorepo-per-aspect/spec.md` (approved, commit 5a603c05). This plan is a master plan. Each Task becomes one ClickUp ticket (the conductor files them) and gets its own detailed plan from its builder if the steps below are not enough.

## Plan findings that amend the spec

Checked on 2026-11-14 against commit 5a603c05 with a prototype boundary checker (kept in the scratchpad, not in the repo). Spec section numbers in brackets.

1. **8 Scripture-to-Oculus imports, not 1** [spec 3]. Non-test files only: `packages/cli/src/index.ts` imports 5 Oculus modules (`./autonomous/index.ts`, `./autonomous/director/command.ts`, `./salvage/index.ts`, `./oculus/index.ts`, `./conductor/index.ts`); `run/index.ts` imports `./limit-check.ts` and `./limit.ts`; `scripts/conductor/idle-check.ts` imports `./state.ts`. Task 4 carries the cuts.
2. **`conductor-registry/` goes to Scripture, not Oculus** [spec 3]. A Scripture hook needs the conductor note layer on every prompt: `scripts/session-cards/hook-cli.ts` imports `idle-check`, and `prompt-identity.ts` and `session-path.ts` import `safe-name`. `idle-check` reaches `resolveNotePath`, which reads the conductor registry. A process hop on every prompt is not acceptable. So these go to Scripture: `src/conductor-registry/`, and in `scripts/conductor/`: `registry`, `safe-name`, `idle-check`, `idle-stamp`, `state-block`, `markers`, `catch-up-window`, plus a new `note-path.ts` extracted from `state.ts`. The rest of `scripts/conductor/` (`cli`, `consult`, `flux*`, `refresh`, `runner`, `state`, `watch`, `catch-up-cli`, `attention-section`, `autonomous-section`, `ticket-status`) is Oculus.
3. **The forward table is `autonomous`, `director`, `oculus`, `conductor`, `salvage`, `run start`, `run limit`** [spec 5]. The dispatcher registers `director` (from `autonomous/director/command.ts`). It does **not** register `nightwatch`: `dg nightwatch` is not wired today, although `nightwatch/index.ts` and a comment in `scripts/nexus-api/src/nightwatch-reader.ts` mention it. The folder moves as it is, and it is not forwarded. Flag to the Maestro: the Nexus reader comment is stale.
4. **Test files are outside the boundary rule** [spec 5]. The Nexus contract tests (`scripts/nexus-api/src/oculus-contract.test.ts` and others) import Oculus fixtures on purpose. The rule covers shipped code only (`*.test.ts` and `*.test-util.ts` are skipped).
5. **Scripture `exports` grow by need.** Spec 5 lists six. The boundary test reports every deep import with its exact specifier; each Task adds an export for it and rewrites the import. The constant in the checker and `exports` in `aspects/scripture/package.json` must stay equal (Task 3 adds the equality test).

## Global Constraints

- One pnpm workspace; pnpm only, never npm or yarn.
- Names: `@digismith/scripture` (`aspects/scripture`), `@digismith/oculus` (`aspects/oculus`), `@digismith/clickup-client` (`libs/clickup-client`), `@digismith/jira-client` (`libs/jira-client`). Retired name: `@digismith/cli`.
- Workspace globs: `aspects/*`, `libs/*`, `apps/*`.
- Direction: `libs` import no aspect; Scripture imports only `libs`; Oculus imports `libs` and Scripture (only through Scripture's `exports`); Nexus apps import no package from `aspects/*`.
- Scripture calls Oculus only through the `dg` command line (JSON on stdout) and versioned files under `~/.digismith-depot/`. Forward prefixes: `autonomous`, `director`, `oculus`, `conductor`, `salvage`, `run start`, `run limit`.
- Plugin version equals `aspects/scripture/package.json` version. `plugin.json` and `marketplace.json` are written only by the sync script (Task 5).
- Baselines: `@digismith/scripture` 1.82.0 (the plugin version on 2026-11-14); `@digismith/oculus` 0.1.0, `"private": true`.
- Tags: Scripture `vX.Y.0`; Oculus `oculus-vX.Y.0`.
- Every Task is blocked by DGS-699 (Director) merging, and by the Task before it unless the Task says otherwise. Factory idle during a move. Mode Manual.
- No code moves in DGS-745 itself. Commits: title-only conventional commits, no AI attribution, push after finishing, by pathspec (never `git add -A`).
- Not touched by any builder: `~/.claude`, settings, `.digismith/config.yml`, the factory lock, installs, LaunchAgents, Caddy, DNS. Steps marked **[conductor/Jack]** are done by them.
- No delete without Jack's order for that exact target (Task 9).

## File Structure (end state)

```
aspects/scripture/            @digismith/scripture  (bins: dg, digismith)
  .claude-plugin/plugin.json  skills/  hooks/  standards/  profiles/  vendored/
  scripts/                    session-cards, run-events, workbox-health, git-hooks, boundaries, versioning, ...
  src/                        clickup tokens steward reviewer sessions depot vps shopee run conductor-registry lib shared
                              forward.ts changeset/ index.ts ticket-key.ts
  public-exclude.txt          shopee/
aspects/oculus/               @digismith/oculus  (bin: oculus; private)
  scripts/                    conductor (Oculus part), herdr, opencode-boot
  src/                        autonomous conductor nightwatch oculus salvage dispatch
libs/clickup-client  libs/jira-client
apps/nexus-api  apps/nexus-web  apps/nexus-shared
.claude-plugin/marketplace.json   (repo root; source ./aspects/scripture)
.changeset/   .digismith/   docs/   toolchain.yml   CLAUDE.md
```

---

### Task 1: Workspace skeleton and the boundary test

**Files:**
- Create: `scripts/boundaries/boundaries.ts`, `scripts/boundaries/boundaries.test.ts`
- Create: `aspects/scripture/package.json`, `aspects/oculus/package.json` (shells, no code)
- Modify: `pnpm-workspace.yaml` (globs), `tsconfig.json` (include)
- Depot (outside the repo, **[conductor/Jack]**): `git -C ~/.digismith-depot/repo sparse-checkout set packages aspects libs apps`

**Interfaces:**
- Produces: `zoneOf(rel: string): Zone`, `findViolations(root: string): Violation[]`, `keyOf(v: Violation): string`, `SCRIPTURE_EXPORTS: string[]`, `KNOWN` ratchet list in the test. Later Tasks edit `KNOWN`, `OCULUS_SRC_DIRS`, `SCRIPTURE_CONDUCTOR_FILES` and `SCRIPTURE_EXPORTS`.

- [ ] **Step 1: Write the checker.** Create `scripts/boundaries/boundaries.ts` (this exact code ran against the repo on 2026-11-14 and found the 8 violations below):

```ts
import * as fs from "node:fs";
import * as path from "node:path";

export type Zone = "lib" | "scripture" | "oculus" | "app" | "other";
export interface Violation { file: string; spec: string; from: Zone; to: Zone }

const SRC_ROOT = /^(packages\/cli|aspects\/scripture)\/src\//;
export const OCULUS_SRC_DIRS = ["autonomous", "conductor", "nightwatch", "oculus", "salvage", "dispatch"];
export const OCULUS_RUN_FILES = ["limit.ts", "limit-check.ts", "limit.test.ts", "limit-check.test.ts"];
export const OCULUS_SCRIPT_DIRS = ["conductor", "herdr", "opencode-boot"];
export const SCRIPTURE_CONDUCTOR_FILES = ["registry.ts", "safe-name.ts", "idle-check.ts", "idle-stamp.ts", "state-block.ts", "markers.ts", "catch-up-window.ts", "note-path.ts"];
export const SCRIPTURE_EXPORTS = ["run", "tokens", "steward", "clickup", "reviewer", "ticket-key", "conductor-registry"];
const isTest = (rel: string): boolean => /\.test(-util)?\.ts$/.test(rel);
const PACKAGE_ZONES: Record<string, Zone> = {
  "@digismith/clickup-client": "lib",
  "@digismith/jira-client": "lib",
  "@digismith/scripture": "scripture",
  "@digismith/cli": "scripture",
  "@digismith/oculus": "oculus",
};
const ALLOWED: Record<Zone, Zone[]> = {
  lib: ["lib", "other"],
  scripture: ["lib", "scripture", "other"],
  oculus: ["lib", "scripture", "oculus", "other"],
  app: ["lib", "app", "other"],
  other: ["lib", "scripture", "oculus", "app", "other"],
};

/** The zone of a repo-relative posix path. */
export function zoneOf(rel: string): Zone {
  if (rel.startsWith("libs/") || rel.startsWith("packages/clickup-client/") || rel.startsWith("packages/jira-client/")) return "lib";
  if (rel.startsWith("aspects/oculus/")) return "oculus";
  if (rel.startsWith("apps/") || /^scripts\/nexus-(api|web|shared)\//.test(rel)) return "app";
  if (SRC_ROOT.test(rel)) {
    const parts = rel.replace(SRC_ROOT, "").split("/");
    if (OCULUS_SRC_DIRS.includes(parts[0])) return "oculus";
    if (parts[0] === "run" && OCULUS_RUN_FILES.includes(parts[1])) return "oculus";
    return "scripture";
  }
  if (rel.startsWith("scripts/conductor/") && SCRIPTURE_CONDUCTOR_FILES.includes(rel.split("/")[2].replace(/\.test\.ts$/, ".ts"))) return "scripture";
  if (rel.startsWith("scripts/")) return OCULUS_SCRIPT_DIRS.includes(rel.split("/")[1]) ? "oculus" : "scripture";
  if (rel.startsWith("aspects/scripture/")) return "scripture";
  return "other";
}

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".worktrees", ".claude", ".digismith", ".nuxt", ".output"]);
export function listSources(root: string, dir = ""): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listSources(root, rel));
    else if (e.name.endsWith(".ts")) out.push(rel);
  }
  return out;
}

const IMPORT = /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g;
export function importsOf(text: string): string[] {
  return [...text.matchAll(IMPORT)].map((m) => m[1]);
}

function targetZone(file: string, spec: string): { zone: Zone; rel: string } | null {
  if (spec.startsWith(".")) {
    const rel = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
    return { zone: zoneOf(rel), rel };
  }
  const m = /^(@digismith\/[a-z-]+)(\/.*)?$/.exec(spec);
  if (!m) return null;
  const zone = PACKAGE_ZONES[m[1]];
  return zone ? { zone, rel: m[2] ? `${m[1]}${m[2]}` : m[1] } : null;
}

export function findViolations(root: string): Violation[] {
  const found: Violation[] = [];
  for (const file of listSources(root)) {
    const from = zoneOf(file);
    if (from === "other" || isTest(file)) continue;
    for (const spec of importsOf(fs.readFileSync(path.join(root, file), "utf-8"))) {
      const t = targetZone(file, spec);
      if (!t) continue;
      const deep =
        from === "oculus" &&
        ((t.rel.startsWith("aspects/scripture/") && file.startsWith("aspects/oculus/")) ||
          (/^@digismith\/scripture\//.test(t.rel) && !SCRIPTURE_EXPORTS.includes(t.rel.split("/")[2]?.replace(/\.[a-z]+$/, ""))));
      if (!ALLOWED[from].includes(t.zone) || deep) found.push({ file, spec, from, to: t.zone });
    }
  }
  return found;
}

export const keyOf = (v: Violation): string => `${v.file} -> ${v.spec}`;
```

(`conductor-registry` is already in `SCRIPTURE_EXPORTS` here and `OCULUS_SRC_DIRS` omits it, per finding 2.)

- [ ] **Step 2: Write the test (red first).** Create `scripts/boundaries/boundaries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { findViolations, importsOf, keyOf, zoneOf } from "./boundaries.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Ratchet: today's Scripture -> Oculus imports. Each Task deletes the entries it fixes.
// The test fails when a new violation appears AND when a listed one is gone (delete it).
const KNOWN: string[] = [
  "packages/cli/src/index.ts -> ./autonomous/index.ts",
  "packages/cli/src/index.ts -> ./autonomous/director/command.ts",
  "packages/cli/src/index.ts -> ./salvage/index.ts",
  "packages/cli/src/index.ts -> ./oculus/index.ts",
  "packages/cli/src/index.ts -> ./conductor/index.ts",
  "packages/cli/src/run/index.ts -> ./limit-check.ts",
  "packages/cli/src/run/index.ts -> ./limit.ts",
  "scripts/conductor/idle-check.ts -> ./state.ts",
];

describe("zoneOf", () => {
  it("maps paths to zones", () => {
    expect(zoneOf("packages/cli/src/tokens/count.ts")).toBe("scripture");
    expect(zoneOf("packages/cli/src/autonomous/state.ts")).toBe("oculus");
    expect(zoneOf("packages/cli/src/run/limit-check.ts")).toBe("oculus");
    expect(zoneOf("packages/cli/src/conductor-registry/registry.ts")).toBe("scripture");
    expect(zoneOf("scripts/conductor/idle-check.ts")).toBe("scripture");
    expect(zoneOf("scripts/conductor/flux.ts")).toBe("oculus");
    expect(zoneOf("scripts/nexus-api/src/app.ts")).toBe("app");
    expect(zoneOf("packages/clickup-client/src/index.ts")).toBe("lib");
    expect(zoneOf("aspects/oculus/src/autonomous/state.ts")).toBe("oculus");
  });
});

describe("importsOf", () => {
  it("reads static, dynamic and side-effect imports", () => {
    expect(importsOf(`import a from "./a.ts"; const b = await import("./b.ts"); import "./c.ts";`)).toEqual(["./a.ts", "./b.ts", "./c.ts"]);
  });
});

describe("boundary", () => {
  it("has no import beyond the known list", () => {
    const keys = findViolations(ROOT).map(keyOf).sort();
    expect(keys).toEqual([...KNOWN].sort());
  });
});
```

- [ ] **Step 3: Run it.** `pnpm vitest run scripts/boundaries/boundaries.test.ts`. Expected: PASS with the 8 listed entries. If a count differs, the tree moved since 5a603c05: update `KNOWN` to the printed diff only after reading each line.
- [ ] **Step 4: Prove the ratchet fails.** Temporarily delete one `KNOWN` line, run the test, confirm FAIL, restore the line.
- [ ] **Step 5: Add the shells and globs.** `aspects/scripture/package.json`: `{"name":"@digismith/scripture","version":"1.82.0","private":true,"type":"module"}`. `aspects/oculus/package.json`: `{"name":"@digismith/oculus","version":"0.1.0","private":true,"type":"module"}`. In `pnpm-workspace.yaml` add `"aspects/*"`, `"libs/*"`, `"apps/*"` to `packages:` (keep every current entry). In `tsconfig.json` `include` add `"aspects/**/*.ts"`, `"libs/**/*.ts"`, `"apps/**/*.ts"`.
- [ ] **Step 6: Install and test.** `pnpm install` then `pnpm test`. Expected: all green, lockfile gains two importers only. Scripture shell is `private: true` until Task 3 sets its final fields.
- [ ] **Step 7: Depot sparse set [conductor/Jack].** Run the `sparse-checkout set` line from Files, then `git -C ~/.digismith-depot/repo sparse-checkout list`. Expected: `packages`, `aspects`, `libs`, `apps`.
- [ ] **Step 8: Commit.** `git add scripts/boundaries aspects pnpm-workspace.yaml tsconfig.json pnpm-lock.yaml && git commit -m "feat: add workspace skeleton and boundary test (DGS-745)"`.

---

### Task 2: Move the libs

**Files:**
- Move: `packages/clickup-client` to `libs/clickup-client`; `packages/jira-client` to `libs/jira-client` (`git mv`)
- Modify: `vitest.config.ts` (alias path), `aspects/scripture`-bound `packages/cli/package.json` build script, `packages/clickup-client/package.json` and `libs/*/package.json` (`repository.directory`), the 10 `jira-client/src/cli.ts` paths in skills and docs, `scripts/boundaries/boundaries.ts` (`zoneOf` lib prefixes), `pnpm-workspace.yaml`

**Interfaces:**
- Consumes: Task 1 `zoneOf`.
- Produces: `@digismith/clickup-client` and `@digismith/jira-client` resolve from `libs/`.

- [ ] **Step 1: Failing test.** Add to `boundaries.test.ts`: `expect(zoneOf("libs/jira-client/src/cli.ts")).toBe("lib")` (already true) and a new test `no stale lib paths`: read `skills`, `hooks`, `scripts`, `standards`, `profiles` and `CLAUDE.md` and assert none contains `packages/jira-client` or `packages/clickup-client`. Run: FAIL (10 hits).
- [ ] **Step 2: Move.** `git mv packages/clickup-client libs/clickup-client && git mv packages/jira-client libs/jira-client`.
- [ ] **Step 3: Fix references.** In `vitest.config.ts` change the alias to `./libs/clickup-client/src/index.ts`. In `packages/cli/package.json` the build script calls `pnpm --filter @digismith/clickup-client build`: unchanged (filter by name). Replace `packages/jira-client` with `libs/jira-client` and `packages/clickup-client` with `libs/clickup-client` in the files the test names, using `grep -rl` to list them, then edit each. Update `repository.directory` in both libs. Remove `"packages/*"` entries only if nothing else is in `packages/` (`cli` still is: keep).
- [ ] **Step 4: Prune the boundary prefixes.** In `zoneOf` keep both old and new lib prefixes until Task 3 ends; Task 3 removes the old ones. (No edit now.)
- [ ] **Step 5: Verify.** `pnpm install && pnpm --filter @digismith/clickup-client build && pnpm test`. Expected: green. Real call: `node --experimental-strip-types libs/jira-client/src/cli.ts --help` prints usage.
- [ ] **Step 6: Commit** by pathspec: `git commit -m "refactor: move clickup-client and jira-client to libs (DGS-745)"`.

---

### Task 3: Move `packages/cli` to `aspects/scripture`

**Files:**
- Move: `packages/cli` to `aspects/scripture` (`git mv`; replaces the Task 1 shell: keep the shell's `name`, set the rest from `packages/cli/package.json`)
- Create: symlink `packages/cli` to `../aspects/scripture`
- Modify: `aspects/scripture/package.json`, `tsconfig.json`, the 37 `packages/cli/src/tokens` references in 14 files, `scripts/**` imports of `../packages/cli/src/*`, `scripts/boundaries/boundaries.ts`
- Test: `scripts/boundaries/boundaries.test.ts` (stale-path test and exports equality)

**Interfaces:**
- Produces: `aspects/scripture/src/**` (same layout as `packages/cli/src`); bins `dg` and `digismith`; `exports` map with keys `./run ./tokens ./steward ./clickup ./reviewer ./ticket-key ./conductor-registry`.

- [ ] **Step 1: Failing tests.** Extend the stale-path test from Task 2 to ban `packages/cli` (and `packages/jira-client`) in `skills`, `hooks`, `scripts`, `standards`, `profiles` and `CLAUDE.md`. Add `exports equality`: parse `aspects/scripture/package.json`, take `Object.keys(exports)` with the `./` stripped, and expect it to equal `SCRIPTURE_EXPORTS` (sorted). Run: FAIL.
- [ ] **Step 2: Move.** Run `git mv packages/cli/LICENSE packages/cli/README.md packages/cli/src packages/cli/tsconfig.build.json aspects/scripture/`, then `git mv -f packages/cli/package.json aspects/scripture/package.json` (the `-f` overwrites the Task 1 shell: that file is our own Task 1 scaffold, not a user file). Check `git status` shows renames, not delete plus add.
- [ ] **Step 3: Rewrite `aspects/scripture/package.json`.** `name` `@digismith/scripture`, `version` `1.82.0`, remove `private`, keep `bin` (`dg`, `digismith` to `dist/index.js`), `repository.directory` `aspects/scripture`, and add:

```json
"exports": {
  "./run": "./src/run/index.ts",
  "./tokens": "./src/tokens/index.ts",
  "./steward": "./src/steward/index.ts",
  "./clickup": "./src/clickup/index.ts",
  "./reviewer": "./src/reviewer/index.ts",
  "./ticket-key": "./src/ticket-key.ts",
  "./conductor-registry": "./src/conductor-registry/registry.ts"
}
```
`"publishConfig"` stays. The version field is Changesets' from Task 5. Create `aspects/scripture/public-exclude.txt` with the single line `src/shopee/` (spec section 8: the future publish path reads it).
- [ ] **Step 4: Compat symlink.** `ln -s ../aspects/scripture packages/cli` then `git add packages/cli`. This keeps old plugin versions that still call `packages/cli/src/...` working for one cycle.
- [ ] **Step 5: Rewrite paths.** In `skills`, `hooks`, `scripts`, `standards`, `profiles`, `CLAUDE.md`, `.digismith/hooks` replace `packages/cli/src` with `aspects/scripture/src` (use `grep -rl 'packages/cli' ... | xargs` then `perl -pi -e`; no `sed -i` on macOS without a suffix argument). In `scripts/**` imports change `../packages/cli/src/` to `../aspects/scripture/src/` (count: tokens 5, run 3, autonomous 2, conductor-registry 1). In `scripts/boundaries/boundaries.ts` drop the old `packages/...` lib prefixes (`SRC_ROOT` keeps both forms until Task 7 for the symlinked path). In `tsconfig.json` replace the include of `packages/cli/src/**/*.ts` with `aspects/scripture/src/**/*.ts`; the `KNOWN` paths in the test change from `packages/cli/src/` to `aspects/scripture/src/`.
- [ ] **Step 6: Build and test.** `pnpm install && pnpm --filter @digismith/scripture build && pnpm test`. Expected: green, `aspects/scripture/dist/index.js` exists. Real call: `node aspects/scripture/dist/index.js --version` prints `1.82.0`; `node --experimental-strip-types aspects/scripture/src/tokens/entry.ts --help` runs.
- [ ] **Step 7: npm check.** `pnpm view @digismith/cli`. Print the result in the PR. If it exists, Jack decides on deprecating it (public action).
- [ ] **Step 8: Commit** by pathspec: `git commit -m "refactor: move the CLI into aspects/scripture (DGS-745)"`; push.
- [ ] **Step 9: Reinstall `dg` [conductor/Jack].** `pnpm remove -g @digismith/cli`, then the global install of `@digismith/scripture` from `aspects/scripture` (same method that installed `@digismith/cli`: it is a built copy under `~/Library/pnpm/global/.../node_modules`). Verify `dg --version` prints `1.82.0` and `dg clickup --help` works. Then run Task 1 Step 7's `git -C ~/.digismith-depot/repo pull --ff-only` so the depot has `aspects/`.

---

### Task 4: Cut the eight Scripture-to-Oculus imports inside the package

**Files:**
- Create: `aspects/scripture/src/dispatch/index.ts`, `aspects/scripture/scripts/conductor/note-path.ts` (path before Task 6: `scripts/conductor/note-path.ts`)
- Move (git mv): `src/run/limit.ts`, `src/run/limit-check.ts` (+ their tests) into `src/dispatch/`; `src/conductor-registry/` stays
- Modify: `src/run/index.ts`, `scripts/conductor/state.ts`, `scripts/conductor/idle-check.ts`, callers of `resolveNotePath`, `scripts/boundaries/boundaries.test.ts` (`KNOWN`), `scripts/boundaries/boundaries.ts`

**Interfaces:**
- Consumes: Task 1 checker, `resolveNotePath(args: { project: string; conductor: string; note?: string }, env?: NodeJS.ProcessEnv): string` (today in `scripts/conductor/state.ts:80`).
- Produces: `src/dispatch/index.ts` exporting `startCommand`, `limitCommand: CommandModule` (the `start` and `limit` commands cut out of `run/index.ts`); `scripts/conductor/note-path.ts` exporting `resolveNotePath` with the same signature; `run/index.ts` composes `event`, `list`, `show`, `tail` and registers `startCommand` and `limitCommand` from `dispatch/index.ts` through a function parameter (see Step 4).

- [ ] **Step 1: Read first.** Read `src/run/index.ts` lines 1-160. Confirm `start` (line 15) and `limit` (line 114) are the only users of `currentCount`, `driverRefusal`, `startRefusal`, `kindOf`, `limitLine`, `limitRows`. If `start` uses anything else of the record layer, that import goes to `@digismith/scripture` `./run` later; note it in the PR.
- [ ] **Step 2: Failing test.** In `boundaries.test.ts` delete the two `run/index.ts` lines and the `idle-check` line from `KNOWN`. Run: FAIL (3 violations reappear as "unexpected").
- [ ] **Step 3: Extract `note-path.ts`.** Copy `resolveNotePath` (state.ts lines 80-91) into `scripts/conductor/note-path.ts` with its imports (`node:path`, `depotDir` from `../depot-dir.ts`, `resolveConductor` from `./registry.ts`). In `state.ts` replace the function with `export { resolveNotePath } from "./note-path.ts";`. Change `idle-check.ts` to import from `./note-path.ts`.
- [ ] **Step 4: Create `src/dispatch/`.** `git mv src/run/limit.ts src/run/limit-check.ts src/run/limit.test.ts src/run/limit-check.test.ts src/dispatch/`. Move the `start` and `limit` command objects from `run/index.ts` into `src/dispatch/index.ts` unchanged, and export them. `run/index.ts` must not import from `../dispatch`. Instead it builds its group from a parameter: export `createRunCommand(extra: CommandModule[] = []): CommandModule`; the dispatcher in `src/index.ts` passes `[startCommand, limitCommand]` for now (Task 7 replaces this with forwarding). Update `scripts/conductor/state.ts` imports of `run/limit` and `run/limit-check` to `dispatch/`. Update the test imports.
- [ ] **Step 5: Boundary list.** Add the registration import in `src/index.ts` to the `KNOWN` list as `aspects/scripture/src/index.ts -> ./dispatch/index.ts`. It goes away in Task 7.
- [ ] **Step 6: Verify.** `pnpm test` (the boundary test now lists 6 entries: 5 dispatcher lines + the one just added). Real call: `dg run limit` prints the same line before and after (capture it before Step 3 and compare); `dg run list --help` works.
- [ ] **Step 7: Commit.** `git commit -m "refactor: cut the Scripture imports of Oculus code (DGS-745)"`.

---

### Task 5: Changesets and the release flow

**Files:**
- Create: `.changeset/config.json`, `.changeset/README.md`, `aspects/scripture/scripts/versioning/sync-plugin-version.ts` (+ `.test.ts`), `aspects/scripture/src/changeset/index.ts` (+ `.test.ts`)
- Modify: root `package.json` (devDependency), `aspects/scripture/src/index.ts` (register `changeset`), `.digismith/hooks/post-finish/01-version-bump.md`, `02-plugin-reinstall.md`, `03-history-update.md`, `skills/report-implementation/SKILL.md`
- Delete (Jack's order needed): `.digismith/hooks/post-finish/scripts/bump-plugin-version.ts` is left in place, unused, until Jack orders its removal.

**Interfaces:**
- Produces:
  - `renderChangeset(input: { packages: { name: string; level: "patch" | "minor" | "major" }[]; summary: string }): string`
  - `changesetFileName(ticket: string, slug: string): string` (returns `<ticket-lowercase>-<slug>.md`)
  - `dg changeset add --ticket <key> --package <name> --level <patch|minor|major> [--summary <text>]` writes `.changeset/<file>`
  - `syncPluginVersion(opts: { packageJson: string; files: string[] }): "SYNCED" | "UNCHANGED"` and a CLI that prints `SYNCED <version>` or `UNCHANGED <version>`.

- [ ] **Step 1: Install.** `pnpm add -D -w @changesets/cli` (pnpm only; respect `minimumReleaseAge`). Then `pnpm changeset init`.
- [ ] **Step 2: Config.** `.changeset/config.json`:

```json
{
  "$schema": "https://unpkg.com/@changesets/config/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["@digismith/nexus-api", "@digismith/nexus-web", "@digismith/nexus-shared"]
}
```
- [ ] **Step 3: Failing test for the helper.** `aspects/scripture/src/changeset/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { changesetFileName, renderChangeset } from "./index.ts";

describe("changeset helper", () => {
  it("renders one package", () => {
    expect(renderChangeset({ packages: [{ name: "@digismith/scripture", level: "patch" }], summary: "Fix the idle check (DGS-1)" })).toBe(
      '---\n"@digismith/scripture": patch\n---\n\nFix the idle check (DGS-1)\n',
    );
  });
  it("renders two packages in the given order", () => {
    const out = renderChangeset({ packages: [{ name: "@digismith/oculus", level: "minor" }, { name: "@digismith/scripture", level: "patch" }], summary: "x" });
    expect(out).toContain('"@digismith/oculus": minor\n"@digismith/scripture": patch\n');
  });
  it("names the file from the ticket and slug", () => {
    expect(changesetFileName("DGS-745", "monorepo")).toBe("dgs-745-monorepo.md");
  });
});
```
Run `pnpm vitest run aspects/scripture/src/changeset`: FAIL.
- [ ] **Step 4: Implement.** `aspects/scripture/src/changeset/index.ts`:

```ts
import type { CommandModule } from "yargs";
import * as fs from "node:fs";
import * as path from "node:path";

export type Level = "patch" | "minor" | "major";
export interface ChangesetInput { packages: { name: string; level: Level }[]; summary: string }

export function renderChangeset(input: ChangesetInput): string {
  const front = input.packages.map((p) => `"${p.name}": ${p.level}`).join("\n");
  return `---\n${front}\n---\n\n${input.summary}\n`;
}

export function changesetFileName(ticket: string, slug: string): string {
  return `${ticket.toLowerCase()}-${slug}.md`;
}

const changesetCommand: CommandModule = {
  command: "changeset",
  describe: "Write a Changesets file for a ticket",
  builder: (y) =>
    y.command({
      command: "add",
      describe: "dg changeset add --ticket DGS-1 --package @digismith/scripture --level patch",
      builder: (a) =>
        a
          .option("ticket", { type: "string", demandOption: true })
          .option("package", { type: "string", array: true, demandOption: true })
          .option("level", { type: "string", choices: ["patch", "minor", "major"] as const, demandOption: true })
          .option("summary", { type: "string" })
          .option("slug", { type: "string", default: "change" }),
      handler: (argv) => {
        const dir = path.join(process.cwd(), ".changeset");
        const file = path.join(dir, changesetFileName(String(argv.ticket), String(argv.slug)));
        const packages = (argv.package as string[]).map((name) => ({ name, level: argv.level as Level }));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, renderChangeset({ packages, summary: String(argv.summary ?? `${argv.ticket}`) }));
        console.log(file);
      },
    }).demandCommand(1, ""),
  handler: () => {},
};
export default changesetCommand;
```
Register it in `src/index.ts` with `.command(changesetCommand)`. Run the test: PASS.
- [ ] **Step 5: Failing test for the sync script.** `sync-plugin-version.test.ts`: write a temp dir with `package.json` `{"version":"1.83.0"}`, a `plugin.json` `{"name":"digismith","version":"1.82.0"}` and a `marketplace.json` `{"plugins":[{"name":"digismith","version":"1.82.0"}]}`; expect `syncPluginVersion` to return `"SYNCED"`, both files to read `1.83.0`, and a second call to return `"UNCHANGED"`. Run: FAIL.
- [ ] **Step 6: Implement the sync.** `sync-plugin-version.ts`:

```ts
import * as fs from "node:fs";

export function syncPluginVersion(opts: { packageJson: string; files: string[] }): "SYNCED" | "UNCHANGED" {
  const version = (JSON.parse(fs.readFileSync(opts.packageJson, "utf-8")) as { version: string }).version;
  let changed = false;
  for (const file of opts.files) {
    const data = JSON.parse(fs.readFileSync(file, "utf-8")) as { version?: string; plugins?: { name: string; version?: string }[] };
    if (data.version !== undefined && data.version !== version) { data.version = version; changed = true; }
    for (const p of data.plugins ?? []) if (p.name === "digismith" && p.version !== version) { p.version = version; changed = true; }
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  }
  return changed ? "SYNCED" : "UNCHANGED";
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const [packageJson, ...files] = process.argv.slice(2);
  const version = (JSON.parse(fs.readFileSync(packageJson, "utf-8")) as { version: string }).version;
  console.log(`${syncPluginVersion({ packageJson, files })} ${version}`);
}
```
Run: PASS.
- [ ] **Step 7: Dry run on a scratch copy.** In the scratchpad, `git worktree`-free: `cp -R` is not needed; run `pnpm changeset version` only inside a throwaway clone (`git clone --local . <scratch>/dgs-745-dry`), with one patch changeset for `@digismith/scripture`. Expected: `aspects/scripture/package.json` goes `1.82.0` to `1.82.1`, `CHANGELOG.md` appears, the `workspace:^` ranges of `@digismith/clickup-client` stay valid. Record the output in the PR. If the ranges break, stop and report.
- [ ] **Step 8: Rewrite hook 01.** In `01-version-bump.md` replace the `bump-plugin-version.ts` block with:

```bash
cd "$(git rev-parse --show-toplevel)"
# pins and the base/head guard stay exactly as today
before=$(node -p "require('./aspects/scripture/package.json').version")
pnpm changeset version || { echo "changeset version failed - stop, do not push, do not run further hooks" >&2; exit 1; }
OUT=$(node --experimental-strip-types aspects/scripture/scripts/versioning/sync-plugin-version.ts aspects/scripture/package.json .claude-plugin/plugin.json .claude-plugin/marketplace.json)
after=$(node -p "require('./aspects/scripture/package.json').version")
if [ -n "$(git status --porcelain -- .changeset aspects libs .claude-plugin)" ]; then
  git add .changeset aspects libs .claude-plugin pnpm-lock.yaml 2>/dev/null
  git commit -m "chore: version packages" -- .changeset aspects libs .claude-plugin
  git push origin main
  [ "$before" != "$after" ] && echo "BUMPED scripture $after" || echo "BUMPED other"
else
  echo "SKIPPED (no pending changeset)"
fi
```
(Pathspecs only. Task 6 changes the two `.claude-plugin` plugin paths.) Hook 02: run the plugin update only when hook 01 printed `BUMPED scripture`; before it, add `git -C ~/.digismith-depot/repo pull --ff-only`. Hook 03: add the package and version to the history entry line (read the version from the pinned head: `git show <head>:aspects/scripture/package.json`).
- [ ] **Step 9: Report step.** In `skills/report-implementation/SKILL.md` add a step before the report commit: call `dg changeset add --ticket <Key> --package <each package the branch changed> --level <patch for a task, minor for the epic's closing ticket, major for an arc>`, and commit the file with `report.html` and `plan.md`. A branch that changed only `aspects/oculus` names only `@digismith/oculus`.
- [ ] **Step 10: Verify.** `pnpm test` green. **[conductor/Jack]** Merge this Task with the old hook first; the new hook 01 takes effect from the merge after (the conductor edits the live `.digismith/hooks` copy as part of the merge). Real call: the next merge writes `chore: version packages` and `dg --version` moves.
- [ ] **Step 11: Commit** by pathspec: `git commit -m "feat: version per package with Changesets (DGS-745)"`.

---

### Task 6: Move the plugin root under `aspects/scripture`

**Files:**
- Move (git mv) into `aspects/scripture/`: `skills/`, `hooks/`, `standards/`, `profiles/`, `vendored/`, `.claude-plugin/plugin.json`, and these `scripts/` entries: `session-cards`, `session-init.ts`, `run-events`, `workbox-health`, `git-hooks`, `agentic-bridge`, `runners`, `providers`, `token-counter`, `demo`, `claude-account`, `boundaries`, and every loose root file in `scripts/` (`board-path`, `catch-up`, `config*`, `identity*`, `notes-*`, `session-*`, `voice*`, `preferences`, `toolchain`, `fill-template`, `check_vendored_skills`, `model_offload`, `lineage-handoff`, `depot-dir`, `cli-args`, with their tests), plus the Scripture part of `scripts/conductor/` (the eight files listed in finding 2).
- Modify: `.claude-plugin/marketplace.json` (`"source": "./aspects/scripture"`), `aspects/scripture/hooks/hooks.json` (paths stay `${CLAUDE_PLUGIN_ROOT}/scripts/...`: no edit needed because `scripts/` moves with `hooks/`), `package.json` (`prepare` script path to `aspects/scripture/scripts/git-hooks`), the hook 01-03 paths from Task 5, `CLAUDE.md`, `vitest.config.ts`, `tsconfig.json`, `scripts/boundaries/boundaries.ts` (`zoneOf` for `aspects/scripture/scripts/`)
- Test: `scripts/boundaries` moves too (it is a Scripture script; its repo-root resolution becomes `../../../..`).

**Interfaces:**
- Consumes: Task 5 sync script path and version authority.
- Produces: the marketplace entry `jazurite/digismith` with `source` `./aspects/scripture`, plugin root `aspects/scripture`.

- [ ] **Step 1: Probe first [conductor/Jack].** In the scratchpad create a throwaway git repo with `.claude-plugin/marketplace.json` (`name` `probe-market`, one plugin whose `source` is `./sub/plug`) and `sub/plug/.claude-plugin/plugin.json`, one skill, version `0.0.1`. In a scratch config (not Jack's), run `claude plugin marketplace add <path>`, `claude plugin install plug@probe-market`, bump the version, run `claude plugin marketplace update probe-market` and `claude plugin update plug@probe-market`. Expected: the cache directory holds only `sub/plug` content and the version moves. Then repeat with the plugin's `source` changed from `./` to `./sub/plug` on an already installed plugin. If either fails, stop: write the result in the PR and ask the Maestro.
- [ ] **Step 2: Failing test.** Add to the boundary test: `plugin root is self-contained`: every `${CLAUDE_PLUGIN_ROOT}/<path>` in `aspects/scripture/hooks/hooks.json` exists under `aspects/scripture/`, and `aspects/scripture/.claude-plugin/plugin.json` has `name` `digismith`. Also: every `skills/*/SKILL.md` that mentions `scripts/` resolves it relative to `aspects/scripture`. Run: FAIL.
- [ ] **Step 3: Move** with `git mv` in this order: `scripts` Scripture entries, `skills`, `hooks`, `standards`, `profiles`, `vendored`, `.claude-plugin/plugin.json`. Check `git status` shows only renames.
- [ ] **Step 4: Repoint.** Marketplace `source`. The `01` hook's two `.claude-plugin` pathspecs become `aspects/scripture/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` (the marketplace file stays at the root). The `IS_DIGISMITH` check in hooks 01-03 greps `.claude-plugin/plugin.json`: change it to `aspects/scripture/.claude-plugin/plugin.json`. Update the `package.json` `prepare` path and `CLAUDE.md`. The catch-up command in `CLAUDE.md` and `skills/catch-up/SKILL.md` keeps pointing at `scripts/conductor/cli.ts` (it stays at the repo root with the Oculus part of `scripts/conductor/` until Task 7, which replaces it with `dg conductor consult`).
- [ ] **Step 5: Verify locally.** `pnpm test` green. `node --experimental-strip-types aspects/scripture/scripts/session-cards/hook-cli.ts start </dev/null` exits 0 (the hook entry point). `node --experimental-strip-types aspects/scripture/scripts/board-path.ts --action find --slug 'monorepo-per-aspect'` prints the DGS-745 folder.
- [ ] **Step 6: Commit** and push by pathspec: `git commit -m "refactor: make aspects/scripture the plugin root (DGS-745)"`.
- [ ] **Step 7: Real update [conductor/Jack].** Run hook 02's two commands (`claude plugin marketplace update jazurite`, `claude plugin update digismith@jazurite --scope user`). Verify the new cache folder under `~/.claude/plugins/cache/jazurite/digismith/` has `skills/` and `hooks/` at its top and no `aspects/oculus`. Start a new session: the SessionStart hooks run without error. Roll back by reverting the marketplace `source` commit and re-running hook 02.

---

### Task 7: Split Oculus out of Scripture

**Files:**
- Move (git mv) to `aspects/oculus/src/`: `autonomous/`, `conductor/`, `nightwatch/`, `oculus/`, `salvage/`, `dispatch/`
- Move to `aspects/oculus/scripts/`: `scripts/conductor/*` except the eight Scripture files, `scripts/herdr/`, `scripts/opencode-boot/`
- Create: `aspects/oculus/package.json` (final), `aspects/oculus/src/index.ts` (the `oculus` bin), `aspects/oculus/tsconfig.build.json`, `aspects/scripture/src/forward.ts` (+ `forward.test.ts`)
- Modify: `aspects/scripture/src/index.ts`, `aspects/scripture/package.json` (`exports`), every Oculus import of a Scripture module (rewrite to `@digismith/scripture/<export>`), `skills/catch-up/SKILL.md` and `CLAUDE.md` (call `dg conductor consult`), `scripts/boundaries/*`

**Interfaces:**
- Produces:
  - `FORWARD_PREFIXES: string[][]` = `[["autonomous"],["director"],["oculus"],["conductor"],["salvage"],["run","start"],["run","limit"]]`
  - `matchForward(argv: string[]): boolean`
  - `forwardToOculus(argv: string[], deps: { find: () => string | null; spawn: (bin: string, args: string[]) => number; err: (line: string) => void }): number`
  - bin `oculus` (from `@digismith/oculus`), same yargs groups as today.

- [ ] **Step 1: Failing forward test.** `forward.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { forwardToOculus, matchForward } from "./forward.ts";

describe("matchForward", () => {
  it("matches factory groups and the two run commands", () => {
    expect(matchForward(["autonomous", "scan"])).toBe(true);
    expect(matchForward(["director", "plan"])).toBe(true);
    expect(matchForward(["run", "start", "x"])).toBe(true);
    expect(matchForward(["run", "limit"])).toBe(true);
  });
  it("leaves Scripture commands alone", () => {
    expect(matchForward(["run", "show", "r1"])).toBe(false);
    expect(matchForward(["tokens", "count"])).toBe(false);
    expect(matchForward(["clickup", "get-task"])).toBe(false);
  });
});

describe("forwardToOculus", () => {
  it("passes args to the oculus binary and returns its exit code", () => {
    const calls: string[][] = [];
    const code = forwardToOculus(["autonomous", "status"], { find: () => "/bin/oculus", spawn: (_b, a) => (calls.push(a), 3), err: () => {} });
    expect(code).toBe(3);
    expect(calls).toEqual([["autonomous", "status"]]);
  });
  it("prints one line and exits 1 when oculus is missing", () => {
    const lines: string[] = [];
    const code = forwardToOculus(["conductor", "sweep"], { find: () => null, spawn: () => 0, err: (l) => lines.push(l) });
    expect(code).toBe(1);
    expect(lines).toEqual(["conductor needs @digismith/oculus"]);
  });
});
```
Run: FAIL.
- [ ] **Step 2: Implement `forward.ts`.**

```ts
import { spawnSync } from "node:child_process";

export const FORWARD_PREFIXES: string[][] = [["autonomous"], ["director"], ["oculus"], ["conductor"], ["salvage"], ["run", "start"], ["run", "limit"]];

export function matchForward(argv: string[]): boolean {
  return FORWARD_PREFIXES.some((prefix) => prefix.every((word, i) => argv[i] === word));
}

export interface ForwardDeps {
  find: () => string | null;
  spawn: (bin: string, args: string[]) => number;
  err: (line: string) => void;
}

export function forwardToOculus(argv: string[], deps: ForwardDeps): number {
  const bin = deps.find();
  if (!bin) {
    deps.err(`${argv[0]} needs @digismith/oculus`);
    return 1;
  }
  return deps.spawn(bin, argv);
}

export const realForwardDeps: ForwardDeps = {
  find: () => {
    const r = spawnSync("sh", ["-c", "command -v oculus"], { encoding: "utf-8" });
    return r.status === 0 ? r.stdout.trim() : null;
  },
  spawn: (bin, args) => spawnSync(bin, args, { stdio: "inherit" }).status ?? 1,
  err: (line) => console.error(line),
};
```
Run: PASS.
- [ ] **Step 3: Failing boundary.** In `boundaries.test.ts` set `KNOWN` to `[]` and add `OCULUS_SRC_DIRS` handling for `aspects/oculus`. Run: FAIL (the dispatcher imports still exist).
- [ ] **Step 4: Move the folders and scripts** with `git mv` as listed. Create `aspects/oculus/package.json`: `name` `@digismith/oculus`, `version` `0.1.0`, `private` true, `type` module, `bin` `{ "oculus": "dist/index.js" }`, dependencies `@digismith/scripture` `workspace:^`, `@digismith/clickup-client` `workspace:^`, `yargs`, `picocolors`; a build script `tsc -p tsconfig.build.json`. Create `aspects/oculus/src/index.ts`: a yargs root named `oculus` that registers the six Oculus command modules (`autonomous`, `director`, `oculus`, `conductor`, `salvage`, and the `run` extras `startCommand` and `limitCommand` under a `run` group), mirroring `buildCli` in the Scripture index. In `aspects/scripture/src/index.ts` remove the five Oculus imports and the Task 4 `dispatch` import; before `buildCli` runs, `if (matchForward(hideBin(process.argv))) process.exit(forwardToOculus(hideBin(process.argv), realForwardDeps))`. `createRunCommand()` is called with no extras.
- [ ] **Step 5: Fix Oculus imports.** Run `pnpm vitest run scripts/boundaries`. For each reported import of a Scripture module, rewrite it to `@digismith/scripture/<export>`; when the export does not exist, add it to `aspects/scripture/package.json` `exports` **and** to `SCRIPTURE_EXPORTS` (the equality test from Task 3 keeps them equal). Repeat until the test is green with `KNOWN = []`. Expected exports beyond the seven: modules such as `./depot-dir`, `./session-card`, `./identity`, `./catch-up` that Oculus scripts use; the test output names each one.
- [ ] **Step 6: Callers by name.** In `skills/catch-up/SKILL.md` and `CLAUDE.md` replace `node --experimental-strip-types scripts/conductor/cli.ts consult ...` with `dg conductor consult ...`; do the same for the one doc that names a herdr script. Run `grep -rn "scripts/conductor/cli\|scripts/herdr" aspects/scripture CLAUDE.md docs` and expect no match.
- [ ] **Step 7: Oculus-absent test.** Add to `forward.test.ts` an end-to-end case through `buildCli` is not needed; instead run by hand: with `oculus` not on `PATH`, `dg autonomous status` prints `autonomous needs @digismith/oculus` and exits 1. Paste the output in the PR.
- [ ] **Step 8: Build and test.** `pnpm install && pnpm --filter @digismith/scripture build && pnpm --filter @digismith/oculus build && pnpm test`. Expected: green.
- [ ] **Step 9: Commit** by pathspec: `git commit -m "refactor: split the factory engine into aspects/oculus (DGS-745)"`; push.
- [ ] **Step 10: Install `oculus` and verify [conductor/Jack].** Global-install `@digismith/oculus` from `aspects/oculus` the way Task 3 installed `dg`. Verify: `dg autonomous status`, `dg run limit`, `dg conductor consult --project DigiSmith`, `dg director --help` each work through the forward table. Then the conductor checks one autonomous scan tick runs.

---

### Task 8: Move the Nexus to `apps/`

Scope pending Jack's Nexus decision (2026-11-14); do not start before the Maestro confirms.

**Files:**
- Move (git mv): `scripts/nexus-api` to `apps/nexus-api`, `scripts/nexus-web` to `apps/nexus-web`, `scripts/nexus-shared` to `apps/nexus-shared`; `scripts/caddy` to `apps/nexus-api/caddy` only if Step 1 says it fronts the Nexus
- Modify: `pnpm-workspace.yaml` (remove the three `scripts/nexus-*` entries), `.gitignore` (the `scripts/nexus-web/...` lines), `vitest.config.ts` (exclude `**/apps/nexus-web/**`), install scripts and plist templates, relative imports in the Nexus contract tests, `scripts/boundaries/boundaries.ts` (`app` prefix: drop the `scripts/nexus-*` regex)

**Interfaces:**
- Consumes: Task 1 workspace globs. Needs only Task 1 (can run beside Tasks 5-7).
- Produces: `apps/nexus-*` with the same package names.

- [ ] **Step 1: Read the Caddyfile.** `grep -n "reverse_proxy\|nexus" scripts/caddy/Caddyfile scripts/caddy/caddy-run.sh`. If it proxies the Nexus API, move it with the API; if not, leave `scripts/caddy` where it is (it goes to Scripture's scripts in Task 6's list only if it is generic: report which in the PR).
- [ ] **Step 2: Failing test.** Add to the boundary test: no file under `scripts/` matches `nexus-`. Run: FAIL.
- [ ] **Step 3: Move** with `git mv`. Edit the workspace file, `.gitignore`, `vitest.config.ts`, and the `install.sh` and `*.plist.tmpl` paths (the files only; do not run the installers).
- [ ] **Step 4: Fix contract tests.** The tests import `../../../packages/cli/src/...` (or `aspects/...` after Task 3): rewrite relative depths for the new location. They remain allowed to import Oculus fixtures (finding 4).
- [ ] **Step 5: Verify.** `pnpm install && pnpm --filter @digismith/nexus-api test && pnpm test`. Expected: green.
- [ ] **Step 6: Commit** by pathspec: `git commit -m "refactor: move the Nexus to apps (DGS-745)"`.
- [ ] **Step 7: Reinstall [conductor/Jack].** The installed Nexus copy in `~/.digismith-depot/nexus-api` is refreshed by Jack with the existing `install.sh` from `apps/nexus-api`. No LaunchAgent, Caddy or DNS change is made by a builder.

---

### Task 9: Remove the `packages/` leftovers

**Files:**
- Delete (Jack's order for each exact target): the symlink `packages/cli`, then the empty `packages/` folder
- Modify: `pnpm-workspace.yaml` (remove `"packages/*"`), `scripts/boundaries/boundaries.ts` (drop the `packages/cli` form from `SRC_ROOT` and the old lib prefixes)

- [ ] **Step 1: Check the gate.** At least one night has passed since Task 3 merged, and no live session runs a plugin version older than Task 3's (the conductor lists live sessions and their versions). If a session is older, stop and wait.
- [ ] **Step 2: Get Jack's order.** Ask for the two targets by exact path (`packages/cli` symlink, `packages/` folder). Do nothing before the yes.
- [ ] **Step 3: Failing test.** Add `no packages folder`: `fs.existsSync("packages")` is false. Run: FAIL.
- [ ] **Step 4: Remove** with `git rm packages/cli`, then remove the empty folder; edit the workspace file and the checker.
- [ ] **Step 5: Verify.** `pnpm install && pnpm test`, `grep -rn "packages/" skills hooks scripts` (inside `aspects/scripture`) returns nothing of ours, `dg --version` works.
- [ ] **Step 6: Commit** by pathspec: `git commit -m "chore: remove the packages leftovers (DGS-745)"`.

---

## Self-Review

**Spec coverage.** Decision 1 (folder table): Tasks 3, 4, 7. Decision 2 (scripts, Nexus): Tasks 6, 7, 8. Decision 3 (boundary, forward table, exports): Tasks 1, 3, 7. Decision 4 (plugin root, probe): Task 6. Decision 5 (depot paths, shim, symlink, npm check): Tasks 1, 3, 5, 9. Decision 6 (Changesets, hooks 01-03, DGS-707 note): Task 5; the DGS-707 note is for the conductor (section "For the Maestro" below). Decision 7 (public fraction): the direction test (Task 1), `private: true` (Task 7), and one gap: `aspects/scripture/public-exclude.txt` (spec section 8 item 5) has no step. It is added to Task 3 Step 3 as a file with the single line `src/shopee/`.
**Placeholder scan.** No TBD. Two steps name an unread detail on purpose and say how to settle it: Task 4 Step 1 (read `start`'s body) and Task 8 Step 1 (read the Caddyfile).
**Type consistency.** `SCRIPTURE_EXPORTS` has seven keys in Task 1 and Task 3's `exports` has the same seven. `FORWARD_PREFIXES` in the Global Constraints, Task 7's Interfaces and its code match. `resolveNotePath` keeps its signature in Task 4. `renderChangeset`, `changesetFileName` and `syncPluginVersion` are used in Task 5 as defined. Task 6's Files line says "hook 01 and 05 paths"; it means hooks 01-03 (Step 4 names the right ones).

## For the Maestro

- Findings 1-5 above amend the approved spec. None changes the layout or names Jack settled.
- For DGS-707 (read only): version rules per package; the saga/arc reset rule applies to Scripture only.
- Task 3 Step 9, Task 5 Step 10, Task 6 Steps 1 and 7, Task 7 Step 10 and Task 8 Step 7 touch Jack's installs or `~/.claude`: conductor or Jack runs them.
