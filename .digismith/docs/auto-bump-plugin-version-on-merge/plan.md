# Auto Version-Bump on Finish (W.4.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `finishing-a-development-branch`'s Option 1 automatically bump DigiSmith's own plugin version (both `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`) after every successful local merge, closing the manual-bump gap recorded in `backlog/plugin-version-bump-cicd-automation.md` — without ever touching any other project that uses this same forked skill.

**Architecture:** A new, independently-testable script (`scripts/bump-plugin-version.ts`, matching `scripts/check_vendored_skills.ts`'s established shape) computes and writes the next version. `finishing-a-development-branch`'s Option 1 gains two small additions gated on a DigiSmith-tracked-work check: capture the pre-merge base SHA, then — only when `plugin.json` says `"name": "digismith"` — invoke the script and commit its result before pushing.

**Tech Stack:** TypeScript (Node's type-stripping runner, `node --experimental-strip-types`), Vitest, real git fixtures in tests (no mocking), Bash (the skill's own shell blocks).

## Global Constraints

- Full spec: `.digismith/docs/auto-bump-plugin-version-on-merge/design.html` — read it if anything below is ambiguous.
- Test command for this repo: `pnpm test` (runs `vitest run`).
- Version bump rule: integer `+1` on the minor field, patch reset to `0`, prerelease suffix (e.g. `-beta`) preserved verbatim, including its absence. Never decimal arithmetic on the version string.
- File edits to `.claude-plugin/plugin.json` / `.claude-plugin/marketplace.json` use a targeted string replace of the `"version": "..."` line only — never a full `JSON.parse`/`JSON.stringify` round-trip (would reformat the rest of the file).
- The new script assumes it is invoked with the repo root as the current working directory (same assumption `scripts/check_vendored_skills.ts` already makes).
- This repo already has a shared CLI-arg parser at `scripts/cli-args.ts` (`parseArgs`, `requireArgs`) — reuse it; do not hand-roll argv parsing.
- Gate: the auto-bump only ever runs when `<MAIN_ROOT>/.claude-plugin/plugin.json` exists and contains the literal substring `"name": "digismith"`. Any other repo (or DigiSmith's own repo missing that file) skips both new steps entirely — Option 1 behaves exactly as it does today.
- The version-bump commit is always separate from the merge commit — never amended in.
- This is DigiSmith's own self-development, in worktree `D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\auto-bump-plugin-version-on-merge`, branch `worktree-auto-bump-plugin-version-on-merge`.

---

### Task 1: `scripts/bump-plugin-version.ts` — version computation and file writes

**Files:**
- Create: `scripts/bump-plugin-version.ts`
- Test: `scripts/bump-plugin-version.test.ts`

**Interfaces:**
- Produces: `computeNextVersion(current: string): string`, `readPluginVersion(pluginJsonPath: string): string`, `bumpVersionInFile(filePath: string, nextVersion: string): void`, `versionChangedSince(baseSha: string, pluginJsonRelPath: string, cwd?: string): boolean`, and a CLI `main(): void` — all exported. Task 2 does not touch this file; Task 3 doesn't call any of these directly. This task is self-contained.

- [ ] **Step 1: Write the failing tests**

Create `scripts/bump-plugin-version.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import {
  computeNextVersion,
  readPluginVersion,
  bumpVersionInFile,
  versionChangedSince,
} from "./bump-plugin-version.ts";

function initVersionFixtureRepo(dir: string, version: string): void {
  fs.writeFileSync(path.join(dir, "plugin.json"), JSON.stringify({ name: "digismith", version }));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "fixture commit"], { cwd: dir });
}

describe("computeNextVersion", () => {
  it("increments the minor field by 1 and resets patch to 0, keeping the prerelease suffix", () => {
    expect(computeNextVersion("0.23.0-beta")).toBe("0.24.0-beta");
  });

  it("handles a version with no prerelease suffix", () => {
    expect(computeNextVersion("1.2.3")).toBe("1.3.0");
  });

  it("throws a clear error for a malformed version string", () => {
    expect(() => computeNextVersion("not-a-version")).toThrow("Cannot parse version");
  });
});

describe("readPluginVersion", () => {
  it("reads the version field from a plugin.json-shaped file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-test-"));
    const tmpFile = path.join(tmpDir, "plugin.json");
    fs.writeFileSync(tmpFile, JSON.stringify({ name: "digismith", version: "0.5.0-beta" }));

    expect(readPluginVersion(tmpFile)).toBe("0.5.0-beta");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws a clear error when the version field is missing", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-test-"));
    const tmpFile = path.join(tmpDir, "plugin.json");
    fs.writeFileSync(tmpFile, JSON.stringify({ name: "digismith" }));

    expect(() => readPluginVersion(tmpFile)).toThrow('No "version" field found');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("bumpVersionInFile", () => {
  it("replaces the version field in place, leaving the rest of the file untouched", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-test-"));
    const tmpFile = path.join(tmpDir, "plugin.json");
    const original = '{\n  "name": "digismith",\n  "version": "0.23.0-beta",\n  "keywords": ["a"]\n}\n';
    fs.writeFileSync(tmpFile, original);

    bumpVersionInFile(tmpFile, "0.24.0-beta");

    expect(fs.readFileSync(tmpFile, "utf8")).toBe(
      '{\n  "name": "digismith",\n  "version": "0.24.0-beta",\n  "keywords": ["a"]\n}\n',
    );

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws a clear error when no version field exists to replace", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-test-"));
    const tmpFile = path.join(tmpDir, "plugin.json");
    fs.writeFileSync(tmpFile, JSON.stringify({ name: "digismith" }));

    expect(() => bumpVersionInFile(tmpFile, "0.24.0-beta")).toThrow('No "version" field found to replace');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("versionChangedSince", () => {
  it("returns false when the version is unchanged since the base commit", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-repo-"));
    try {
      initVersionFixtureRepo(repoDir, "0.23.0-beta");
      const baseSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).stdout.trim();

      expect(versionChangedSince(baseSha, "plugin.json", repoDir)).toBe(false);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("returns true when the working tree's version differs from the base commit's", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-repo-"));
    try {
      initVersionFixtureRepo(repoDir, "0.23.0-beta");
      const baseSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).stdout.trim();
      fs.writeFileSync(path.join(repoDir, "plugin.json"), JSON.stringify({ name: "digismith", version: "0.24.0-beta" }));

      expect(versionChangedSince(baseSha, "plugin.json", repoDir)).toBe(true);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- bump-plugin-version`
Expected: FAIL — `Cannot find module './bump-plugin-version.ts'` (or similar), since the file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `scripts/bump-plugin-version.ts`:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "./cli-args.ts";

export function computeNextVersion(current: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(-.+)?$/.exec(current);
  if (!match) {
    throw new Error(`Cannot parse version: ${current}`);
  }
  const [, major, minor, , prerelease] = match;
  return `${major}.${Number(minor) + 1}.0${prerelease ?? ""}`;
}

export function readPluginVersion(pluginJsonPath: string): string {
  const content = fs.readFileSync(pluginJsonPath, "utf8");
  const parsed = JSON.parse(content) as { version?: string };
  if (typeof parsed.version !== "string") {
    throw new Error(`No "version" field found in ${pluginJsonPath}`);
  }
  return parsed.version;
}

export function bumpVersionInFile(filePath: string, nextVersion: string): void {
  const content = fs.readFileSync(filePath, "utf8");
  const updated = content.replace(/"version":\s*"[^"]+"/, `"version": "${nextVersion}"`);
  if (updated === content) {
    throw new Error(`No "version" field found to replace in ${filePath}`);
  }
  fs.writeFileSync(filePath, updated);
}

export function versionChangedSince(
  baseSha: string,
  pluginJsonRelPath: string,
  cwd: string = process.cwd(),
): boolean {
  const result = spawnSync("git", ["show", `${baseSha}:${pluginJsonRelPath}`], { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git show failed for ${baseSha}:${pluginJsonRelPath}: ${result.stderr}`);
  }
  const parsed = JSON.parse(result.stdout) as { version?: string };
  if (typeof parsed.version !== "string") {
    throw new Error(`No "version" field found at ${baseSha}:${pluginJsonRelPath}`);
  }
  const currentVersion = readPluginVersion(path.join(cwd, pluginJsonRelPath));
  return parsed.version !== currentVersion;
}

const PLUGIN_JSON_PATH = ".claude-plugin/plugin.json";
const MARKETPLACE_JSON_PATH = ".claude-plugin/marketplace.json";

export function main(): void {
  const args = parseArgs(process.argv.slice(2));

  try {
    const currentVersion = readPluginVersion(PLUGIN_JSON_PATH);

    if (args.base !== undefined && versionChangedSince(args.base, PLUGIN_JSON_PATH)) {
      console.log(`SKIPPED already changed by incoming branch (current: ${currentVersion})`);
      return;
    }

    const nextVersion = computeNextVersion(currentVersion);
    bumpVersionInFile(PLUGIN_JSON_PATH, nextVersion);
    bumpVersionInFile(MARKETPLACE_JSON_PATH, nextVersion);
    console.log(`BUMPED ${currentVersion} -> ${nextVersion}`);
  } catch (err) {
    console.error(`Cannot bump plugin version: ${(err as Error).message}`);
    process.exit(1);
  }
}

if (import.meta.filename === process.argv[1]) {
  main();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- bump-plugin-version`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Manual smoke test of the CLI itself**

Run from the repo root: `node --experimental-strip-types scripts/bump-plugin-version.ts --base HEAD`
Expected: `HEAD`'s own `plugin.json` version is identical to the working tree's (nothing staged), so `versionChangedSince` returns `false` — the `if` in `main()` is not entered, the bump proceeds normally, and the script prints `BUMPED <current> -> <next>`, actually rewriting both files. **Immediately revert this smoke-test write** — it is not a real bump, just a manual check that the script runs end-to-end:

```bash
git checkout -- .claude-plugin/plugin.json .claude-plugin/marketplace.json
```

Confirm `git status` shows no changes to either file before continuing.

- [ ] **Step 6: Commit**

```bash
git add scripts/bump-plugin-version.ts scripts/bump-plugin-version.test.ts
git commit -m "feat(bump-plugin-version): compute and write DigiSmith's next plugin version"
```

---

### Task 2: Wire the auto-bump into `finishing-a-development-branch`'s Option 1

**Files:**
- Modify: `skills/finishing-a-development-branch/SKILL.md:86-122` (the `### Option 1: Merge Locally` subsection)

**Interfaces:**
- Consumes: `scripts/bump-plugin-version.ts`'s CLI contract from Task 1 — invoked as `node --experimental-strip-types scripts/bump-plugin-version.ts --base <sha>`, stdout starting with `BUMPED` or `SKIPPED`, exit 0 on success, exit 1 with a stderr message on failure.
- No new interfaces produced — this task only edits skill prose/bash, no code.

There is no automated test harness for skill-body prose in this repo (`SKILL.md` files aren't covered by `pnpm test`) — verification here is a careful manual read-through plus the end-to-end smoke test in Step 3 below. The real, live proof is this very plan's own merge in the finishing step, which will exercise this exact new code path for the first time.

- [ ] **Step 1: Replace the Option 1 subsection**

In `skills/finishing-a-development-branch/SKILL.md`, replace the entire `### Option 1: Merge Locally` subsection (currently lines 86-122, ending right before `### Option 2: Push and Create PR`) with:

```markdown
### Option 1: Merge Locally

```bash
# Get main repo root for CWD safety
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"

# Merge first — verify success before removing anything
git checkout <base-branch>
git pull
BASE_SHA=$(git rev-parse HEAD)
git merge <feature-branch>

# Verify tests on merged result
<test command>
```

If tests fail on the merged result: stop, leave the worktree and branch in
place, and investigate — nothing has been pushed, so the merge is local
and recoverable.

**DigiSmith's own repo only:** once the merged result is green, before
pushing, check whether this is DigiSmith's own repo (never any other
project using this same forked skill):

```bash
IS_DIGISMITH=false
if [ -f "$MAIN_ROOT/.claude-plugin/plugin.json" ] && grep -q '"name": "digismith"' "$MAIN_ROOT/.claude-plugin/plugin.json"; then
  IS_DIGISMITH=true
fi
```

If `IS_DIGISMITH` is `true`, bump the plugin version:

```bash
BUMP_OUTPUT=$(node --experimental-strip-types scripts/bump-plugin-version.ts --base "$BASE_SHA")
echo "$BUMP_OUTPUT"
if [[ "$BUMP_OUTPUT" == BUMPED* ]]; then
  git add .claude-plugin/plugin.json .claude-plugin/marketplace.json
  git commit -m "chore: bump plugin version"
fi
```

A `BUMPED` result commits both version files in their own commit, never
amended into the merge commit. A `SKIPPED` result means the incoming
branch's own commits already changed the version — do nothing further. If
this isn't DigiSmith's own repo, both steps above are skipped entirely and
Option 1 proceeds exactly as it always has.

Once the merged result is green (and, for DigiSmith's own repo, the bump
above has run), push `<base-branch>` to origin:

```bash
git push origin <base-branch>
```

If the push is rejected (the remote moved since `git pull` above): stop,
report the rejection plainly, and investigate — do not force-push
automatically. Force-push only on your human partner's explicit request
(see "The push was rejected — force-push will fix it" below).

Once the push succeeds: clean up the worktree (Step 6), then delete the
branch:

```bash
git branch -d <feature-branch>
```
```

- [ ] **Step 2: Read the whole file once, end to end**

Open `skills/finishing-a-development-branch/SKILL.md` and read it top to bottom. Confirm: the `### Option 2: Push and Create PR` heading and everything after it is unchanged; `BASE_SHA` is only ever referenced inside Option 1 (Option 2 and the discard path don't need it); the fenced code blocks all balance (no stray ` ``` `); nothing else in the file mentions plugin.json or version bumping.

- [ ] **Step 3: Manual smoke test of the gating check**

Run from the repo root (this repo genuinely is DigiSmith, so this should evaluate true):

```bash
IS_DIGISMITH=false
if [ -f "./.claude-plugin/plugin.json" ] && grep -q '"name": "digismith"' "./.claude-plugin/plugin.json"; then
  IS_DIGISMITH=true
fi
echo "$IS_DIGISMITH"
```

Expected output: `true`.

- [ ] **Step 4: Commit**

```bash
git add skills/finishing-a-development-branch/SKILL.md
git commit -m "feat(finishing-a-development-branch): auto-bump DigiSmith's plugin version on merge (W.4.1)"
```

---

### Task 3: Doc updates and backlog retirement

**Files:**
- Modify: `MEMORY.md` (the **W** map-item row)
- Modify: `vendored/PROVENANCE.md` (the `finishing-a-development-branch` entry under "Skills activated (diverged from source)")
- Modify: `backlog/README.md` (remove one line)
- Delete: `backlog/plugin-version-bump-cicd-automation.md`

**Interfaces:** None — pure documentation, no code.

- [ ] **Step 1: Add the W.4.1 entry to `MEMORY.md`**

In `MEMORY.md`, find this exact substring inside the **W** row (it currently reads, in full, ending right before the **W.5** sentence):

```
remained dormant at that point (see **W.5** immediately below for what changed next) · **W.5** built 2026-09-04:
```

Replace it with:

```
remained dormant at that point (see **W.5** immediately below for what changed next) · **W.4.1** built 2026-09-05: further diverged `finishing-a-development-branch`'s Option 1 with an automatic plugin-version bump — a new `scripts/bump-plugin-version.ts` computes the next version (integer +1 on the minor field, patch reset to 0, prerelease suffix preserved) and writes it into both `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` (closing a second, independently-discovered drift: marketplace.json's own copy was already stale). Gated strictly to DigiSmith's own repo via the same DigiSmith-tracked-work check W.5's `brainstorming` established (`plugin.json` has `"name": "digismith"`) — closes the 7-miss manual-bump gap recorded in `backlog/plugin-version-bump-cicd-automation.md` (now retired). A general lifecycle-hook mechanism (stock/custom hooks across SDLC points) was raised during this brainstorm and deliberately deferred to its own future letter — see `backlog/digismith-lifecycle-hooks-y.md` (**Y**). See `.digismith/docs/auto-bump-plugin-version-on-merge/design.html` · **W.5** built 2026-09-04:
```

Do not touch any other part of the **W** row.

- [ ] **Step 2: Add the divergence note to `vendored/PROVENANCE.md`**

Find this exact substring:

```
- **finishing-a-development-branch** — map item **W.4**, activated 2026-09-04.
  Option 1 ("Merge Locally") now pushes `<base-branch>` to origin after a
  successful merge and green tests. See DigiSmith `MEMORY.md` map item W.
```

Replace it with:

```
- **finishing-a-development-branch** — map item **W.4**, activated 2026-09-04.
  Option 1 ("Merge Locally") now pushes `<base-branch>` to origin after a
  successful merge and green tests. **Further diverged by W.4.1** (2026-09-05):
  Option 1 now also bumps `.claude-plugin/plugin.json` and
  `.claude-plugin/marketplace.json`'s version (via `scripts/bump-plugin-version.ts`)
  after a successful merge, gated strictly to DigiSmith's own repo. See DigiSmith
  `MEMORY.md` map item W.
```

- [ ] **Step 3: Retire the superseded backlog item**

Delete the file `backlog/plugin-version-bump-cicd-automation.md`.

In `backlog/README.md`, remove this exact line entirely (including its trailing newline):

```
- [Plugin version bump has no automation — CI/CD pipeline, not a skill step](plugin-version-bump-cicd-automation.md) — 7 merges since the last real bump shipped without one; belongs in a future CI/CD pipeline for DigiSmith, not `finishing-a-development-branch`
```

- [ ] **Step 4: Run the full test suite once more**

Run: `pnpm test`
Expected: PASS — this task touched no code, so the full suite (same count as before this plan started) should still be fully green.

- [ ] **Step 5: Commit**

```bash
git add MEMORY.md vendored/PROVENANCE.md backlog/README.md
git rm backlog/plugin-version-bump-cicd-automation.md
git commit -m "docs(W.4.1): record auto version-bump in MEMORY.md and PROVENANCE.md, retire superseded backlog item"
```
