# Primitive Activation Mechanism (W.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reusable mechanism a future vendored-skill activation will use: a fork-provenance tag convention, and an on-demand script that 3-way-diffs every vendored skill (baseline clone vs. currently-installed upstream vs. local working tree) so upstream drift and local divergence are never conflated.

**Architecture:** A single flat TypeScript file, `scripts/check_vendored_skills.ts`, exporting small pure/testable functions plus a `main()` CLI entry point, run directly via Node's built-in type-stripping (no build step, no new runtime dependency). `vendored/PROVENANCE.md` gets three doc edits recording the baseline commit and describing the new script.

**Tech Stack:** TypeScript (Node ≥24 native execution — verified: `node file.ts` runs type-annotated ESM directly on this machine, Node v24.16.0), Vitest (already a root devDependency, verified zero-config `npx vitest run <file>` works for a root-level `.test.ts`), Node's built-in `node:child_process`, `node:fs`, `node:os`, `node:path`.

## Global Constraints

- Baseline commit SHA (the W.1 clone commit): `a6418858b5374c2506d1ff799b2dcb418bff53d1`
- The 14 vendored skill names (folder is `skills/vendored-<name>/`, upstream folder is `<plugin-cache>/skills/<name>/` — no `vendored-` prefix upstream): `brainstorming`, `dispatching-parallel-agents`, `executing-plans`, `finishing-a-development-branch`, `receiving-code-review`, `requesting-code-review`, `subagent-driven-development`, `systematic-debugging`, `test-driven-development`, `using-git-worktrees`, `using-superpowers`, `verification-before-completion`, `writing-plans`, `writing-skills`
- Upstream plugin cache root: `path.join(os.homedir(), ".claude", "plugins", "cache", "claude-plugins-official", "superpowers")` — never hardcode a hash subdirectory; always pick the most-recently-modified one present.
- All git plumbing commands (`git show`, `git ls-tree`, `git diff --no-index`) run with `process.cwd()` as-is — this script is documented as run from the DigiSmith repo root, same precondition as `scripts/model_offload.py`.
- `git show <sha>:<path>` on a path that didn't exist at that revision exits **128** with stderr containing `does not exist in` — verified directly on this machine. Any other non-zero exit is a real error and must not be swallowed.
- `git diff --no-color --no-index -- <a> <b>` exits **0** when files are identical (empty stdout) and **1** when they differ (unified diff on stdout) — verified directly on this machine. Any other exit code is a real error.
- Out of scope for this plan (do not implement): activating any skill's actual content, redirecting any DigiSmith internal call site from `superpowers:<name>` to `digismith:<name>` (future map item W.3), any change to `finishing-a-development-branch` itself (future map item W.4).

---

### Task 1: Directory resolution — pick the currently-installed Superpowers plugin

**Files:**
- Create: `scripts/check_vendored_skills.ts`
- Create: `scripts/check_vendored_skills.test.ts`

**Interfaces:**
- Produces:
  - `export interface DirEntry { path: string; mtimeMs: number }`
  - `export function pickMostRecentDir(dirs: DirEntry[]): string` — returns the `path` of the entry with the highest `mtimeMs`; throws `Error("no directories found")` if `dirs` is empty.
  - `export function resolveUpstreamSkillsDir(baseDir?: string): string` — `baseDir` defaults to `os.homedir()`. Resolves `<baseDir>/.claude/plugins/cache/claude-plugins-official/superpowers`, lists its subdirectories (`fs.readdirSync(dir, { withFileTypes: true })`, filter `isDirectory()`), builds `DirEntry[]` from each (via `fs.statSync(entryPath).mtimeMs`), calls `pickMostRecentDir`, and returns `path.join(<chosen>, "skills")`. Throws `Error(\`Superpowers plugin cache not found at ${cacheRoot}\`)` if the cache root directory doesn't exist (check with `fs.existsSync` first — don't let `readdirSync` throw an unlabeled ENOENT).

- [ ] **Step 1: Write the failing tests**

```typescript
// scripts/check_vendored_skills.test.ts
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pickMostRecentDir, resolveUpstreamSkillsDir } from "./check_vendored_skills.ts";

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
    fs.mkdirSync(newHash, { recursive: true });
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run scripts/check_vendored_skills.test.ts`
Expected: FAIL — `scripts/check_vendored_skills.ts` doesn't exist yet, so the import fails.

- [ ] **Step 3: Write minimal implementation**

```typescript
// scripts/check_vendored_skills.ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

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
  return path.join(chosen, "skills");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run scripts/check_vendored_skills.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/check_vendored_skills.ts scripts/check_vendored_skills.test.ts
git commit -m "feat(vendor-activation): resolve installed Superpowers plugin dir dynamically"
```

---

### Task 2: Git content readers

**Files:**
- Modify: `scripts/check_vendored_skills.ts`
- Modify: `scripts/check_vendored_skills.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 directly (independent logic), but appends to the same files.
- Produces:
  - `export function readGitBlob(sha: string, relPath: string): string | null` — runs `git show <sha>:<relPath>` via `child_process.spawnSync("git", ["show", \`${sha}:${relPath}\`], { encoding: "utf8" })`. If `result.status === 0`, returns `result.stdout`. If `result.status === 128` and `result.stderr.includes("does not exist in")`, returns `null`. Otherwise throws `Error(\`git show failed for ${sha}:${relPath}: ${result.stderr}\`)`.
  - `export function readFileIfExists(absPath: string): string | null` — returns `fs.readFileSync(absPath, "utf8")`, or `null` if `fs.existsSync(absPath)` is false.
  - `export function listBaselineFiles(sha: string, skillRelDir: string): string[]` — runs `git ls-tree -r --name-only <sha> -- <skillRelDir>` via `spawnSync`. Throws on non-zero exit. Splits stdout on newlines, drops empty lines, strips the `\`${skillRelDir}/\`` prefix from each line, returns the resulting within-skill relative paths.

- [ ] **Step 1: Write the failing tests**

```typescript
// append to scripts/check_vendored_skills.test.ts
import { readGitBlob, readFileIfExists, listBaselineFiles } from "./check_vendored_skills.ts";

const BASELINE_SHA = "a6418858b5374c2506d1ff799b2dcb418bff53d1";

describe("readGitBlob", () => {
  it("returns file content for a path that existed at the given revision", () => {
    const content = readGitBlob(BASELINE_SHA, "skills/vendored-brainstorming/SKILL.md");
    expect(content).toContain("name: brainstorming");
  });

  it("returns null for a path that did not exist at the given revision", () => {
    const content = readGitBlob(BASELINE_SHA, "skills/vendored-brainstorming/NOPE.md");
    expect(content).toBeNull();
  });
});

describe("readFileIfExists", () => {
  it("returns null for a nonexistent absolute path", () => {
    expect(readFileIfExists(path.join(os.tmpdir(), "digismith-definitely-not-here.txt"))).toBeNull();
  });

  it("returns file content for an existing file", () => {
    const tmpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "digismith-readfile-")), "x.txt");
    fs.writeFileSync(tmpFile, "hello");
    expect(readFileIfExists(tmpFile)).toBe("hello");
  });
});

describe("listBaselineFiles", () => {
  it("lists files under a skill dir at the baseline commit, stripped of the skill-dir prefix", () => {
    const files = listBaselineFiles(BASELINE_SHA, "skills/vendored-brainstorming");
    expect(files).toContain("SKILL.md");
    expect(files.every((f) => !f.startsWith("skills/"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run scripts/check_vendored_skills.test.ts`
Expected: FAIL — `readGitBlob`, `readFileIfExists`, `listBaselineFiles` are not exported yet.

- [ ] **Step 3: Write minimal implementation**

```typescript
// add to scripts/check_vendored_skills.ts
import { spawnSync } from "node:child_process";

export function readGitBlob(sha: string, relPath: string): string | null {
  const result = spawnSync("git", ["show", `${sha}:${relPath}`], { encoding: "utf8" });
  if (result.status === 0) {
    return result.stdout;
  }
  if (result.status === 128 && result.stderr.includes("does not exist in")) {
    return null;
  }
  throw new Error(`git show failed for ${sha}:${relPath}: ${result.stderr}`);
}

export function readFileIfExists(absPath: string): string | null {
  if (!fs.existsSync(absPath)) {
    return null;
  }
  return fs.readFileSync(absPath, "utf8");
}

export function listBaselineFiles(sha: string, skillRelDir: string): string[] {
  const result = spawnSync("git", ["ls-tree", "-r", "--name-only", sha, "--", skillRelDir], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git ls-tree failed for ${sha} ${skillRelDir}: ${result.stderr}`);
  }
  const prefix = `${skillRelDir}/`;
  return result.stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run scripts/check_vendored_skills.test.ts`
Expected: PASS (all tests from Task 1 and Task 2)

- [ ] **Step 5: Commit**

```bash
git add scripts/check_vendored_skills.ts scripts/check_vendored_skills.test.ts
git commit -m "feat(vendor-activation): add git-backed baseline/local content readers"
```

---

### Task 3: Diff computation via git diff --no-index

**Files:**
- Modify: `scripts/check_vendored_skills.ts`
- Modify: `scripts/check_vendored_skills.test.ts`

**Interfaces:**
- Consumes: nothing from prior tasks.
- Produces:
  - `export function diffContent(contentA: string, contentB: string): string` — returns `""` if `contentA === contentB`. Otherwise writes both to a temp dir (`fs.mkdtempSync(path.join(os.tmpdir(), "digismith-vendor-diff-"))`, files named `a` and `b` inside it), runs `git diff --no-color --no-index -- <a> <b>` via `spawnSync`, deletes the temp dir (`fs.rmSync(tmpDir, { recursive: true, force: true })`) in a `finally` block, and returns `result.stdout`. Exit code `0` or `1` from `git diff --no-index` are both success (0 = no diff, 1 = diff present, content already handled by the early-return above so this branch always has content in `stdout`); any other exit code throws `Error(\`git diff --no-index failed: ${result.stderr}\`)`.

- [ ] **Step 1: Write the failing tests**

```typescript
// append to scripts/check_vendored_skills.test.ts
import { diffContent } from "./check_vendored_skills.ts";

describe("diffContent", () => {
  it("returns an empty string for identical content", () => {
    expect(diffContent("same\n", "same\n")).toBe("");
  });

  it("returns a unified diff for differing content", () => {
    const diff = diffContent("line one\nline two\n", "line one\nline TWO changed\n");
    expect(diff).toContain("-line two");
    expect(diff).toContain("+line TWO changed");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run scripts/check_vendored_skills.test.ts`
Expected: FAIL — `diffContent` is not exported yet.

- [ ] **Step 3: Write minimal implementation**

```typescript
// add to scripts/check_vendored_skills.ts
export function diffContent(contentA: string, contentB: string): string {
  if (contentA === contentB) {
    return "";
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-vendor-diff-"));
  const fileA = path.join(tmpDir, "a");
  const fileB = path.join(tmpDir, "b");
  try {
    fs.writeFileSync(fileA, contentA);
    fs.writeFileSync(fileB, contentB);
    const result = spawnSync("git", ["diff", "--no-color", "--no-index", "--", fileA, fileB], {
      encoding: "utf8",
    });
    if (result.status !== 0 && result.status !== 1) {
      throw new Error(`git diff --no-index failed: ${result.stderr}`);
    }
    return result.stdout;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run scripts/check_vendored_skills.test.ts`
Expected: PASS (all tests from Tasks 1-3)

- [ ] **Step 5: Commit**

```bash
git add scripts/check_vendored_skills.ts scripts/check_vendored_skills.test.ts
git commit -m "feat(vendor-activation): add git diff --no-index based diffContent"
```

---

### Task 4: Per-file 3-way comparison and report formatting

**Files:**
- Modify: `scripts/check_vendored_skills.ts`
- Modify: `scripts/check_vendored_skills.test.ts`

**Interfaces:**
- Consumes: `diffContent(contentA: string, contentB: string): string` from Task 3.
- Produces:
  - `export type FileDriftStatus = "no-drift" | "upstream-changed" | "removed-upstream";`
  - `export interface FileComparison { relPath: string; status: FileDriftStatus; upstreamDiff: string; localDiff: string }`
  - `export function compareFile(relPath: string, baselineContent: string, upstreamContent: string | null, localContent: string | null): FileComparison`
  - `export interface SkillReport { skillName: string; files: FileComparison[] }`
  - `export function formatSkillReport(report: SkillReport): string` — human-readable block: a one-line summary (`"<skillName>: no drift (<N> files checked)"`, or `"<skillName>: <U> file(s) changed upstream, <L> locally diverged"` where U/L are counts of files with non-empty `upstreamDiff`/`localDiff`), followed by, for every file with a non-empty `upstreamDiff` or `localDiff`, a labeled sub-block showing the file's `relPath` and whichever diffs are non-empty, each clearly labeled `upstream diff:` / `local divergence:`.

- [ ] **Step 1: Write the failing tests**

```typescript
// append to scripts/check_vendored_skills.test.ts
import { compareFile, formatSkillReport } from "./check_vendored_skills.ts";
import type { FileComparison } from "./check_vendored_skills.ts";

describe("compareFile", () => {
  it("reports no-drift when upstream and local both match baseline", () => {
    const result = compareFile("SKILL.md", "same\n", "same\n", "same\n");
    expect(result.status).toBe("no-drift");
    expect(result.upstreamDiff).toBe("");
    expect(result.localDiff).toBe("");
  });

  it("reports upstream-changed when only upstream differs from baseline", () => {
    const result = compareFile("SKILL.md", "old\n", "new\n", "old\n");
    expect(result.status).toBe("upstream-changed");
    expect(result.upstreamDiff).not.toBe("");
    expect(result.localDiff).toBe("");
  });

  it("reports local divergence separately from upstream drift when both differ from baseline", () => {
    const result = compareFile("SKILL.md", "base\n", "upstream-edit\n", "local-edit\n");
    expect(result.status).toBe("upstream-changed");
    expect(result.upstreamDiff).toContain("upstream-edit");
    expect(result.localDiff).toContain("local-edit");
    expect(result.upstreamDiff).not.toContain("local-edit");
    expect(result.localDiff).not.toContain("upstream-edit");
  });

  it("reports removed-upstream when the file no longer exists upstream", () => {
    const result = compareFile("SKILL.md", "base\n", null, "base\n");
    expect(result.status).toBe("removed-upstream");
    expect(result.upstreamDiff).toContain("no longer exists upstream");
  });

  it("notes a locally-missing file without crashing", () => {
    const result = compareFile("SKILL.md", "base\n", "base\n", null);
    expect(result.status).toBe("no-drift");
    expect(result.localDiff).toContain("missing locally");
  });
});

describe("formatSkillReport", () => {
  it("summarizes a skill with no drift", () => {
    const files: FileComparison[] = [
      { relPath: "SKILL.md", status: "no-drift", upstreamDiff: "", localDiff: "" },
    ];
    const text = formatSkillReport({ skillName: "brainstorming", files });
    expect(text).toContain("brainstorming: no drift (1 files checked)");
  });

  it("summarizes and details a skill with upstream drift", () => {
    const files: FileComparison[] = [
      { relPath: "SKILL.md", status: "upstream-changed", upstreamDiff: "+new line\n", localDiff: "" },
    ];
    const text = formatSkillReport({ skillName: "writing-plans", files });
    expect(text).toContain("writing-plans: 1 file(s) changed upstream, 0 locally diverged");
    expect(text).toContain("SKILL.md");
    expect(text).toContain("upstream diff:");
    expect(text).toContain("+new line");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run scripts/check_vendored_skills.test.ts`
Expected: FAIL — `compareFile`, `formatSkillReport` are not exported yet.

- [ ] **Step 3: Write minimal implementation**

```typescript
// add to scripts/check_vendored_skills.ts
export type FileDriftStatus = "no-drift" | "upstream-changed" | "removed-upstream";

export interface FileComparison {
  relPath: string;
  status: FileDriftStatus;
  upstreamDiff: string;
  localDiff: string;
}

export function compareFile(
  relPath: string,
  baselineContent: string,
  upstreamContent: string | null,
  localContent: string | null
): FileComparison {
  const localDiff =
    localContent === null
      ? "(file missing locally)"
      : localContent !== baselineContent
        ? diffContent(baselineContent, localContent)
        : "";

  if (upstreamContent === null) {
    return {
      relPath,
      status: "removed-upstream",
      upstreamDiff: "(file no longer exists upstream)",
      localDiff,
    };
  }

  const upstreamDiff =
    upstreamContent !== baselineContent ? diffContent(baselineContent, upstreamContent) : "";

  return {
    relPath,
    status: upstreamDiff !== "" ? "upstream-changed" : "no-drift",
    upstreamDiff,
    localDiff,
  };
}

export interface SkillReport {
  skillName: string;
  files: FileComparison[];
}

export function formatSkillReport(report: SkillReport): string {
  const upstreamCount = report.files.filter((f) => f.upstreamDiff !== "").length;
  const localCount = report.files.filter((f) => f.localDiff !== "").length;

  const lines: string[] = [];
  if (upstreamCount === 0 && localCount === 0) {
    lines.push(`${report.skillName}: no drift (${report.files.length} files checked)`);
  } else {
    lines.push(
      `${report.skillName}: ${upstreamCount} file(s) changed upstream, ${localCount} locally diverged`
    );
  }

  for (const file of report.files) {
    if (file.upstreamDiff === "" && file.localDiff === "") {
      continue;
    }
    lines.push(`  -- ${file.relPath} --`);
    if (file.upstreamDiff !== "") {
      lines.push("  upstream diff:");
      lines.push(file.upstreamDiff);
    }
    if (file.localDiff !== "") {
      lines.push("  local divergence:");
      lines.push(file.localDiff);
    }
  }

  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run scripts/check_vendored_skills.test.ts`
Expected: PASS (all tests from Tasks 1-4)

- [ ] **Step 5: Commit**

```bash
git add scripts/check_vendored_skills.ts scripts/check_vendored_skills.test.ts
git commit -m "feat(vendor-activation): add per-file comparison and report formatting"
```

---

### Task 5: Main CLI orchestration and live verification

**Files:**
- Modify: `scripts/check_vendored_skills.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-4 (`resolveUpstreamSkillsDir`, `listBaselineFiles`, `readGitBlob`, `readFileIfExists`, `compareFile`, `formatSkillReport`, `SkillReport`).
- Produces: `export const BASELINE_SHA = "a6418858b5374c2506d1ff799b2dcb418bff53d1";`, `export const VENDORED_SKILLS: string[]` (the 14 names from Global Constraints), and a `main()` function that runs when the file is executed directly.

- [ ] **Step 1: Implement `main()`**

```typescript
// add to scripts/check_vendored_skills.ts
export const BASELINE_SHA = "a6418858b5374c2506d1ff799b2dcb418bff53d1";

export const VENDORED_SKILLS: string[] = [
  "brainstorming",
  "dispatching-parallel-agents",
  "executing-plans",
  "finishing-a-development-branch",
  "receiving-code-review",
  "requesting-code-review",
  "subagent-driven-development",
  "systematic-debugging",
  "test-driven-development",
  "using-git-worktrees",
  "using-superpowers",
  "verification-before-completion",
  "writing-plans",
  "writing-skills",
];

export function checkSkill(name: string, upstreamSkillsDir: string): SkillReport {
  const skillRelDir = `skills/vendored-${name}`;
  const relFiles = listBaselineFiles(BASELINE_SHA, skillRelDir);
  const files = relFiles.map((relFile) => {
    const baselineContent = readGitBlob(BASELINE_SHA, `${skillRelDir}/${relFile}`);
    if (baselineContent === null) {
      throw new Error(
        `internal error: ${skillRelDir}/${relFile} was listed by listBaselineFiles but readGitBlob returned null`
      );
    }
    const upstreamContent = readFileIfExists(path.join(upstreamSkillsDir, name, relFile));
    const localContent = readFileIfExists(path.join(skillRelDir, relFile));
    return compareFile(relFile, baselineContent, upstreamContent, localContent);
  });
  return { skillName: name, files };
}

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

// import.meta.filename (stable in Node >=21.2) is this file's own absolute
// path; process.argv[1] is the script Node was invoked with. Equal only
// when this file is run directly, not when imported (e.g. by the test file).
if (import.meta.filename === process.argv[1]) {
  main();
}
```

- [ ] **Step 2: Run the full test suite to confirm nothing broke**

Run: `npx vitest run scripts/check_vendored_skills.test.ts`
Expected: PASS (all tests from Tasks 1-4 — Task 5 adds no new unit tests, since `main()`'s job is orchestration + I/O, verified live in Step 3 below)

- [ ] **Step 3: Run the script for real against the currently-installed Superpowers plugin**

Run: `node scripts/check_vendored_skills.ts`
Expected: Exits 0, prints a per-skill report for all 14 skills. Read the actual output — this is the real, first live check of upstream drift since the 2026-08-20 baseline (9 days have passed as of 2026-08-29). Note whatever it reports; don't just check for a clean exit.

- [ ] **Step 4: Verify local-divergence detection works, then revert**

Temporarily edit one line of `skills/vendored-brainstorming/SKILL.md` (any local, uncommitted change), then run:

Run: `node scripts/check_vendored_skills.ts`
Expected: The `brainstorming` skill's report block now shows a non-zero "locally diverged" count, with a `local divergence:` sub-block showing exactly the temporary edit — and does **not** show that edit under `upstream diff:` for any file. This confirms baseline/upstream/local are never conflated.

Then revert the temporary edit:

Run: `git checkout -- skills/vendored-brainstorming/SKILL.md`
Expected: `git status` shows the file is no longer modified.

- [ ] **Step 5: Commit**

```bash
git add scripts/check_vendored_skills.ts
git commit -m "feat(vendor-activation): wire up main() CLI, verified live against installed Superpowers"
```

---

### Task 6: Document the mechanism in vendored/PROVENANCE.md

**Files:**
- Modify: `vendored/PROVENANCE.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing consumed by later work — this is the terminal task for W.2.

- [ ] **Step 1: Add the baseline commit SHA and rewrite the Sync policy section**

In `vendored/PROVENANCE.md`, replace the existing `## Sync policy` section:

```markdown
## Sync policy

No automated sync or diff-tracking against upstream exists, by design
(DigiSmith stays a personal tool, not a multi-source merge system). Future
upstream Superpowers improvements are pulled in manually, skill by skill,
only if and when actually wanted. See DigiSmith `MEMORY.md` map item W.
```

with:

```markdown
## Sync policy

Baseline commit (the original clone, before any divergence):
`a6418858b5374c2506d1ff799b2dcb418bff53d1` — 2026-08-20,
"feat(vendor-superpowers-skills): clone all 14 Superpowers skills verbatim".

An on-demand check exists: `node scripts/check_vendored_skills.ts` (map
item **W.2**) 3-way-diffs every vendored skill against this baseline and
whatever Superpowers plugin version is currently installed, reporting
upstream drift and local divergence separately so an activated skill's
own edits are never confused with genuine upstream changes. Still
manual-trigger, not automatic-schedule or auto-merge — this is a
read-only report a human reviews and decides from, not a sync/merge
system, consistent with DigiSmith staying a personal tool. See DigiSmith
`MEMORY.md` map item W.
```

- [ ] **Step 2: Fix a now-stale cross-reference at the top of the Activation section**

The opening line of `## Activation` currently reads:

```markdown
A vendored skill above is "dormant" until a future map item W.2+ brainstorm
activates it. Until then, every vendored skill listed above is an inert,
```

`W.2` now refers to this very mechanism spec, not activation — replace `W.2+` with `W.4+` (the map letter now covering actual per-primitive content activation, per `MEMORY.md`'s current breakdown):

```markdown
A vendored skill above is "dormant" until a future map item W.4+ brainstorm
activates it. Until then, every vendored skill listed above is an inert,
```

- [ ] **Step 3: Add the fork-provenance tag format to the Activation checklist**

In the existing `## Activation` section, find this bullet:

```markdown
- Deconflicting the `description:` frontmatter field from the
  still-active `superpowers:<name>` original, so automatic skill
  selection can't pick the wrong one once content diverges. Today both
  descriptions are identical and harmless (bodies are identical too, and
  DigiSmith's call sites are always explicitly prefix-qualified), but that
  stops being true the moment a vendored copy's content changes.
```

Replace it with:

```markdown
- Deconflicting the `description:` frontmatter field from the
  still-active `superpowers:<name>` original, so automatic skill
  selection can't pick the wrong one once content diverges. Today both
  descriptions are identical and harmless (bodies are identical too, and
  DigiSmith's call sites are always explicitly prefix-qualified), but that
  stops being true the moment a vendored copy's content changes. Do this
  by appending a fork-provenance tag to the end of the existing
  description text: `(DigiSmith fork of Superpowers' <name>)` — e.g.
  `description: Use when implementation is complete... (DigiSmith fork of
  Superpowers' finishing-a-development-branch)`. Visible from a skill
  listing, not just from opening the file.
```

- [ ] **Step 4: Diff-review the whole file**

Run: `git diff vendored/PROVENANCE.md`
Expected: Only the Sync policy section replacement, the `W.2+`→`W.4+` fix, and the one Activation bullet addition — no accidental changes to the Skills-vendored list, License section, or the "Known stale path" note at the bottom.

- [ ] **Step 5: Commit**

```bash
git add vendored/PROVENANCE.md
git commit -m "docs(vendor-activation): record baseline SHA and document check_vendored_skills.ts"
```
