# Post-Finish Merge Pinning (W.4.1 hardening) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every range-reading `post-finish` hook read a per-branch pinned merge range instead of `ORIG_HEAD` and the live tree, so a delayed hook produces exactly the result an immediate one would.

**Architecture:** `finishing-a-development-branch` Option 1 writes two git refs — `refs/digismith/post-finish/<feature-branch>/base` (= `ORIG_HEAD`) and `.../head` (= `HEAD`) — right after `git merge`, and deletes them after the hooks fire; `fire-lifecycle-hook.md` documents that contract point-agnostically. Hooks `01` and `03` read those refs and pass `--base`/`--head` to their scripts; `bump-plugin-version.ts` and `update-history.ts` reason only about `base..head`, never the working tree, `HEAD`, or `ORIG_HEAD`.

**Tech Stack:** TypeScript (Node `--experimental-strip-types`), Vitest with real git fixtures (no mocking — this file family's existing style), agentic Markdown for the skill and hook files.

## Global Constraints

- Full spec: `.digismith/docs/version-bump-concurrent-merge/design.html` — read it if anything below is ambiguous.
- Pin ref names, exactly: `refs/digismith/post-finish/<feature-branch>/base` and `refs/digismith/post-finish/<feature-branch>/head`. `<feature-branch>` and `<base-branch>` are placeholders the agent running the skill substitutes from its own context — they stay as literal angle-bracket text inside the `.md` files.
- Scripts never read the live working tree, `HEAD`, or `ORIG_HEAD` to reason about the merge range. The one deliberate exception: the bump itself still reads the *current* `plugin.json` version to increment and still edits the live files — "one past whatever `main` is at now" is what a fresh cache key needs.
- Invariant the code must satisfy: every merge bumps exactly once unless its own commits (`base..head`) already changed `plugin.json`, and every merge records exactly its own reports — regardless of when its hooks fire or what else has landed on the shared checkout since.
- `bump-plugin-version.ts`: `--head` is required whenever `--base` is given, and vice versa (both or neither). `update-history.ts`: `--base` and `--head` are both required. A usage error is rejected through the shared `requireArgs` helper in `scripts/cli-args.ts` (it throws `missing required flag: --<name>`), giving a non-zero exit — never invent a separate exit code.
- Missing pin in a hook → fail loud with a message naming the missing ref, then stop. **No fallback to `ORIG_HEAD` anywhere.**
- Hook bash blocks: shell variables do **not** survive from one bash block to the next (a real W.4.1 bug, fixed in `e7ca1a7`). The pin reads and every command that uses `BASE_SHA`/`HEAD_SHA` must sit in the **same** block.
- Test command for this repo: `pnpm test` (runs `vitest run`). Single file: `pnpm exec vitest run <path>`.
- Existing tests keep passing with only the signature changes this plan specifies, except the one test the spec deliberately inverts (`versionChangedSince`'s "working tree differs → true" becomes "uncommitted working-tree edit → false").
- Commit messages: title only, no body, **no AI attribution of any kind** (no `Co-Authored-By`, no "Generated with", no robot emoji) — this repo's standing rule, mechanically enforced by `check-attribution` before any review package is written. After every commit, run `git log -1 --format=%B` and confirm the message is exactly the one line you intended.
- This is DigiSmith's own self-development. Other Claude Code sessions are concurrently active on the same repo. Before any edit that relies on an exact "find" substring against a shared doc (`MEMORY.md`, `backlog/README.md`, `vendored/PROVENANCE.md`, `backlog/post-finish-hooks-direct-push-gap.md`), confirm the substring still matches the file's current content; if it doesn't, stop and report rather than guess at a fuzzy replacement.
- Windows checkout: do not change a file's existing line-ending style; edit in place.

---

### Task 1: `bump-plugin-version.ts` reasons only about the pinned `base..head`

**Files:**
- Modify: `.digismith/hooks/post-finish/scripts/bump-plugin-version.ts`
- Modify: `.digismith/hooks/post-finish/scripts/bump-plugin-version.test.ts`

**Interfaces:**
- Consumes: `parseArgs`, `requireArgs` from `scripts/cli-args.ts` (existing; `requireArgs(args, names)` throws `Error("missing required flag: --x")` when any name is absent).
- Produces (exported, used by Task 4's hook via the CLI):
  - `versionChangedSince(baseSha: string, headSha: string, pluginJsonRelPath: string, cwd?: string): boolean` — true iff the `version` field of `pluginJsonRelPath` differs between `git show <base>:` and `git show <head>:`.
  - `bumpTypeSince(baseSha: string, headSha: string, cwd?: string): "patch" | "minor"` — same rule as today, over `base..head`.
  - CLI: `node --experimental-strip-types .digismith/hooks/post-finish/scripts/bump-plugin-version.ts --base <sha> --head <sha>`; output first word `BUMPED` or `SKIPPED`; exit 1 with `Cannot bump plugin version: missing required flag: --head` on `--base` alone (and the mirror for `--head` alone).

- [ ] **Step 1: Write the failing tests**

Read the current full contents of `.digismith/hooks/post-finish/scripts/bump-plugin-version.test.ts` first. Then make these changes.

Add two imports at the top (after the existing `spawnSync` import):

```typescript
import { fileURLToPath } from "node:url";
```

Add these helpers right after the existing `commitMessage` helper:

```typescript
function revParseHead(dir: string): string {
  return spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).stdout.trim();
}

function commitVersion(dir: string, version: string, message: string): void {
  fs.writeFileSync(path.join(dir, "plugin.json"), JSON.stringify({ name: "digismith", version }));
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", message], { cwd: dir });
}

// Fixture shaped like DigiSmith's real repo root, for exercising main() end to end.
function initPluginFixtureRepo(dir: string, version: string): void {
  fs.mkdirSync(path.join(dir, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "digismith", version }, null, 2) + "\n",
  );
  fs.writeFileSync(
    path.join(dir, ".claude-plugin", "marketplace.json"),
    JSON.stringify({ name: "jazurite", version }, null, 2) + "\n",
  );
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "fixture commit"], { cwd: dir });
}

function commitPluginVersion(dir: string, version: string, message: string): void {
  const pluginPath = path.join(dir, ".claude-plugin", "plugin.json");
  const updated = fs.readFileSync(pluginPath, "utf8").replace(/"version": "[^"]+"/, `"version": "${version}"`);
  fs.writeFileSync(pluginPath, updated);
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", message], { cwd: dir });
}

const SCRIPT_PATH = fileURLToPath(new URL("./bump-plugin-version.ts", import.meta.url));

function runScript(cwd: string, args: string[]) {
  return spawnSync("node", ["--experimental-strip-types", SCRIPT_PATH, ...args], { cwd, encoding: "utf8" });
}
```

Replace the entire existing `describe("versionChangedSince", ...)` block with:

```typescript
describe("versionChangedSince", () => {
  it("returns false when plugin.json is identical at base and head", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-repo-"));
    try {
      initVersionFixtureRepo(repoDir, "0.23.0-beta");
      const baseSha = revParseHead(repoDir);
      commitMessage(repoDir, "docs: unrelated change");
      const headSha = revParseHead(repoDir);

      expect(versionChangedSince(baseSha, headSha, "plugin.json", repoDir)).toBe(false);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("returns true when a commit inside base..head changed the version", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-repo-"));
    try {
      initVersionFixtureRepo(repoDir, "0.23.0-beta");
      const baseSha = revParseHead(repoDir);
      commitVersion(repoDir, "0.24.0-beta", "chore: bump plugin version");
      const headSha = revParseHead(repoDir);

      expect(versionChangedSince(baseSha, headSha, "plugin.json", repoDir)).toBe(true);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("returns false when the version changed only after head — the delayed-hook case", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-repo-"));
    try {
      initVersionFixtureRepo(repoDir, "0.23.0-beta");
      const baseSha = revParseHead(repoDir);
      commitMessage(repoDir, "docs: this merge's own commit");
      const headSha = revParseHead(repoDir);
      commitVersion(repoDir, "0.24.0-beta", "chore: bump plugin version (another session's later merge)");

      expect(versionChangedSince(baseSha, headSha, "plugin.json", repoDir)).toBe(false);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("ignores the live working tree — an uncommitted version edit is not a change in base..head", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-repo-"));
    try {
      initVersionFixtureRepo(repoDir, "0.23.0-beta");
      const sha = revParseHead(repoDir);
      fs.writeFileSync(path.join(repoDir, "plugin.json"), JSON.stringify({ name: "digismith", version: "0.24.0-beta" }));

      expect(versionChangedSince(sha, sha, "plugin.json", repoDir)).toBe(false);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("throws a clear error when head does not exist", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-repo-"));
    try {
      initVersionFixtureRepo(repoDir, "0.23.0-beta");
      const baseSha = revParseHead(repoDir);

      expect(() =>
        versionChangedSince(baseSha, "0000000000000000000000000000000000000000", "plugin.json", repoDir),
      ).toThrow("git show failed");
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });
});
```

In the existing `describe("bumpTypeSince", ...)` block, change every call `bumpTypeSince(baseSha, repoDir)` (there are five) to `bumpTypeSince(baseSha, revParseHead(repoDir), repoDir)`. Leave everything else in those five tests untouched. Then add one new test at the end of that block:

```typescript
  it("ignores commits after head — a later merge's feat does not change this merge's bump type", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-type-"));
    try {
      initVersionFixtureRepo(repoDir, "0.29.0-beta");
      const baseSha = revParseHead(repoDir);
      commitMessage(repoDir, "fix(hooks): this merge's only commit");
      const headSha = revParseHead(repoDir);
      commitMessage(repoDir, "feat(other): another session's later merge");

      expect(bumpTypeSince(baseSha, headSha, repoDir)).toBe("patch");
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });
```

Add a new `describe` block at the very end of the file:

```typescript
describe("main (CLI)", () => {
  it("rejects --base without --head", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-cli-"));
    try {
      const result = runScript(dir, ["--base", "abc1234"]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Cannot bump plugin version: missing required flag: --head");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects --head without --base", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-cli-"));
    try {
      const result = runScript(dir, ["--head", "abc1234"]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Cannot bump plugin version: missing required flag: --base");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("bumps patch when the pinned range is fix-only", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-cli-"));
    try {
      initPluginFixtureRepo(dir, "0.23.0-beta");
      const baseSha = revParseHead(dir);
      commitMessage(dir, "fix(hooks): something small");
      const headSha = revParseHead(dir);

      const result = runScript(dir, ["--base", baseSha, "--head", headSha]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("BUMPED 0.23.0-beta -> 0.23.1-beta");
      expect(readPluginVersion(path.join(dir, ".claude-plugin", "plugin.json"))).toBe("0.23.1-beta");
      expect(readPluginVersion(path.join(dir, ".claude-plugin", "marketplace.json"))).toBe("0.23.1-beta");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a delayed run still bumps exactly once, from the version the branch is at now", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-cli-"));
    try {
      initPluginFixtureRepo(dir, "0.23.0-beta");
      const baseSha = revParseHead(dir);
      commitMessage(dir, "fix(hooks): this merge's only commit");
      const headSha = revParseHead(dir);
      // Another session merged and bumped after this merge's head, before this hook ran.
      commitPluginVersion(dir, "0.24.0-beta", "chore: bump plugin version");

      const result = runScript(dir, ["--base", baseSha, "--head", headSha]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("BUMPED 0.24.0-beta -> 0.24.1-beta");
      expect(result.stdout).not.toContain("SKIPPED");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("skips when this merge's own commits already changed plugin.json", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-bump-cli-"));
    try {
      initPluginFixtureRepo(dir, "0.23.0-beta");
      const baseSha = revParseHead(dir);
      commitPluginVersion(dir, "0.30.0-beta", "feat: manual version bump inside the branch");
      const headSha = revParseHead(dir);

      const result = runScript(dir, ["--base", baseSha, "--head", headSha]);

      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/^SKIPPED this merge's own commits already changed plugin\.json/);
      expect(readPluginVersion(path.join(dir, ".claude-plugin", "plugin.json"))).toBe("0.30.0-beta");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run .digismith/hooks/post-finish/scripts/bump-plugin-version.test.ts`

Expected: FAIL. The new `versionChangedSince` tests fail because the current 3-argument signature treats `headSha` as the `pluginJsonRelPath` (`git show <base>:<sha>` fails); the `bumpTypeSince` tests fail because the middle argument is now treated as `cwd`; `main (CLI)` "rejects" tests fail because the script currently accepts `--base` alone; the "delayed run" test fails with `SKIPPED` in stdout.

- [ ] **Step 3: Implement**

Replace the entire contents of `.digismith/hooks/post-finish/scripts/bump-plugin-version.ts` with:

```typescript
import * as fs from "node:fs";
import { spawnSync } from "node:child_process";
import { parseArgs, requireArgs } from "../../../../scripts/cli-args.ts";

export function computeNextVersion(current: string, bumpType: "patch" | "minor" = "minor"): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(-.+)?$/.exec(current);
  if (!match) {
    throw new Error(`Cannot parse version: ${current}`);
  }
  const [, major, minor, patch, prerelease] = match;
  if (bumpType === "patch") {
    return `${major}.${minor}.${Number(patch) + 1}${prerelease ?? ""}`;
  }
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

function versionAt(sha: string, pluginJsonRelPath: string, cwd: string): string {
  const result = spawnSync("git", ["show", `${sha}:${pluginJsonRelPath}`], { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git show failed for ${sha}:${pluginJsonRelPath}: ${result.stderr}`);
  }
  const parsed = JSON.parse(result.stdout) as { version?: string };
  if (typeof parsed.version !== "string") {
    throw new Error(`No "version" field found at ${sha}:${pluginJsonRelPath}`);
  }
  return parsed.version;
}

// Compares the committed version at base against the committed version at head — never the
// live working tree, which another session's merge may have moved since this merge landed.
export function versionChangedSince(
  baseSha: string,
  headSha: string,
  pluginJsonRelPath: string,
  cwd: string = process.cwd(),
): boolean {
  return versionAt(baseSha, pluginJsonRelPath, cwd) !== versionAt(headSha, pluginJsonRelPath, cwd);
}

export function bumpTypeSince(baseSha: string, headSha: string, cwd: string = process.cwd()): "patch" | "minor" {
  const result = spawnSync("git", ["log", `${baseSha}..${headSha}`, "--format=%s"], { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git log failed for ${baseSha}..${headSha}: ${result.stderr}`);
  }
  const subjects = result.stdout.split("\n").filter((line) => line.length > 0);
  if (subjects.length === 0) {
    return "minor";
  }
  const fixPattern = /^fix(\([^)]*\))?:/;
  const allFix = subjects.every((subject) => fixPattern.test(subject));
  return allFix ? "patch" : "minor";
}

const PLUGIN_JSON_PATH = ".claude-plugin/plugin.json";
const MARKETPLACE_JSON_PATH = ".claude-plugin/marketplace.json";

export function main(): void {
  const args = parseArgs(process.argv.slice(2));

  try {
    if (args.base !== undefined || args.head !== undefined) {
      requireArgs(args, ["base", "head"]);
    }
    const pinned = args.base !== undefined;
    const currentVersion = readPluginVersion(PLUGIN_JSON_PATH);

    if (pinned && versionChangedSince(args.base, args.head, PLUGIN_JSON_PATH)) {
      console.log(
        `SKIPPED this merge's own commits already changed plugin.json ` +
          `(${args.base.slice(0, 7)}..${args.head.slice(0, 7)}; current: ${currentVersion})`,
      );
      return;
    }

    const bumpType = pinned ? bumpTypeSince(args.base, args.head) : "minor";
    const nextVersion = computeNextVersion(currentVersion, bumpType);
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

Note what changed versus the previous file: the `node:path` import is gone (nothing uses it now); `versionAt` is a new private helper; `versionChangedSince` and `bumpTypeSince` take `headSha` as their second parameter; `main()` enforces both-or-neither via `requireArgs` *before* reading `plugin.json` (so the usage error wins even in a directory with no plugin file), passes `args.head` through, and prints the corrected `SKIPPED` wording.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run .digismith/hooks/post-finish/scripts/bump-plugin-version.test.ts`

Expected: PASS — every test in the file, including the pre-existing `computeNextVersion`, `readPluginVersion`, and `bumpVersionInFile` tests, which are untouched.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`

Expected: PASS. Nothing outside this file imports `versionChangedSince` or `bumpTypeSince` (confirm with `grep -rn "versionChangedSince\|bumpTypeSince" --include=*.ts . | grep -v node_modules` — only the two files in this task should appear).

- [ ] **Step 6: Commit**

```bash
git add .digismith/hooks/post-finish/scripts/bump-plugin-version.ts .digismith/hooks/post-finish/scripts/bump-plugin-version.test.ts
git commit -m "feat(hooks): pin version-bump reasoning to --base/--head instead of the live tree"
git log -1 --format=%B
```

The last command must print exactly that one line and nothing else.

---

### Task 2: `update-history.ts` scans `base..head`

**Files:**
- Modify: `.digismith/hooks/post-finish/scripts/update-history.ts:6-16` (`findChangedReports`) and `:123,127` (`main()`'s `requireArgs` and call)
- Modify: `.digismith/hooks/post-finish/scripts/update-history.test.ts`

**Interfaces:**
- Consumes: `requireArgs` from `scripts/cli-args.ts` (already imported in this file).
- Produces (exported, used by Task 4's hook via the CLI):
  - `findChangedReports(baseSha: string, headSha: string, cwd?: string): string[]` — repo-relative paths of `.digismith/docs/*/report.html` files added or modified in `base..head`.
  - CLI: `node --experimental-strip-types .digismith/hooks/post-finish/scripts/update-history.ts --base <sha> --head <sha>`; unchanged `APPENDED <n>: ...` / `NOTHING (no report in range)` output contract; non-zero exit with `missing required flag: --head` on stderr when `--head` is absent.

- [ ] **Step 1: Write the failing tests**

Read the current full contents of `.digismith/hooks/post-finish/scripts/update-history.test.ts` first.

Add one import at the top (after the existing `spawnSync` import):

```typescript
import { fileURLToPath } from "node:url";
```

Add these helpers right after the existing `initHistoryFixtureRepo` function (near the bottom of the file, just before `describe("findChangedReports", ...)`):

```typescript
function revParseHead(dir: string): string {
  return spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).stdout.trim();
}

const SCRIPT_PATH = fileURLToPath(new URL("./update-history.ts", import.meta.url));

function runScript(cwd: string, args: string[]) {
  return spawnSync("node", ["--experimental-strip-types", SCRIPT_PATH, ...args], { cwd, encoding: "utf8" });
}
```

In the existing `describe("findChangedReports", ...)` block, change all three calls `findChangedReports(baseSha, dir)` to `findChangedReports(baseSha, revParseHead(dir), dir)`. Leave everything else in those three tests untouched. Then add one new test at the end of that block:

```typescript
  it("ignores a report added after head — the delayed-hook case", () => {
    const dir = makeTmpDir("update-history-repo-");
    try {
      initHistoryFixtureRepo(dir);
      const baseSha = revParseHead(dir);

      fs.writeFileSync(path.join(dir, "README.md"), "this merge's own change");
      spawnSync("git", ["add", "-A"], { cwd: dir });
      spawnSync("git", ["commit", "-q", "-m", "this merge's own commit"], { cwd: dir });
      const headSha = revParseHead(dir);

      const reportPath = path.join(dir, ".digismith", "docs", "sample-feature", "report.html");
      writeReportFixture(reportPath);
      spawnSync("git", ["add", "-A"], { cwd: dir });
      spawnSync("git", ["commit", "-q", "-m", "another session's later merge adds a report"], { cwd: dir });

      expect(findChangedReports(baseSha, headSha, dir)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
```

Add a new `describe` block at the very end of the file:

```typescript
describe("main (CLI)", () => {
  it("rejects a missing --head", () => {
    const dir = makeTmpDir("update-history-cli-");
    try {
      initHistoryFixtureRepo(dir);
      const baseSha = revParseHead(dir);

      const result = runScript(dir, ["--base", baseSha]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("missing required flag: --head");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports NOTHING for a pinned range with no report in it", () => {
    const dir = makeTmpDir("update-history-cli-");
    try {
      initHistoryFixtureRepo(dir);
      const baseSha = revParseHead(dir);
      fs.writeFileSync(path.join(dir, "README.md"), "changed");
      spawnSync("git", ["add", "-A"], { cwd: dir });
      spawnSync("git", ["commit", "-q", "-m", "unrelated change"], { cwd: dir });
      const headSha = revParseHead(dir);

      const result = runScript(dir, ["--base", baseSha, "--head", headSha]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("NOTHING (no report in range)");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run .digismith/hooks/post-finish/scripts/update-history.test.ts`

Expected: FAIL. The three updated `findChangedReports` tests and the new delayed-hook test fail because the current 2-argument signature treats the SHA as `cwd` (`spawnSync` fails with ENOENT or `git diff` errors); "rejects a missing --head" fails because the script currently runs fine with `--base` alone.

- [ ] **Step 3: Implement**

In `.digismith/hooks/post-finish/scripts/update-history.ts`, replace the `findChangedReports` function (lines 6-16) with:

```typescript
// Diffs the pinned merge range only — never `HEAD`, which another session's merge may have
// moved since this merge landed.
export function findChangedReports(baseSha: string, headSha: string, cwd: string = process.cwd()): string[] {
  const result = spawnSync(
    "git",
    ["diff", "--name-only", "--diff-filter=AM", `${baseSha}..${headSha}`, "--", ".digismith/docs/*/report.html"],
    { cwd, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`git diff failed for ${baseSha}..${headSha}: ${result.stderr}`);
  }
  return result.stdout.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
}
```

In `main()`, change

```typescript
  requireArgs(args, ["base"]);
```

to

```typescript
  requireArgs(args, ["base", "head"]);
```

and change

```typescript
    const changedReports = findChangedReports(args.base, cwd);
```

to

```typescript
    const changedReports = findChangedReports(args.base, args.head, cwd);
```

Nothing else in the file changes.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run .digismith/hooks/post-finish/scripts/update-history.test.ts`

Expected: PASS — all tests, including the untouched `parseReport`, `buildReferenceLinks`, `buildEventHtml`, `insertTimelineEntries`, and `bumpLastUpdated` blocks.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .digismith/hooks/post-finish/scripts/update-history.ts .digismith/hooks/post-finish/scripts/update-history.test.ts
git commit -m "feat(hooks): scan update-history's report range as the pinned base..head"
git log -1 --format=%B
```

The last command must print exactly that one line and nothing else.

---

### Task 3: Option 1 pins the merge; the firing contract documents it

**Files:**
- Modify: `skills/finishing-a-development-branch/SKILL.md:169-208` (Option 1) and `:313` (Common Rationalizations, last row)
- Modify: `skills/finishing-a-development-branch/fire-lifecycle-hook.md`

**Interfaces:**
- Consumes: nothing from Tasks 1-2 directly (prose only).
- Produces: the two pin refs `refs/digismith/post-finish/<feature-branch>/base` and `.../head`, written right after `git merge <feature-branch>` and deleted after the hooks fire; the "Merge-range pins" section in `fire-lifecycle-hook.md` that Task 4's hooks cite by name.

- [ ] **Step 1: Edit Option 1's merge block**

In `skills/finishing-a-development-branch/SKILL.md`, find this exact block (inside the Option 1 bash fence):

```bash
# Merge first — verify success before removing anything
git checkout <base-branch>
git pull
git merge <feature-branch>

# Verify tests on merged result
<test command>
```

Replace it with:

```bash
# Merge first — verify success before removing anything
git checkout <base-branch>
git pull
git merge <feature-branch>

# Pin this merge's range for the post-finish hooks (see fire-lifecycle-hook.md,
# "Merge-range pins"). Keyed by branch, so concurrent merges on a shared
# checkout never clobber each other's pins.
git update-ref refs/digismith/post-finish/<feature-branch>/base ORIG_HEAD
git update-ref refs/digismith/post-finish/<feature-branch>/head HEAD

# Verify tests on merged result
<test command>
```

- [ ] **Step 2: Extend the merged-tests-fail paragraph**

Find this exact paragraph:

```
If tests fail on the merged result: stop, leave the worktree and branch in
place, and investigate — nothing has been pushed, so the merge is local
and recoverable.
```

Replace it with:

```
If tests fail on the merged result: stop, leave the worktree and branch in
place, and investigate — nothing has been pushed, so the merge is local
and recoverable. The two pin refs written above are inert leftovers in
that case: nothing reads them until a `post-finish` hook for this branch
fires, and the next Option 1 run for the same branch overwrites them.
```

- [ ] **Step 3: Replace the hook-firing paragraph and add the unpin step**

Find this exact paragraph:

```
Finally, fire the `post-finish` lifecycle hook: see `fire-lifecycle-hook.md`
(in this skill's own folder) for the procedure. This runs in every repo,
DigiSmith's own included — a repo with no `.digismith/hooks/post-finish/`
folder simply has nothing to fire.
```

Replace it with (the inner bash fence is part of the replacement):

````
Finally, fire the `post-finish` lifecycle hook: see `fire-lifecycle-hook.md`
(in this skill's own folder) for the procedure. This runs in every repo,
DigiSmith's own included — a repo with no `.digismith/hooks/post-finish/`
folder simply has nothing to fire. Hooks that reason about "what did this
merge bring in" read the two pin refs written right after `git merge`
above — never `ORIG_HEAD` or the live `HEAD`, both of which another
session's merge on the same checkout may have moved by the time a hook
actually runs.

Once every hook has fired, delete the pins:

```bash
git update-ref -d refs/digismith/post-finish/<feature-branch>/base
git update-ref -d refs/digismith/post-finish/<feature-branch>/head
```
````

- [ ] **Step 4: Add one Common Rationalizations row**

Find this exact line (the table's current last row):

```
| "The PR was just created, they'd obviously want a Teams message too" | Always ask first — this is an offer, never an automatic action. Declining is a normal outcome, not something to talk them out of. |
```

Add directly after it:

```
| "The merge was seconds ago — the hook can just read `ORIG_HEAD`" | Another session's merge on the same checkout moves `ORIG_HEAD` and `HEAD` without warning, and hooks get paused. Hooks read this merge's pin refs, nothing else. |
```

- [ ] **Step 5: Add the "Merge-range pins" contract to `fire-lifecycle-hook.md`**

In `skills/finishing-a-development-branch/fire-lifecycle-hook.md`, find this exact sentence in the opening paragraph:

```
to fire hooks at a point in its own flow follows this procedure, passing just the point's name
(e.g. `post-finish`) — this doc is the only place the enumerate-and-follow logic is written, so
a future second lifecycle point in another skill can reuse it without duplicating the steps.
```

Replace it with:

```
to fire hooks at a point in its own flow follows this procedure, passing the point's name
(e.g. `post-finish`) and — for a point whose hooks reason about a merge range — writing the
merge-range pins described below before firing. This doc is the only place the
enumerate-and-follow logic and the pin contract are written, so a future second lifecycle point
in another skill can reuse both without duplicating the steps.
```

Then insert this new section between the end of `## Procedure` (after its step 4) and `## Notes`:

````
## Merge-range pins

A hook often needs to reason about "what did this merge bring in" — which commits, which files
changed. That range must never come from `ORIG_HEAD` or the live `HEAD`: on a shared checkout,
another session's merge can move both between the merge that fired this point and the moment a
hook actually runs (hooks get paused to avoid colliding with another session, contexts get
compacted). So the firing skill pins the range **before** firing, keyed by the branch being
integrated:

```
refs/digismith/<point>/<feature-branch>/base   — the branch tip immediately before the merge
refs/digismith/<point>/<feature-branch>/head   — the merge commit itself
```

For `<point>` = `post-finish`, `finishing-a-development-branch` Option 1 writes these right after
`git merge <feature-branch>` (`git update-ref ... ORIG_HEAD` / `... HEAD`) and deletes both with
`git update-ref -d` once every hook has fired. A hook that reads a range resolves it from those
two refs and nothing else:

```bash
PIN="refs/digismith/<point>/<feature-branch>"
BASE_SHA=$(git rev-parse --verify --quiet "$PIN/base") || { echo "MISSING PIN $PIN/base" >&2; exit 1; }
HEAD_SHA=$(git rev-parse --verify --quiet "$PIN/head") || { echo "MISSING PIN $PIN/head" >&2; exit 1; }
```

`<feature-branch>` is substituted by the firing skill from its own context, the same way hooks
already receive `<base-branch>`. The two reads and every command that uses their values must sit
in the **same** bash block — shell variables do not survive from one block to the next.

**Missing pin → fail loud.** If either ref does not exist, the hook stops with a message naming
the missing ref. It never falls back to `ORIG_HEAD` — a wrong range silently applied is the exact
failure the pins exist to prevent. Hooks fire from the skill that pins them; running one by hand
means pinning by hand first: the two `git update-ref` lines above, with the real pre-merge and
merge-commit SHAs in place of `ORIG_HEAD` and `HEAD`.

**Branch name not in context** (a hook resumed after compaction, or run by hand): list the
pending pins with `git for-each-ref refs/digismith/<point>/`. Exactly one branch pinned → that is
the one being finished. Several → several delayed finishes are pending; ask which branch is being
finished rather than guess. None → see "Missing pin" above.

**Leftover pins are inert.** A finish that stopped partway (failed merged-result tests, a hook
that failed before the unpin step) leaves its two refs in place. Nothing reads them until a hook
for that same branch fires, and the next Option 1 run for that branch overwrites them.
`git for-each-ref refs/digismith/` shows anything left to tidy by hand.
````

- [ ] **Step 6: Smoke-test the pin mechanics in a scratch repo**

The prose is agentic and has no unit tests, but the git commands it prescribes can be proven. Run this in the Bash tool (it builds a throwaway repo, merges a branch, pins, reads, unpins):

```bash
T=$(mktemp -d) && cd "$T" && git init -q -b main && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m base && git checkout -q -b feat && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m work && git checkout -q main && git -c user.email=t@t -c user.name=t merge -q --no-ff -m merge feat && git update-ref refs/digismith/post-finish/feat/base ORIG_HEAD && git update-ref refs/digismith/post-finish/feat/head HEAD && echo "--- pins ---" && git for-each-ref refs/digismith/ && echo "--- base == main~1? ---" && test "$(git rev-parse --verify --quiet refs/digismith/post-finish/feat/base)" = "$(git rev-parse main~1)" && echo yes && echo "--- head == main? ---" && test "$(git rev-parse --verify --quiet refs/digismith/post-finish/feat/head)" = "$(git rev-parse main)" && echo yes && git branch -d -q feat && echo "--- pins survive branch -d ---" && git for-each-ref refs/digismith/ | wc -l && git update-ref -d refs/digismith/post-finish/feat/base && git update-ref -d refs/digismith/post-finish/feat/head && echo "--- after unpin ---" && git for-each-ref refs/digismith/ | wc -l && echo "--- missing pin read ---" && (git rev-parse --verify --quiet refs/digismith/post-finish/feat/base || echo "MISSING as expected, exit $?") && cd / && rm -rf "$T"
```

Expected output, in order: two `refs/digismith/post-finish/feat/{base,head}` lines; `yes`; `yes`; `2`; `0`; `MISSING as expected, exit 1`.

- [ ] **Step 7: Review the diff and commit**

Run `git diff -- skills/finishing-a-development-branch/` and read it in full: the only changes are the ones in Steps 1-5, the pin lines sit between `git merge` and `<test command>`, the unpin block sits after the hook-firing paragraph, and both ref names are spelled exactly `refs/digismith/post-finish/<feature-branch>/base` and `.../head`.

```bash
git add skills/finishing-a-development-branch/SKILL.md skills/finishing-a-development-branch/fire-lifecycle-hook.md
git commit -m "feat(finishing): pin each merge's range for post-finish hooks"
git log -1 --format=%B
```

The last command must print exactly that one line and nothing else.

---

### Task 4: Hooks 01 and 03 read the pins

**Files:**
- Modify: `.digismith/hooks/post-finish/01-version-bump.md:23-54`
- Modify: `.digismith/hooks/post-finish/03-history-update.md:23-53`

**Interfaces:**
- Consumes: the two pin refs from Task 3; the `--base`/`--head` CLIs from Tasks 1 and 2; the "Merge-range pins" section name in `fire-lifecycle-hook.md` (Task 3) which both hooks cite.
- Produces: nothing downstream — these are the leaf consumers.

- [ ] **Step 1: Rewrite hook 01's bump block**

In `.digismith/hooks/post-finish/01-version-bump.md`, find this exact bash block:

```bash
cd "$(git rev-parse --show-toplevel)"
BASE_SHA=$(git rev-parse ORIG_HEAD)
BUMP_OUTPUT=$(node --experimental-strip-types .digismith/hooks/post-finish/scripts/bump-plugin-version.ts --base "$BASE_SHA")
BUMP_STATUS=$?
echo "$BUMP_OUTPUT"
if [ "$BUMP_STATUS" -ne 0 ]; then
  echo "Version bump script failed — stop here, do not push, and do not continue to any further post-finish hook. Investigate." >&2
fi
if [[ "$BUMP_OUTPUT" == BUMPED* ]]; then
  git add .claude-plugin/plugin.json .claude-plugin/marketplace.json && \
  git commit -m "chore: bump plugin version" -- .claude-plugin/plugin.json .claude-plugin/marketplace.json && \
  git push origin <base-branch>
fi
```

Replace it with:

```bash
cd "$(git rev-parse --show-toplevel)"
PIN="refs/digismith/post-finish/<feature-branch>"
BASE_SHA=$(git rev-parse --verify --quiet "$PIN/base") || { echo "MISSING PIN $PIN/base — this hook reads the merge range finishing-a-development-branch Option 1 pins right after git merge; fire it from there, or pin by hand first (fire-lifecycle-hook.md, \"Merge-range pins\"). Stopping." >&2; exit 1; }
HEAD_SHA=$(git rev-parse --verify --quiet "$PIN/head") || { echo "MISSING PIN $PIN/head — same as above. Stopping." >&2; exit 1; }
BUMP_OUTPUT=$(node --experimental-strip-types .digismith/hooks/post-finish/scripts/bump-plugin-version.ts --base "$BASE_SHA" --head "$HEAD_SHA")
BUMP_STATUS=$?
echo "$BUMP_OUTPUT"
if [ "$BUMP_STATUS" -ne 0 ]; then
  echo "Version bump script failed — stop here, do not push, and do not continue to any further post-finish hook. Investigate." >&2
fi
if [[ "$BUMP_OUTPUT" == BUMPED* ]]; then
  git add .claude-plugin/plugin.json .claude-plugin/marketplace.json && \
  git commit -m "chore: bump plugin version" -- .claude-plugin/plugin.json .claude-plugin/marketplace.json && \
  git push origin <base-branch>
fi
```

- [ ] **Step 2: Replace hook 01's `ORIG_HEAD` paragraph**

Find this exact paragraph:

```
`ORIG_HEAD` is git's own record of the branch tip immediately before the merge that triggered
this `post-finish` firing — set correctly whether that merge was a fast-forward or a true merge
commit, and still valid here since nothing between the merge and this hook firing changes it.
```

Replace it with:

```
`BASE_SHA`/`HEAD_SHA` are the merge range `finishing-a-development-branch` Option 1 pinned right
after `git merge <feature-branch>` — the branch tip before the merge and the merge commit itself —
stored as `refs/digismith/post-finish/<feature-branch>/{base,head}` and deleted by Option 1 once
every `post-finish` hook has fired. Never substitute `ORIG_HEAD` or the live `HEAD`: on this
shared checkout another session's merge may have moved both by the time this hook runs (a paused
or delayed firing), which is exactly how a false `SKIPPED` was produced once. A missing pin stops
this hook — see `fire-lifecycle-hook.md`'s "Merge-range pins" for firing by hand and for
recovering the branch name after a compaction.
```

- [ ] **Step 3: Correct hook 01's `SKIPPED` semantics paragraph**

Find this exact paragraph (the file's last one):

```
A `BUMPED` result commits both version files in their own commit — separate from the merge
commit — and pushes it: this hook fires after Option 1's own push already happened, so the bump
needs its own, second push rather than riding along in the first one. A `SKIPPED` result means
the incoming branch's own commits already changed the version — do nothing further. A non-zero
exit means the bump script itself failed: stop, do not push, and do not continue to any further
`post-finish` hook — investigate instead. The bump is the point of this hook, so a failure here
must not be silently skipped, nor followed by a plugin-cache reinstall that still doesn't reflect
it.
```

Replace it with:

```
A `BUMPED` result commits both version files in their own commit — separate from the merge
commit — and pushes it: this hook fires after Option 1's own push already happened, so the bump
needs its own, second push rather than riding along in the first one. A `SKIPPED` result means
this merge's own commits (`base..head`) changed `plugin.json` themselves — do nothing further. A
version change that landed on `<base-branch>` *after* the pinned `head` (another session's merge
and bump) never produces a `SKIPPED`: this hook still bumps, once, from whatever version
`<base-branch>` is at now — one bump per merge, regardless of when its hook fires. A non-zero
exit means the bump script itself failed: stop, do not push, and do not continue to any further
`post-finish` hook — investigate instead. The bump is the point of this hook, so a failure here
must not be silently skipped, nor followed by a plugin-cache reinstall that still doesn't reflect
it.
```

- [ ] **Step 4: Rewrite hook 03's update block**

In `.digismith/hooks/post-finish/03-history-update.md`, find this exact bash block:

```bash
cd "$(git rev-parse --show-toplevel)"
BASE_SHA=$(git rev-parse ORIG_HEAD)
UPDATE_OUTPUT=$(node --experimental-strip-types .digismith/hooks/post-finish/scripts/update-history.ts --base "$BASE_SHA")
UPDATE_STATUS=$?
echo "$UPDATE_OUTPUT"
if [ "$UPDATE_STATUS" -ne 0 ]; then
  echo "History update script failed — stop here, do not commit, and investigate." >&2
fi
if [[ "$UPDATE_OUTPUT" == APPENDED* ]]; then
  git add .digismith/history.html && \
  git commit -m "docs(history): record shipped features" -- .digismith/history.html && \
  git push origin <base-branch>
fi
```

Replace it with:

```bash
cd "$(git rev-parse --show-toplevel)"
PIN="refs/digismith/post-finish/<feature-branch>"
BASE_SHA=$(git rev-parse --verify --quiet "$PIN/base") || { echo "MISSING PIN $PIN/base — this hook reads the merge range finishing-a-development-branch Option 1 pins right after git merge; fire it from there, or pin by hand first (fire-lifecycle-hook.md, \"Merge-range pins\"). Stopping." >&2; exit 1; }
HEAD_SHA=$(git rev-parse --verify --quiet "$PIN/head") || { echo "MISSING PIN $PIN/head — same as above. Stopping." >&2; exit 1; }
UPDATE_OUTPUT=$(node --experimental-strip-types .digismith/hooks/post-finish/scripts/update-history.ts --base "$BASE_SHA" --head "$HEAD_SHA")
UPDATE_STATUS=$?
echo "$UPDATE_OUTPUT"
if [ "$UPDATE_STATUS" -ne 0 ]; then
  echo "History update script failed — stop here, do not commit, and investigate." >&2
fi
if [[ "$UPDATE_OUTPUT" == APPENDED* ]]; then
  git add .digismith/history.html && \
  git commit -m "docs(history): record shipped features" -- .digismith/history.html && \
  git push origin <base-branch>
fi
```

- [ ] **Step 5: Replace hook 03's `ORIG_HEAD` paragraph**

Find this exact paragraph:

```
`ORIG_HEAD` is git's own record of the branch tip immediately before the merge that triggered
this `post-finish` firing — the same value `01-version-bump.md` reads, for the same reason: still
valid here since nothing between the merge and this hook firing changes it.
```

Replace it with:

```
`BASE_SHA`/`HEAD_SHA` are the merge range `finishing-a-development-branch` Option 1 pinned right
after `git merge <feature-branch>` — stored as `refs/digismith/post-finish/<feature-branch>/{base,head}`,
the same two refs `01-version-bump.md` reads, deleted by Option 1 once every `post-finish` hook has
fired. Never substitute `ORIG_HEAD` or the live `HEAD`: on this shared checkout another session's
merge may have moved both by the time this hook runs, and a wrong range here means a history entry
appended twice or not at all. A missing pin stops this hook — see `fire-lifecycle-hook.md`'s
"Merge-range pins" for firing by hand and for recovering the branch name after a compaction.
```

- [ ] **Step 6: Point hook 03's `NOTHING` wording at the pinned range**

Find this exact substring (it sits mid-paragraph, on one line):

```
result means the merged range contained no `.digismith/docs/<slug>/report.html`
```

Replace it with:

```
result means the pinned range (`base..head`) contained no `.digismith/docs/<slug>/report.html`
```

- [ ] **Step 7: Smoke-test the missing-pin path**

The hooks are agentic prose, but their bash is real. In a scratch repo, run the pin-read lines with `<feature-branch>` substituted by a branch that was never pinned, and confirm they stop before anything else runs:

```bash
T=$(mktemp -d) && cd "$T" && git init -q -b main && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m base && bash -c 'PIN="refs/digismith/post-finish/never-pinned"; BASE_SHA=$(git rev-parse --verify --quiet "$PIN/base") || { echo "MISSING PIN $PIN/base — stopping." >&2; exit 1; }; echo "SHOULD NOT PRINT"'; echo "block exit: $?"; cd / && rm -rf "$T"
```

Expected: stderr shows `MISSING PIN refs/digismith/post-finish/never-pinned/base — stopping.`, `SHOULD NOT PRINT` does not appear, and the last line is `block exit: 1`.

- [ ] **Step 8: Review the diff and commit**

Run `git diff -- .digismith/hooks/post-finish/` and read it in full. Confirm: no `ORIG_HEAD` remains in either hook except inside the phrase "Never substitute `ORIG_HEAD`" (`grep -n ORIG_HEAD .digismith/hooks/post-finish/*.md` should show exactly one line per file, each containing "Never substitute"); both scripts are called with `--base "$BASE_SHA" --head "$HEAD_SHA"`; the pin reads and the script call are in the same bash block.

```bash
git add .digismith/hooks/post-finish/01-version-bump.md .digismith/hooks/post-finish/03-history-update.md
git commit -m "feat(hooks): read the pinned merge range instead of ORIG_HEAD"
git log -1 --format=%B
```

The last command must print exactly that one line and nothing else.

---

### Task 5: Docs and backlog

**Files:**
- Delete: `backlog/bump-plugin-version-concurrent-merge-gap.md`
- Modify: `backlog/README.md` (two lines: the deleted item's entry, and the direct-push item's hook text)
- Modify: `backlog/post-finish-hooks-direct-push-gap.md` (one new section)
- Modify: `MEMORY.md` (the **W** row's W.4.1 sentence and the **Y** row's end — both rows are single very long lines)
- Modify: `vendored/PROVENANCE.md` (the `finishing-a-development-branch` entry)

**Interfaces:**
- Consumes: the ref names and the "Merge-range pins" section name from Task 3, and the `--head` flags from Tasks 1-2, all of which the prose below names.
- Produces: nothing downstream.

Before each edit below, confirm the "find" text still matches the file exactly (see Global Constraints — concurrent sessions edit these files).

- [ ] **Step 1: Retire the concurrent-merge backlog item**

```bash
git rm backlog/bump-plugin-version-concurrent-merge-gap.md
```

Then in `backlog/README.md`, delete this entire line (it is one line in the file):

```
- [`bump-plugin-version.ts` can't tell "this branch bumped" from "a later merge bumped" (W.4.1)](bump-plugin-version-concurrent-merge-gap.md) — surfaced live by two concurrent merges racing on `main`; `SKIPPED` is correct but indistinguishable from the script's actual designed case
```

- [ ] **Step 2: Update the direct-push item's README hook**

In `backlog/README.md`, find this exact line:

```
- [Post-finish hooks assume the Option-1 merge flow — direct-to-main push leaves them stranded (Y)](post-finish-hooks-direct-push-gap.md) — gap in Y.1's shipped hooks; `ORIG_HEAD` stale/misleading when invoked by hand outside a real merge; distinct from `no-push-after-local-merge`
```

Replace it with:

```
- [Post-finish hooks assume the Option-1 merge flow — direct-to-main push leaves them stranded (Y)](post-finish-hooks-direct-push-gap.md) — gap in Y.1's shipped hooks; since 2026-09-12 (W.4.1 merge pinning) the hooks read no `ORIG_HEAD` at all, so a by-hand run now stops on a named missing pin instead of silently using a stale base — the "hooks never fire on their own" half still stands; distinct from `no-push-after-local-merge`
```

- [ ] **Step 3: Add the update section to the direct-push item**

In `backlog/post-finish-hooks-direct-push-gap.md`, find this exact heading line:

```
## What's still worth examining
```

Insert this section immediately **before** it (leave a blank line on each side):

```
## Update 2026-09-12 — the hooks no longer read `ORIG_HEAD` at all

W.4.1's merge-pinning pass (`.digismith/docs/version-bump-concurrent-merge/design.html`) removed
every `ORIG_HEAD` read from the `post-finish` hooks: `finishing-a-development-branch` Option 1 now
pins the merge range as `refs/digismith/post-finish/<feature-branch>/{base,head}` right after
`git merge`, and `01-version-bump.md`/`03-history-update.md` read only those refs, passing
`--base`/`--head` to their scripts. For this item that means consequence 2 above ("`ORIG_HEAD`
stale and actively misleading if trusted") can no longer happen silently — a by-hand run with no
pin stops with a message naming the missing ref, and `fire-lifecycle-hook.md`'s "Merge-range pins"
section documents pinning by hand. Consequence 1 (the hooks never fire on their own for a
direct-to-`main` push) is untouched and remains this item's open question. Of the bullets below,
the first (caller-supplied SHAs instead of `ORIG_HEAD`) and third (naming the failure mode in the
hooks) are now effectively answered by that pass; the second is the one still open. The
"no `--base` → always bump" workaround still exists in `bump-plugin-version.ts` (both flags
omitted), still unsanctioned.
```

- [ ] **Step 4: Update `MEMORY.md`'s W row**

`MEMORY.md`'s **W** row is a single long line. Find this exact substring in it:

```
see `.digismith/docs/version-bump-patch-minor/design.html` · **W.5** built 2026-09-04
```

Replace it with (one line; the only change is the inserted sentence between `design.html\`` and ` · **W.5**`):

```
see `.digismith/docs/version-bump-patch-minor/design.html`. Hardened again 2026-09-12 (merge pinning): a delayed `post-finish` firing (Z's paused hooks behind Y.1.3's merge) exposed that `01-version-bump.md` derived its range from `ORIG_HEAD` plus the live tree, both of which another session's merge on the shared checkout moves — producing a false `SKIPPED`. `finishing-a-development-branch` Option 1 now pins each merge's range as `refs/digismith/post-finish/<feature-branch>/{base,head}` right after `git merge` and deletes the pins after the hooks fire; `versionChangedSince`/`bumpTypeSince` take `--base`/`--head` and compare `git show base:` vs `git show head:` / scan `base..head`, never the working tree or `HEAD`. Invariant: one bump per merge, regardless of when its hook fires. The earlier owning-lineage backlog verdict's "stale-cache coin flip" claim was withdrawn as wrong in the same pass (content never strands on a sequential shared checkout) — see `.digismith/docs/version-bump-concurrent-merge/design.html` · **W.5** built 2026-09-04
```

- [ ] **Step 5: Update `MEMORY.md`'s Y row**

`MEMORY.md`'s **Y** row is also a single long line, ending with the Y.1.3 sentence. Find this exact substring (its end is the row's closing table pipe):

```
See `.digismith/docs/history-update-post-finish-hook/design.html` |
```

Replace it with:

```
See `.digismith/docs/history-update-post-finish-hook/design.html` · **Y.1's firing contract further diverged by W.4.1's merge-pinning pass** (2026-09-12): `fire-lifecycle-hook.md` gained a point-agnostic "Merge-range pins" section — the firing skill pins the merge range per branch (`refs/digismith/<point>/<feature-branch>/{base,head}`) before firing, and range-reading hooks (`01`, `03`) resolve their range from those refs only, never `ORIG_HEAD`/live `HEAD`; a missing pin fails loud. `03-history-update.md`/`update-history.ts` gained `--head` accordingly. The Y session was notified and confirmed no in-flight edits the same day |
```

- [ ] **Step 6: Update `vendored/PROVENANCE.md`**

Find this exact substring (the last sentence of the `finishing-a-development-branch` entry):

```
DigiSmith `MEMORY.md` map items W and Y.
```

Replace it with:

```
DigiSmith `MEMORY.md` map items W and Y. **Further diverged by W.4.1's merge-pinning pass**
  (2026-09-12): Option 1 now pins the merge range as
  `refs/digismith/post-finish/<feature-branch>/{base,head}` right after `git merge` and deletes
  both pins after the `post-finish` hooks fire; `fire-lifecycle-hook.md` gained the "Merge-range
  pins" contract those hooks read.
```

- [ ] **Step 7: Verify and commit**

Run `git status --short` — expected: `D backlog/bump-plugin-version-concurrent-merge-gap.md` plus `M` for `backlog/README.md`, `backlog/post-finish-hooks-direct-push-gap.md`, `MEMORY.md`, `vendored/PROVENANCE.md`; nothing else. Run `grep -rn "bump-plugin-version-concurrent-merge-gap" --include=*.md . | grep -v node_modules | grep -v "^./.digismith/docs/"` — expected: no output (the only remaining references live in this feature's own design/plan). Run `pnpm test` once more — expected: PASS (nothing in this task touches code, this just confirms the branch is green before finish).

```bash
git add backlog/README.md backlog/post-finish-hooks-direct-push-gap.md MEMORY.md vendored/PROVENANCE.md
git commit -m "docs: record W.4.1 merge pinning and retire the concurrent-merge backlog item"
git log -1 --format=%B
```

(`git rm` already staged the deletion.) The last command must print exactly that one line and nothing else.

---

## After the plan: live verification at finish (not a task)

This branch's own `finishing-a-development-branch` Option 1 run is the first end-to-end exercise of the new path, and the spec's Testing section names it as the final check. Whoever runs the finish should watch for, in order: the two pin refs appearing after `git merge` (`git for-each-ref refs/digismith/`), hook 01 printing `BUMPED` with a version one step past whatever `main` is at then, hook 03 printing `APPENDED 1: ...` for this feature's own `report.html`, and `git for-each-ref refs/digismith/` printing nothing after the unpin step.
