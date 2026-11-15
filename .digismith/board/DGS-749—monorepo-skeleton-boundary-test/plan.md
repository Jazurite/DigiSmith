# DGS-749 Workspace Skeleton and Boundary Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the pnpm workspace globs, two empty package shells and a boundary checker with a ratchet test, with no code moved.

**Architecture:** One new script folder (`scripts/boundaries/`) holds a pure checker and its test. The checker sorts every non-test `.ts` file into a zone (`lib`, `scripture`, `oculus`, `app`, `other`) and reports each import that breaks the direction rule. The test compares the report to a KNOWN list of today's 8 imports. Two package shells and three workspace globs prepare the later moves.

**Tech Stack:** pnpm workspace, Node 24 with `--experimental-strip-types`, TypeScript, vitest.

**Spec:** `.digismith/board/DGS-749—monorepo-skeleton-boundary-test/spec.md`. Master plan: Task 1 of `.digismith/board/DGS-745—monorepo-per-aspect/plan.md` (wins over the ticket text). Ticket DGS-749, ClickUp task 14zcebryq2t. Size S. About 40 minutes for a builder.

**Chain gate:** DGS-699 and OCL-105 are merged before the builder starts.

## Constraints

- pnpm only. Never npm or yarn.
- No code moves. No change under `packages/`. New files plus two config edits only.
- Tests first: Task 1 writes the test and sees it fail before the checker exists.
- Commit by pathspec, never `git add -A`. Title-only conventional commit, no scope that is a ticket key, no AI attribution. Push after finishing.
- The depot sparse checkout (`git -C ~/.digismith-depot/repo sparse-checkout set packages aspects libs`) is outside the repo. The builder never runs it. The conductor runs it after the merge.
- The builder does not touch `~/.claude`, settings, the factory lock, installs, LaunchAgents, Caddy or DNS.

## File Structure

```
scripts/boundaries/boundaries.ts        new: zoneOf, listSources, importsOf, findViolations, keyOf
scripts/boundaries/boundaries.test.ts   new: zone map, import reader, fixture tree, ratchet
aspects/scripture/package.json          new: shell, @digismith/scripture, private
aspects/oculus/package.json             new: shell, @digismith/oculus, private
pnpm-workspace.yaml                     edit: add three globs
tsconfig.json                           edit: add two include entries
pnpm-lock.yaml                          no change (shells have no dependencies)
```

---

### Task 1: Write the boundary test (red)

**Files:**
- Create: `scripts/boundaries/boundaries.test.ts`

**Interfaces:**
- Consumes: `zoneOf`, `importsOf`, `findViolations`, `keyOf` from `./boundaries.ts` (written in Task 2).

- [ ] **Step 0: Record the baseline.** Run `pnpm test` on the clean branch. Write down the `Test Files` count as N (Task 3 Step 7 expects N + 1).
- [ ] **Step 1: Create the test file** with this exact content:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { findViolations, importsOf, keyOf, zoneOf } from "./boundaries.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Ratchet: today's Scripture -> Oculus imports. Each later move deletes the entries it fixes.
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
    expect(zoneOf("packages/cli/src/salvage/index.ts")).toBe("oculus");
    expect(zoneOf("packages/cli/src/run/limit-check.ts")).toBe("oculus");
    expect(zoneOf("packages/cli/src/conductor-registry/registry.ts")).toBe("scripture");
    expect(zoneOf("scripts/conductor/idle-check.ts")).toBe("scripture");
    expect(zoneOf("scripts/conductor/flux.ts")).toBe("oculus");
    expect(zoneOf("scripts/nexus-api/src/app.ts")).toBe("app");
    expect(zoneOf("aspects/oculus/nexus/api/src/app.ts")).toBe("app");
    expect(zoneOf("packages/clickup-client/src/index.ts")).toBe("lib");
    expect(zoneOf("libs/jira-client/src/cli.ts")).toBe("lib");
    expect(zoneOf("aspects/oculus/src/autonomous/state.ts")).toBe("oculus");
    expect(zoneOf("aspects/scripture/src/tokens/count.ts")).toBe("scripture");
    expect(zoneOf("docs/readme.ts")).toBe("other");
  });
});

describe("importsOf", () => {
  it("reads static, dynamic and side-effect imports", () => {
    expect(importsOf(`import a from "./a.ts"; const b = await import("./b.ts"); import "./c.ts";`)).toEqual(["./a.ts", "./b.ts", "./c.ts"]);
  });
});

describe("findViolations on a fixture tree", () => {
  let dir: string;
  const put = (rel: string, text: string): void => {
    fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "boundaries-"));
    put("packages/cli/src/tokens/count.ts", `import { x } from "./other.ts";`);
    put("packages/cli/src/tokens/other.ts", `export const x = 1;`);
    put("packages/cli/src/tokens/bad.ts", `import { y } from "../salvage/index.ts";`);
    put("packages/cli/src/salvage/index.ts", `export const y = 2;`);
    put("packages/cli/src/tokens/bad.test.ts", `import { y } from "../salvage/index.ts";`);
    put("packages/cli/src/tokens/pkg.ts", `import "@digismith/oculus";`);
    put("aspects/oculus/nexus/api/src/app.ts", `import "@digismith/scripture";`);
    put("aspects/oculus/src/salvage/ok.ts", `import "@digismith/scripture/run"; import "@digismith/clickup-client";`);
    put("aspects/oculus/src/salvage/deep.ts", `import "@digismith/scripture/secret";`);
    put("node_modules/skip/index.ts", `import "@digismith/oculus";`);
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("flags each breach and nothing else", () => {
    expect(findViolations(dir).map(keyOf).sort()).toEqual([
      "aspects/oculus/nexus/api/src/app.ts -> @digismith/scripture",
      "aspects/oculus/src/salvage/deep.ts -> @digismith/scripture/secret",
      "packages/cli/src/tokens/bad.ts -> ../salvage/index.ts",
      "packages/cli/src/tokens/pkg.ts -> @digismith/oculus",
    ]);
  });
});

describe("boundary", () => {
  it("has no import beyond the known list", { timeout: 30_000 }, () => {
    const keys = findViolations(ROOT).map(keyOf).sort();
    expect(keys).toEqual([...KNOWN].sort());
  });
});
```

What the fixture proves: a clean relative import passes; a Scripture file importing an Oculus folder is flagged; a `.test.ts` file importing Oculus is skipped; Scripture importing `@digismith/oculus` is flagged; a Nexus file importing `@digismith/scripture` is flagged; Oculus importing a declared Scripture export (`run`) and a lib passes; Oculus importing an undeclared Scripture subpath (`secret`) is flagged; `node_modules` is skipped.

- [ ] **Step 2: Run it and see it fail.** `pnpm vitest run scripts/boundaries/boundaries.test.ts`. Expected: FAIL with an import error, `./boundaries.ts` not found. Do not continue if it passes.

---

### Task 2: Write the checker (green)

**Files:**
- Create: `scripts/boundaries/boundaries.ts`

**Interfaces:**
- Produces: `zoneOf(rel: string): Zone`, `findViolations(root: string): Violation[]`, `keyOf(v: Violation): string`, `importsOf(text: string): string[]`, `listSources(root, dir?)`, `SCRIPTURE_EXPORTS: string[]`, `OCULUS_SRC_DIRS`, `OCULUS_RUN_FILES`, `OCULUS_SCRIPT_DIRS`, `SCRIPTURE_CONDUCTOR_FILES`. Later moves edit the four constants and `SCRIPTURE_EXPORTS`.

- [ ] **Step 1: Create `scripts/boundaries/boundaries.ts`.** Copy the fenced `ts` block of Task 1, Step 1 in `.digismith/board/DGS-745—monorepo-per-aspect/plan.md` (last changed by commit db55c0aa on main) byte for byte. That code ran on 2026-11-15 against the tree of commit 0f8d9dae and reported the 8 imports in the KNOWN list. Do not edit it. If the fenced block differs from what you find on main, stop and report: the master plan changed.
- [ ] **Step 2: Run the test.** `pnpm vitest run scripts/boundaries/boundaries.test.ts`. Expected: PASS, 4 tests (zone map, import reader, fixture tree, ratchet).
- [ ] **Step 3: If the ratchet test fails on the real tree,** the tree moved since 2026-11-15. Read the printed diff line by line. A removed import: delete that KNOWN line. A new Scripture-to-Oculus import: do not add it to KNOWN. Stop and report it as a finding (a new import is a regression against the move plan).
- [ ] **Step 4: Smoke the ratchet by hand.** Delete one KNOWN line, run the test, confirm FAIL (the report holds an import the list no longer names). Restore the line. Then add a fake line, run, confirm FAIL (the list names an import the report lacks). Restore. Run once more, confirm PASS.
- [ ] **Step 5: Commit by pathspec.** `git add scripts/boundaries && git commit -m "feat: add boundary checker and ratchet test (DGS-749)"`.

---

### Task 3: Add the shells and the workspace globs

**Files:**
- Create: `aspects/scripture/package.json`, `aspects/oculus/package.json`
- Modify: `pnpm-workspace.yaml`, `tsconfig.json`
- Regenerate: `pnpm-lock.yaml`

- [ ] **Step 1: Create `aspects/scripture/package.json`:**

```json
{
  "name": "@digismith/scripture",
  "version": "0.0.0",
  "private": true,
  "type": "module"
}
```

The version is a placeholder (spec D2). Task 3 of DGS-745 sets the real version from `.claude-plugin/plugin.json` and removes `private`.

- [ ] **Step 2: Create `aspects/oculus/package.json`:**

```json
{
  "name": "@digismith/oculus",
  "version": "0.1.0",
  "private": true,
  "type": "module"
}
```

- [ ] **Step 3: Edit `pnpm-workspace.yaml`.** Under `packages:` keep all four current lines and add three, so the list reads:

```yaml
packages:
  - "packages/*"
  - "scripts/nexus-api"
  - "scripts/nexus-shared"
  - "scripts/nexus-web"
  - "aspects/*"
  - "libs/*"
  - "aspects/oculus/nexus/*"
```

Leave `allowBuilds`, `minimumReleaseAgeExclude` and every other key as they are. There is no `apps/*` glob.

- [ ] **Step 4: Edit `tsconfig.json`.** Change `include` to:

```json
"include": ["scripts/**/*.ts", "packages/cli/src/**/*.ts", "aspects/**/*.ts", "libs/**/*.ts"]
```

- [ ] **Step 5: Install.** `pnpm install`. Expected: "Lockfile is up to date", nothing written. Then `git diff --quiet pnpm-lock.yaml` (exit 0 = no change) and `pnpm install --frozen-lockfile` (exit 0 = the new globs do not break the lockfile). If the lockfile changed, stop and report.
- [ ] **Step 6: Check the workspace sees both shells.** `pnpm ls -r --depth -1`. Expected output includes `@digismith/scripture@0.0.0` and `@digismith/oculus@0.1.0` next to the existing packages.
- [ ] **Step 7: Run the whole suite.** `pnpm test`. Expected: all green, including the 4 boundary tests. Expected `Test Files` count: N + 1 (N from Task 1 Step 0).
- [ ] **Step 8: Commit by pathspec.** `git add aspects pnpm-workspace.yaml tsconfig.json && git commit -m "feat: add workspace skeleton and package shells (DGS-749)"`. Push.

---

### Task 4: Hand off to the conductor

- [ ] **Step 1: Report the checks** in the finish report: test output with the 4 passing tests; the 8 KNOWN keys; the result of `git diff --quiet pnpm-lock.yaml` and `pnpm install --frozen-lockfile` (no lockfile change); `pnpm ls -r --depth -1` lines for both shells.
- [ ] **Step 2: Name the conductor step.** After the merge the conductor runs `git -C ~/.digismith-depot/repo sparse-checkout set packages aspects libs`, then `git -C ~/.digismith-depot/repo sparse-checkout list`. Expected: `packages`, `aspects`, `libs`. The builder runs nothing in the depot.
- [ ] **Step 3: Name two follow-ups.** (a) A ticket to change the depot clone pattern: `packages/cli/src/depot/clone/lib.ts:44` writes only `packages` into the sparse-checkout file. It must change before DGS-745 Task 2 merges. (b) For DGS-745 Task 8: `aspects/oculus/nexus/web/**` needs an entry in the vitest exclude list (today `**/scripts/nexus-web/**`), and the root `tsconfig.json` `include` needs a look.
- [ ] **Step 4: Flag the stale baseline.** Tell the Maestro that DGS-745 Task 3, Task 5 and its Global Constraints still say Scripture 1.82.0, and the plugin is 1.87.0 on 2026-11-15 (spec D2).

## Self-review (done at write time, 2026-11-15)

- Spec section 5 checks 1-4 map to Task 3 Steps 5-7 and Task 2 Step 2 (check 3 is Task 3 Step 5); check 5 maps to Task 4 Step 2.
- The checker code and the whole test file were run together in a scratch folder against the real tree on 2026-11-15: 4 of 4 passed, with the real root reporting exactly the 8 KNOWN keys.
- No file under `packages/` changes. No path on the protected paths (section 13, DEFAULT_PROTECTED) is edited.
