# Check Vendored Skills via GitHub (W.2.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `digismith:subagent-driven-development` (recommended) or `digismith:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `scripts/check_vendored_skills.ts` resolve "upstream" by shallow-cloning the real GitHub repository (`https://github.com/obra/superpowers.git`), replacing its current dependency on a locally-installed Superpowers plugin cache.

**Architecture:** A new `cloneUpstreamSkillsDir(repoUrl)` function replaces `resolveUpstreamSkillsDir`/`pickMostRecentDir` entirely, using `spawnSync("git", ["clone", "--depth", "1", ...])` — the same subprocess style every other function in this file already uses. `checkSkill`/`compareFile`/etc. are untouched; only `main()`'s resolution call and cleanup change. Tests use a local git-repo fixture in place of a real network clone, keeping the file's existing no-mocking style.

**Tech Stack:** TypeScript, Node's built-in `child_process`/`fs`/`os`/`path`, Vitest.

## Global Constraints

- No new dependencies (no HTTP client, no GitHub API library) — `git` via `spawnSync` only, matching every other function in this file.
- `checkSkill`, `compareFile`, `readGitBlob`, `listBaselineFiles`, `diffContent`, `readFileIfExists`, `formatSkillReport`, `VENDORED_SKILLS`, and `BASELINE_SHA` must not change.
- No fallback to the local plugin cache — GitHub resolution replaces it entirely (confirmed design decision).
- No ref/tag configurability — always the default branch's current tip.
- On clone failure, fail loudly (clear error, `process.exit(1)`, no partial report) — same disposition `main()` already has for the old "cache not found" case.

---

### Task 1: Replace local-cache resolution with a GitHub shallow clone, with tests

**Files:**
- Modify: `scripts/check_vendored_skills.ts` (delete `DirEntry`, `pickMostRecentDir`, `resolveUpstreamSkillsDir`; add `cloneUpstreamSkillsDir`; update `main()`)
- Modify: `scripts/check_vendored_skills.test.ts` (delete the `pickMostRecentDir` and `resolveUpstreamSkillsDir` describe blocks and their import; add `cloneUpstreamSkillsDir`'s tests)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `cloneUpstreamSkillsDir(repoUrl?: string): string` — returns a path to a `skills/` directory, exactly like the function it replaces. `checkSkill(name, upstreamSkillsDir)`'s existing signature and behavior are unaffected; it never cared how `upstreamSkillsDir` was resolved.

- [ ] **Step 1: Delete the old resolution code from check_vendored_skills.ts**

Find this exact block (lines 6-56):

```typescript
export interface DirEntry {
  path: string;
  mtimeMs: number;
}

export function pickMostRecentDir(dirs: DirEntry[]): string {
  if (dirs.length === 0) {
    throw new Error("no directories found");
  }
  let best = dirs[0];
  for (const d of dirs.slice(1)) {
    if (d.mtimeMs > best.mtimeMs) {
      best = d;
    }
  }
  return best.path;
}

export function resolveUpstreamSkillsDir(baseDir: string = os.homedir()): string {
  const cacheRoot = path.join(
    baseDir,
    ".claude",
    "plugins",
    "cache",
    "claude-plugins-official",
    "superpowers"
  );
  if (!fs.existsSync(cacheRoot)) {
    throw new Error(`Superpowers plugin cache not found at ${cacheRoot}`);
  }
  const entries = fs
    .readdirSync(cacheRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e): DirEntry => {
      const fullPath = path.join(cacheRoot, e.name);
      return { path: fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    });
  const chosen = pickMostRecentDir(entries);
  if (entries.length > 1) {
    console.error(
      `resolveUpstreamSkillsDir: found ${entries.length} candidate plugin cache directories under ${cacheRoot}; ` +
        `picked most-recently-modified "${chosen}" (${entries.length - 1} other candidate(s) ignored) — ` +
        `double check this is the right one if the report below looks off`
    );
  }
  const skillsDir = path.join(chosen, "skills");
  if (!fs.existsSync(skillsDir)) {
    throw new Error(`Expected upstream skills directory not found at ${skillsDir}`);
  }
  return skillsDir;
}
```

Replace it with:

```typescript
export function cloneUpstreamSkillsDir(
  repoUrl: string = "https://github.com/obra/superpowers.git"
): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-vendor-upstream-"));
  const result = spawnSync("git", ["clone", "--depth", "1", repoUrl, tmpDir], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`Cannot clone upstream repository ${repoUrl}: ${result.stderr}`);
  }
  const skillsDir = path.join(tmpDir, "skills");
  if (!fs.existsSync(skillsDir)) {
    throw new Error(`Expected upstream skills directory not found at ${skillsDir}`);
  }
  return skillsDir;
}
```

- [ ] **Step 2: Update main() to use the new function and clean up the clone**

Find this exact block:

```typescript
export function main(): void {
  let upstreamSkillsDir: string;
  try {
    upstreamSkillsDir = resolveUpstreamSkillsDir();
  } catch (err) {
    console.error(`Cannot check for upstream drift: ${(err as Error).message}`);
    process.exit(1);
  }

  console.log(`Checking ${VENDORED_SKILLS.length} vendored skills against baseline ${BASELINE_SHA.slice(0, 7)}`);
  console.log(`Upstream: ${upstreamSkillsDir}\n`);

  let anyDrift = false;
  for (const name of VENDORED_SKILLS) {
    let report: SkillReport;
    try {
      report = checkSkill(name, upstreamSkillsDir);
    } catch (err) {
      console.error(
        `Cannot read baseline commit ${BASELINE_SHA} for "${name}": ${(err as Error).message}\n` +
          `This usually means DigiSmith's git history changed since this SHA was recorded. ` +
          `Fix the baseline SHA in vendored/PROVENANCE.md and BASELINE_SHA in this script.`
      );
      process.exit(1);
    }
    if (report.files.some((f) => f.upstreamDiff !== "")) {
      anyDrift = true;
    }
    console.log(formatSkillReport(report));
    console.log("");
  }

  if (!anyDrift) {
    console.log("No upstream drift detected across any vendored skill.");
  }
}
```

Replace it with:

```typescript
export function main(): void {
  let upstreamSkillsDir: string;
  try {
    upstreamSkillsDir = cloneUpstreamSkillsDir();
  } catch (err) {
    console.error(`Cannot check for upstream drift: ${(err as Error).message}`);
    process.exit(1);
  }

  console.log(`Checking ${VENDORED_SKILLS.length} vendored skills against baseline ${BASELINE_SHA.slice(0, 7)}`);
  console.log(`Upstream: ${upstreamSkillsDir}\n`);

  try {
    let anyDrift = false;
    for (const name of VENDORED_SKILLS) {
      let report: SkillReport;
      try {
        report = checkSkill(name, upstreamSkillsDir);
      } catch (err) {
        console.error(
          `Cannot read baseline commit ${BASELINE_SHA} for "${name}": ${(err as Error).message}\n` +
            `This usually means DigiSmith's git history changed since this SHA was recorded. ` +
            `Fix the baseline SHA in vendored/PROVENANCE.md and BASELINE_SHA in this script.`
        );
        process.exit(1);
      }
      if (report.files.some((f) => f.upstreamDiff !== "")) {
        anyDrift = true;
      }
      console.log(formatSkillReport(report));
      console.log("");
    }

    if (!anyDrift) {
      console.log("No upstream drift detected across any vendored skill.");
    }
  } finally {
    fs.rmSync(path.dirname(upstreamSkillsDir), { recursive: true, force: true });
  }
}
```

(The only changes: `resolveUpstreamSkillsDir()` → `cloneUpstreamSkillsDir()`, and the whole skill-checking loop plus its "no drift" message wrapped in a `try { ... } finally { ... }` that removes the temp clone directory — `path.dirname(upstreamSkillsDir)` recovers the clone root since `upstreamSkillsDir` is that root's `skills` subdirectory.)

- [ ] **Step 3: Replace the old tests in check_vendored_skills.test.ts**

Find this exact block (lines 1-102):

```typescript
import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pickMostRecentDir, resolveUpstreamSkillsDir, readGitBlob, readFileIfExists, listBaselineFiles, diffContent } from "./check_vendored_skills.ts";

describe("pickMostRecentDir", () => {
  it("returns the path with the highest mtimeMs", () => {
    const result = pickMostRecentDir([
      { path: "/a/old", mtimeMs: 100 },
      { path: "/a/new", mtimeMs: 300 },
      { path: "/a/mid", mtimeMs: 200 },
    ]);
    expect(result).toBe("/a/new");
  });

  it("throws on an empty list", () => {
    expect(() => pickMostRecentDir([])).toThrow("no directories found");
  });
});

describe("resolveUpstreamSkillsDir", () => {
  it("picks the most-recently-modified hash directory under superpowers/ and appends skills/", () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-vendor-test-"));
    const cacheRoot = path.join(tmpBase, ".claude", "plugins", "cache", "claude-plugins-official", "superpowers");
    const oldHash = path.join(cacheRoot, "oldhash111");
    const newHash = path.join(cacheRoot, "newhash222");
    fs.mkdirSync(oldHash, { recursive: true });
    fs.mkdirSync(path.join(newHash, "skills"), { recursive: true });
    // Force newHash to have a strictly later mtime than oldHash.
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(oldHash, past, past);
    fs.utimesSync(newHash, future, future);

    const result = resolveUpstreamSkillsDir(tmpBase);

    expect(result).toBe(path.join(newHash, "skills"));
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  it("throws a clear error when the superpowers cache directory doesn't exist", () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-vendor-test-empty-"));
    expect(() => resolveUpstreamSkillsDir(tmpBase)).toThrow("Superpowers plugin cache not found");
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  it("throws a clear error naming the expected path when the chosen hash dir has no skills/ subfolder", () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-vendor-test-noskills-"));
    const cacheRoot = path.join(tmpBase, ".claude", "plugins", "cache", "claude-plugins-official", "superpowers");
    const onlyHash = path.join(cacheRoot, "onlyhash333");
    fs.mkdirSync(onlyHash, { recursive: true });
    // Deliberately no `skills` subfolder under onlyHash — mimics a wrong
    // plugin layout or a hash dir that hasn't been populated yet.

    expect(() => resolveUpstreamSkillsDir(tmpBase)).toThrow(path.join(onlyHash, "skills"));
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  it("warns to stderr when more than one candidate hash directory exists", () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-vendor-test-multi-"));
    const cacheRoot = path.join(tmpBase, ".claude", "plugins", "cache", "claude-plugins-official", "superpowers");
    const oldHash = path.join(cacheRoot, "oldhash444");
    const newHash = path.join(cacheRoot, "newhash555");
    fs.mkdirSync(oldHash, { recursive: true });
    fs.mkdirSync(path.join(newHash, "skills"), { recursive: true });
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(oldHash, past, past);
    fs.utimesSync(newHash, future, future);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = resolveUpstreamSkillsDir(tmpBase);
      expect(result).toBe(path.join(newHash, "skills"));
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const message = errorSpy.mock.calls[0][0] as string;
      expect(message).toContain(newHash);
      expect(message).toContain("2 candidate");
    } finally {
      errorSpy.mockRestore();
      fs.rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  it("does not warn when only one candidate hash directory exists", () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-vendor-test-single-"));
    const cacheRoot = path.join(tmpBase, ".claude", "plugins", "cache", "claude-plugins-official", "superpowers");
    const onlyHash = path.join(cacheRoot, "onlyhash666");
    fs.mkdirSync(path.join(onlyHash, "skills"), { recursive: true });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = resolveUpstreamSkillsDir(tmpBase);
      expect(result).toBe(path.join(onlyHash, "skills"));
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
      fs.rmSync(tmpBase, { recursive: true, force: true });
    }
  });
});
```

Replace it with:

```typescript
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { cloneUpstreamSkillsDir, readGitBlob, readFileIfExists, listBaselineFiles, diffContent } from "./check_vendored_skills.ts";

function initFixtureRepo(dir: string, withSkillsFolder: boolean): void {
  fs.mkdirSync(dir, { recursive: true });
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: dir });
  if (withSkillsFolder) {
    fs.mkdirSync(path.join(dir, "skills", "some-skill"), { recursive: true });
    fs.writeFileSync(path.join(dir, "skills", "some-skill", "SKILL.md"), "fixture content\n");
  } else {
    fs.writeFileSync(path.join(dir, "README.md"), "no skills here\n");
  }
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "fixture commit"], { cwd: dir });
}

describe("cloneUpstreamSkillsDir", () => {
  it("clones the repository and returns its skills/ directory", () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-vendor-test-"));
    const fixtureRepo = path.join(tmpBase, "fixture-repo");
    initFixtureRepo(fixtureRepo, true);

    const result = cloneUpstreamSkillsDir(fixtureRepo);

    expect(result.endsWith(path.join("skills"))).toBe(true);
    expect(fs.existsSync(result)).toBe(true);
    const cloned = fs.readFileSync(path.join(result, "some-skill", "SKILL.md"), "utf8");
    expect(cloned).toBe("fixture content\n");

    fs.rmSync(path.dirname(result), { recursive: true, force: true });
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  it("throws a clear error when the clone fails", () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-vendor-test-noclone-"));
    const doesNotExist = path.join(tmpBase, "does-not-exist");

    expect(() => cloneUpstreamSkillsDir(doesNotExist)).toThrow("Cannot clone upstream repository");

    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  it("throws a clear error naming the expected path when the clone has no skills/ subfolder", () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-vendor-test-noskills-"));
    const fixtureRepo = path.join(tmpBase, "fixture-repo");
    initFixtureRepo(fixtureRepo, false);

    expect(() => cloneUpstreamSkillsDir(fixtureRepo)).toThrow("Expected upstream skills directory not found");

    fs.rmSync(tmpBase, { recursive: true, force: true });
  });
});
```

- [ ] **Step 4: Run the updated test file**

```bash
pnpm vitest run scripts/check_vendored_skills.test.ts
```

Expected: all tests pass (the 3 new `cloneUpstreamSkillsDir` tests plus every other unchanged test in this file — `readGitBlob`, `readFileIfExists`, `listBaselineFiles`, `diffContent`, `compareFile`, `formatSkillReport`). This also confirms the source file parses correctly — the test file imports `cloneUpstreamSkillsDir` directly from it.

- [ ] **Step 5: Commit**

```bash
git add scripts/check_vendored_skills.ts scripts/check_vendored_skills.test.ts
git commit -m "feat(check-vendored-skills): resolve upstream via a GitHub shallow clone (W.2.1)"
```

---

### Task 2: Update MEMORY.md and vendored/PROVENANCE.md

**Files:**
- Modify: `MEMORY.md` (W.2's map entry)
- Modify: `vendored/PROVENANCE.md` (Sync policy section)

**Interfaces:**
- Consumes: nothing from Task 1 directly (independent doc-only edit), but describes Task 1's shipped behavior — should land after Task 1 to describe something real.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Update MEMORY.md's W.2 description**

Find this exact substring within W's map row (search for `an on-demand \`scripts/check_vendored_skills.ts\` that 3-way-diffs`):

```
an on-demand `scripts/check_vendored_skills.ts` that 3-way-diffs each vendored skill (W.1's clone commit as baseline, vs. currently-installed upstream, vs. local working tree)
```

Replace it with:

```
an on-demand `scripts/check_vendored_skills.ts` that 3-way-diffs each vendored skill (W.1's clone commit as baseline, vs. a shallow clone of upstream GitHub's current default-branch tip — **W.2.1**, 2026-09-04, replacing an earlier local-plugin-cache dependency that would have gone dark once Superpowers stopped being kept installed — vs. local working tree)
```

- [ ] **Step 2: Update vendored/PROVENANCE.md's Sync policy section**

Find this exact sentence:

```markdown
An on-demand check exists: `node scripts/check_vendored_skills.ts` (map
item **W.2**) 3-way-diffs every vendored skill against this baseline and
whatever Superpowers plugin version is currently installed, reporting
upstream drift and local divergence separately so an activated skill's
own edits are never confused with genuine upstream changes.
```

Replace it with:

```markdown
An on-demand check exists: `node scripts/check_vendored_skills.ts` (map
item **W.2**, revised by **W.2.1** 2026-09-04) 3-way-diffs every vendored skill against this
baseline and a shallow clone of the upstream GitHub repository's current default-branch tip
(no local Superpowers installation required), reporting
upstream drift and local divergence separately so an activated skill's
own edits are never confused with genuine upstream changes.
```

- [ ] **Step 3: Verify both edits read correctly**

```bash
grep -c "W.2.1" MEMORY.md vendored/PROVENANCE.md
```

Expected: at least `1` for each file.

- [ ] **Step 4: Commit**

```bash
git add MEMORY.md vendored/PROVENANCE.md
git commit -m "docs(check-vendored-skills): record W.2.1 in MEMORY.md and PROVENANCE.md"
```

---

### Task 3: Final verification, including one real live clone

**Files:** none modified — verification only.

**Interfaces:**
- Consumes: the complete state after Tasks 1-2.
- Produces: nothing — this is the plan's closing gate.

- [ ] **Step 1: Delete the now-fully-applied backlog file**

```bash
git rm backlog/check-vendored-skills-github-source.md
```

Find and remove its line from `backlog/README.md`'s index (search for
`check-vendored-skills-github-source.md`):

```
- [`check_vendored_skills.ts`: check upstream via GitHub, not the local plugin cache (W.2.1)](check-vendored-skills-github-source.md) — Jack plans to stop keeping Superpowers installed once W.3 lands; drift-checking needs a source that doesn't depend on local plugin install state
```

```bash
git add backlog/README.md
git commit -m "docs(backlog): remove check-vendored-skills-github-source, applied as W.2.1"
```

- [ ] **Step 2: Run the full test suite**

```bash
pnpm vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Run the script for real — one live clone against the actual GitHub repository**

```bash
node scripts/check_vendored_skills.ts
```

Expected: the script clones `https://github.com/obra/superpowers.git` for real (requires network
access), prints `Checking 14 vendored skills against baseline a641885`, an `Upstream: <temp-dir>`
line pointing at a real temp clone, a per-skill report identical in shape to before this plan
(the same skills reporting local divergence — `brainstorming`, `executing-plans`,
`finishing-a-development-branch`, `writing-plans` — and the rest reporting `no drift`), and exits
cleanly. This is the one thing the fixture-based unit tests from Task 1 cannot prove on their
own — confirm it actually works against the real remote, not just a local stand-in.

- [ ] **Step 4: Confirm the temp clone directory was cleaned up**

Note the temp directory path from Step 3's `Upstream: <temp-dir>` line, then:

```bash
ls "<temp-dir's parent, i.e. the clone root>" 2>&1
```

Expected: "No such file or directory" (or the platform's equivalent) — `main()`'s `finally` block
removed it after the script finished.

- [ ] **Step 5: Confirm zero dangling references to the deleted functions**

```bash
grep -rn "resolveUpstreamSkillsDir\|pickMostRecentDir" --include="*.ts" --include="*.md" . 2>/dev/null | grep -v "\.digismith/docs/"
```

Expected: no output.

- [ ] **Step 6: Report completion**

State plainly: W.2.1 shipped — `check_vendored_skills.ts` now resolves upstream from GitHub
directly, no local Superpowers install required. Link the design spec's artifact URL again for
reference. Note that Step 3's live clone is the actual confirmation this works for real, not a
simulated one — no further live-run gap remains for this specific change, unlike some of the
earlier W-lineage items.
