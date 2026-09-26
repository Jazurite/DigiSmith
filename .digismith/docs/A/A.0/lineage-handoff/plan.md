# Lineage Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the clear-and-hand-off step out of `finishing-a-development-branch` into its own `digismith:handoff` skill. The skill keeps one living note per lineage at `.digismith/docs/<Clan>/<Lineage>/handoff.md`, can run at any time, and is called automatically at the end of a ticket.

**Architecture:** A small script, `scripts/lineage-handoff.ts`, owns every mechanical part: session title → lineage key → note path, main-checkout resolution, note listing, and the `.git/info/exclude` line. Both the new skill (through its CLI) and the `SessionStart` hook (`scripts/session-init.ts`, by import) use it, so writing and reading cannot drift apart. The skill text owns the judgment parts: composing the note, the end-of-ticket cleanup checks, the check-before-clear gate, and resume.

**Tech Stack:** TypeScript run with `node --experimental-strip-types` (Node ≥ 24), Vitest 2, `node:child_process` `spawnSync` for git. No new dependencies.

**Spec:** `.digismith/docs/A/A.0/lineage-handoff/design.html` (ClickUp DGS-85, lineage A.0).

## Global Constraints

- Work only in the worktree `D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\lineage-handoff` (branch `worktree-lineage-handoff`). Never edit the main checkout.
- Note location: `.digismith/docs/<Clan>/<Lineage>/handoff.md` for a `<Letter>.<N>:` title, `.digismith/docs/<Clan>/handoff.md` for a `<Letter>:` title, `.digismith/docs/_unlettered/handoff.md` for any other title.
- Title key regex, exactly: `^\s*([A-Z])(?:\.(\d+))?\s*:`
- The note is always read and written in the **main checkout** (resolved from the git common directory), never relative to `process.cwd()`.
- Notes are never committed. Exclude pattern, exactly: `.digismith/docs/**/handoff.md`, appended to `.git/info/exclude`.
- Any `handoff.md` that git tracks is skipped by the listing.
- Note sections, exactly and in this order: `## Done`, `## Decisions`, `## Next`, `## Open problems`.
- Tests: Vitest, real temp directories and real `git` fixtures, no mocked fs. Run with `pnpm vitest run <file>`; full suite with `pnpm test`. Baseline before this plan: 545 tests in 55 files, all passing.
- Script CLI style follows `scripts/preferences.ts`: `parseArgs`/`requireArgs` from `scripts/cli-args.ts`, an `--action` flag, errors printed as `lineage-handoff: <message>` with `process.exitCode = 1`, and the `import.meta.filename === process.argv[1]` main guard.
- Commits: conventional title only (`feat(scope): ...` / `fix(scope): ...` / `refactor(scope): ...` / `docs(scope): ...`), **no body, no AI attribution of any kind**. The repo's `commit-msg` hook rejects attribution.
- Code comments: none, unless one explains a non-obvious WHY. Never mention a ticket key in code.

---

## File Structure

| File | Task | Responsibility |
|---|---|---|
| `scripts/lineage-handoff.ts` (create) | 1 | Title → key → path, main-checkout resolution, note listing, exclude line, CLI |
| `scripts/lineage-handoff.test.ts` (create) | 1 | Unit and CLI tests with real git fixtures |
| `scripts/session-init.ts` (modify) | 2 | Drop the `.digismith/sessions/` pointer; print the lineage-notes pointer |
| `scripts/session-init.test.ts` (modify) | 2 | Drop the old handoff tests; add pointer tests |
| `skills/handoff/SKILL.md` (create) | 3 | The new skill: write mode, resume mode, clear gate |
| `skills/finishing-a-development-branch/SKILL.md` (modify) | 4 | Step 7 hands off to `digismith:handoff` |
| `skills/subagent-driven-development/SKILL.md` (modify) | 4 | 4 call sites → `digismith:finishing-a-development-branch` |
| `vendored/PROVENANCE.md` (modify) | 4 | Record both divergences |
| `backlog/standard-handoff-format.md` (delete), `backlog/README.md`, `backlog/handoff-pointer-missed-on-fresh-session-w12.md` (modify) | 4 | Backlog bookkeeping |

---

### Task 1: `scripts/lineage-handoff.ts`

**Files:**
- Create: `scripts/lineage-handoff.ts`
- Test: `scripts/lineage-handoff.test.ts`

**Interfaces:**
- Consumes: `parseArgs(argv: string[]): Record<string, string>` and `requireArgs(args: Record<string, string>, names: string[]): void` from `scripts/cli-args.ts` (existing).
- Produces (later tasks rely on these exact names):
  - `DOCS_DIR_PATH = ".digismith/docs"`, `NOTE_FILENAME = "handoff.md"`, `UNLETTERED_KEY = "_unlettered"`, `EXCLUDE_PATTERN = ".digismith/docs/**/handoff.md"`
  - `type LineageKey = { clan: string; lineage?: string }`
  - `parseLineageKey(title: string): LineageKey | null`
  - `noteRelPath(key: LineageKey | null): string` (forward slashes, relative to the main root)
  - `resolveMainRoot(cwd: string): string`
  - `listNotes(mainRoot: string): string[]` (keys like `"A/A.0"`, `"K"`, `"_unlettered"`, sorted)
  - `type ExcludeResult = "already-ignored" | "added" | "not-a-repo"`
  - `ensureExcluded(mainRoot: string, relPath: string): ExcludeResult`
  - CLI: `--action path --title "<t>"` prints the absolute note path; `--action ensure-excluded --title "<t>"` prints `lineage-handoff: <ExcludeResult>`; `--action list` prints one key per line.

- [ ] **Step 1: Write the failing tests**

Create `scripts/lineage-handoff.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  DOCS_DIR_PATH,
  NOTE_FILENAME,
  UNLETTERED_KEY,
  EXCLUDE_PATTERN,
  parseLineageKey,
  noteRelPath,
  resolveMainRoot,
  listNotes,
  ensureExcluded,
} from "./lineage-handoff.ts";

const SCRIPT_PATH = fileURLToPath(new URL("./lineage-handoff.ts", import.meta.url));

function real(p: string): string {
  return fs.realpathSync.native(p);
}

function git(cwd: string, ...args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function initRepo(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  fs.writeFileSync(path.join(dir, "README.md"), "base\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base commit");
}

function writeNote(root: string, relPath: string, content = "# Note\n"): void {
  const full = path.join(root, ...relPath.split("/"));
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function runCli(cwd: string, ...args: string[]) {
  return spawnSync("node", ["--experimental-strip-types", SCRIPT_PATH, ...args], { cwd, encoding: "utf8" });
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-lineage-handoff-test-"));
  process.env.GIT_CEILING_DIRECTORIES = real(path.dirname(tmpDir));
});

afterEach(() => {
  delete process.env.GIT_CEILING_DIRECTORIES;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("constants", () => {
  it("locks the documented paths and pattern", () => {
    expect(DOCS_DIR_PATH).toBe(".digismith/docs");
    expect(NOTE_FILENAME).toBe("handoff.md");
    expect(UNLETTERED_KEY).toBe("_unlettered");
    expect(EXCLUDE_PATTERN).toBe(".digismith/docs/**/handoff.md");
  });
});

describe("parseLineageKey", () => {
  it.each([
    ["A.0: Primitives", { clan: "A", lineage: "A.0" }],
    ["A.1: Life  Cycle Hook", { clan: "A", lineage: "A.1" }],
    ["  D.3 : ClickUp Channel", { clan: "D", lineage: "D.3" }],
    ["A.12: Two digits", { clan: "A", lineage: "A.12" }],
    ["K: Maestro", { clan: "K" }],
  ])("parses %j", (title, expected) => {
    expect(parseLineageKey(title)).toEqual(expected);
  });

  it.each([
    "General",
    "a.0: lowercase letter",
    "W.4.1: nested number",
    "EMKT-756: consumer ticket",
    "AB: two letters",
    "A.0 no colon",
    "",
  ])("returns null for %j", (title) => {
    expect(parseLineageKey(title)).toBeNull();
  });
});

describe("noteRelPath", () => {
  it("nests a lineage under its clan", () => {
    expect(noteRelPath({ clan: "A", lineage: "A.0" })).toBe(".digismith/docs/A/A.0/handoff.md");
  });

  it("puts a clan-level note directly in the clan folder", () => {
    expect(noteRelPath({ clan: "K" })).toBe(".digismith/docs/K/handoff.md");
  });

  it("uses the unlettered folder for no key", () => {
    expect(noteRelPath(null)).toBe(".digismith/docs/_unlettered/handoff.md");
  });
});

describe("resolveMainRoot", () => {
  it("returns the repo root from the root", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    expect(real(resolveMainRoot(main))).toBe(real(main));
  });

  it("returns the repo root from a subdirectory", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    const sub = path.join(main, "sub");
    fs.mkdirSync(sub);
    expect(real(resolveMainRoot(sub))).toBe(real(main));
  });

  it("returns the main checkout from a linked worktree", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    const wt = path.join(tmpDir, "wt");
    git(main, "worktree", "add", "-q", "-b", "wt", wt);
    expect(real(resolveMainRoot(wt))).toBe(real(main));
  });

  it("returns cwd unchanged outside git", () => {
    const plain = path.join(tmpDir, "plain");
    fs.mkdirSync(plain);
    expect(resolveMainRoot(plain)).toBe(plain);
  });
});

describe("listNotes", () => {
  it("returns an empty array when there is no docs folder", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    expect(listNotes(main)).toEqual([]);
  });

  it("lists clan-level, lineage-level, and unlettered notes, sorted", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    writeNote(main, ".digismith/docs/K/handoff.md");
    writeNote(main, ".digismith/docs/A/A.0/handoff.md");
    writeNote(main, ".digismith/docs/_unlettered/handoff.md");
    expect(listNotes(main)).toEqual(["A/A.0", "K", "_unlettered"]);
  });

  it("ignores handoff.md deeper than the lineage level and other files", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    writeNote(main, ".digismith/docs/A/A.0/lineage-handoff/handoff.md");
    writeNote(main, ".digismith/docs/A/A.0/design.html", "<html></html>");
    expect(listNotes(main)).toEqual([]);
  });

  it("skips a note that git tracks", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    writeNote(main, ".digismith/docs/K/handoff.md");
    git(main, "add", "-A");
    git(main, "commit", "-q", "-m", "commit a note");
    writeNote(main, ".digismith/docs/A/A.0/handoff.md");
    expect(listNotes(main)).toEqual(["A/A.0"]);
  });

  it("lists notes outside git without filtering", () => {
    const plain = path.join(tmpDir, "plain");
    writeNote(plain, ".digismith/docs/K/handoff.md");
    expect(listNotes(plain)).toEqual(["K"]);
  });
});

describe("ensureExcluded", () => {
  it("adds the pattern once, then reports it as already ignored", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    const excludePath = path.join(main, ".git", "info", "exclude");

    expect(ensureExcluded(main, ".digismith/docs/A/A.0/handoff.md")).toBe("added");
    expect(ensureExcluded(main, ".digismith/docs/A/A.0/handoff.md")).toBe("already-ignored");

    const lines = fs.readFileSync(excludePath, "utf8").split("\n");
    expect(lines.filter((line) => line === EXCLUDE_PATTERN)).toHaveLength(1);
    expect(git(main, "check-ignore", "-q", ".digismith/docs/K/handoff.md").status).toBe(0);
  });

  it("starts the pattern on a new line when the exclude file has no trailing newline", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    const excludePath = path.join(main, ".git", "info", "exclude");
    fs.mkdirSync(path.dirname(excludePath), { recursive: true });
    fs.writeFileSync(excludePath, "foo");

    ensureExcluded(main, ".digismith/docs/K/handoff.md");

    expect(fs.readFileSync(excludePath, "utf8")).toBe(`foo\n${EXCLUDE_PATTERN}\n`);
  });

  it("reports not-a-repo outside git", () => {
    const plain = path.join(tmpDir, "plain");
    fs.mkdirSync(plain);
    expect(ensureExcluded(plain, ".digismith/docs/K/handoff.md")).toBe("not-a-repo");
  });
});

describe("CLI", () => {
  it("--action path prints the main checkout's note path from a worktree", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    const wt = path.join(tmpDir, "wt");
    git(main, "worktree", "add", "-q", "-b", "wt", wt);
    const suffix = path.join(".digismith", "docs", "A", "A.0", "handoff.md");

    const result = runCli(wt, "--action", "path", "--title", "A.0: Primitives");

    expect(result.status).toBe(0);
    const printed = result.stdout.trim();
    expect(printed.endsWith(suffix)).toBe(true);
    expect(real(printed.slice(0, -suffix.length))).toBe(real(main));
  });

  it("--action list prints one key per line", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    writeNote(main, ".digismith/docs/A/A.0/handoff.md");
    writeNote(main, ".digismith/docs/K/handoff.md");

    const result = runCli(main, "--action", "list");

    expect(result.status).toBe(0);
    expect(result.stdout.trim().split(/\r?\n/)).toEqual(["A/A.0", "K"]);
  });

  it("--action ensure-excluded prints the result", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);

    const result = runCli(main, "--action", "ensure-excluded", "--title", "K: Maestro");

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("lineage-handoff: added");
  });

  it("fails when --title is missing for --action path", () => {
    const result = runCli(tmpDir, "--action", "path");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing required flag: --title");
  });

  it("fails on an unknown action", () => {
    const result = runCli(tmpDir, "--action", "bogus");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unknown --action "bogus"');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/lineage-handoff.test.ts`
Expected: FAIL. The import of `./lineage-handoff.ts` cannot be resolved.

- [ ] **Step 3: Write the implementation**

Create `scripts/lineage-handoff.ts`:

```ts
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs, requireArgs } from "./cli-args.ts";

export const DOCS_DIR_PATH = ".digismith/docs";
export const NOTE_FILENAME = "handoff.md";
export const UNLETTERED_KEY = "_unlettered";
export const EXCLUDE_PATTERN = ".digismith/docs/**/handoff.md";

export type LineageKey = { clan: string; lineage?: string };
export type ExcludeResult = "already-ignored" | "added" | "not-a-repo";

export function parseLineageKey(title: string): LineageKey | null {
  const match = /^\s*([A-Z])(?:\.(\d+))?\s*:/.exec(title);
  if (!match) return null;
  const [, clan, number] = match;
  return number === undefined ? { clan } : { clan, lineage: `${clan}.${number}` };
}

function keySegments(key: LineageKey | null): string[] {
  if (key === null) return [UNLETTERED_KEY];
  return key.lineage === undefined ? [key.clan] : [key.clan, key.lineage];
}

export function noteRelPath(key: LineageKey | null): string {
  return [DOCS_DIR_PATH, ...keySegments(key), NOTE_FILENAME].join("/");
}

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

export function resolveMainRoot(cwd: string): string {
  const result = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const commonDir = result.status === 0 ? result.stdout.trim() : "";
  return commonDir ? path.dirname(path.resolve(commonDir)) : cwd;
}

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function subdirs(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

function keyRelPath(key: string): string {
  return `${DOCS_DIR_PATH}/${key}/${NOTE_FILENAME}`;
}

export function listNotes(mainRoot: string): string[] {
  const docsDir = path.join(mainRoot, ...DOCS_DIR_PATH.split("/"));
  const found: string[] = [];
  for (const clan of subdirs(docsDir)) {
    if (isFile(path.join(docsDir, clan, NOTE_FILENAME))) found.push(clan);
    for (const lineage of subdirs(path.join(docsDir, clan))) {
      if (isFile(path.join(docsDir, clan, lineage, NOTE_FILENAME))) found.push(`${clan}/${lineage}`);
    }
  }
  if (found.length === 0) return [];
  const tracked = git(mainRoot, ["ls-files", "--", ...found.map(keyRelPath)]);
  const trackedPaths = new Set(
    tracked.status === 0 ? tracked.stdout.split(/\r?\n/).filter((line) => line !== "") : [],
  );
  return found.filter((key) => !trackedPaths.has(keyRelPath(key)));
}

export function ensureExcluded(mainRoot: string, relPath: string): ExcludeResult {
  const check = git(mainRoot, ["check-ignore", "-q", relPath]);
  if (check.status === 0) return "already-ignored";
  if (check.status !== 1) return "not-a-repo";
  const excludePath = git(mainRoot, ["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"]).stdout.trim();
  fs.mkdirSync(path.dirname(excludePath), { recursive: true });
  const existing = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, "utf8") : "";
  const separator = existing === "" || existing.endsWith("\n") ? "" : "\n";
  fs.appendFileSync(excludePath, `${separator}${EXCLUDE_PATTERN}\n`);
  return "added";
}

export function main(): void {
  const args = parseArgs(process.argv.slice(2));
  try {
    requireArgs(args, ["action"]);
    const mainRoot = resolveMainRoot(process.cwd());
    switch (args.action) {
      case "path": {
        requireArgs(args, ["title"]);
        const relPath = noteRelPath(parseLineageKey(args.title));
        console.log(path.join(mainRoot, ...relPath.split("/")));
        break;
      }
      case "ensure-excluded": {
        requireArgs(args, ["title"]);
        console.log(`lineage-handoff: ${ensureExcluded(mainRoot, noteRelPath(parseLineageKey(args.title)))}`);
        break;
      }
      case "list": {
        for (const key of listNotes(mainRoot)) console.log(key);
        break;
      }
      default:
        throw new Error(`unknown --action "${args.action}" — expected path, ensure-excluded, or list`);
    }
  } catch (err) {
    console.error(`lineage-handoff: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

if (import.meta.filename === process.argv[1]) {
  main();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/lineage-handoff.test.ts`
Expected: PASS, all tests in the file.

If `resolveMainRoot` tests fail only on path spelling (short 8.3 names, drive-letter case), keep comparing through `real()` on both sides as written. Do not weaken the assertion to `toContain`.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: PASS. 545 baseline tests plus this file's new tests, 56 files.

- [ ] **Step 6: Commit**

```bash
git add scripts/lineage-handoff.ts scripts/lineage-handoff.test.ts
git commit -m "feat(handoff): add lineage-handoff path script"
```

---

### Task 2: `session-init.ts` points to lineage notes

**Files:**
- Modify: `scripts/session-init.ts` (remove `SESSIONS_DIR_PATH`, `listHandoffFiles`, `findNewestHandoff`, `readHandoffTitle`, `buildHandoffPointer`; add `buildLineagePointer`; change `main()`)
- Test: `scripts/session-init.test.ts`

**Interfaces:**
- Consumes (from Task 1): `DOCS_DIR_PATH`, `listNotes(mainRoot: string): string[]`, `resolveMainRoot(cwd: string): string` from `./lineage-handoff.ts`.
- Produces: `buildLineagePointer(mainRoot: string): string | undefined`. The line is exactly:
  `DigiSmith: lineage handoff notes in <path.join(mainRoot, ".digismith", "docs")>: <keys joined by ", "> — read the one matching your session title (get_session self), or say "resume"`

- [ ] **Step 1: Update the tests first**

In `scripts/session-init.test.ts`:

1. Replace the import block at the top with:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import {
  DEFAULT_PROFILE_PATH,
  VOICE_INIT_FILENAME,
  readProfile,
  loadVoiceSummary,
  buildLineagePointer,
  formatBanner,
  buildBanner,
  main,
  isDigismithRepoRoot,
} from "./session-init.ts";
import { resolveMainRoot } from "./lineage-handoff.ts";
```

2. In `describe("constants", ...)`, delete the test `"locks the documented sessions directory path"`.

3. Delete these four `describe` blocks entirely: `describe("listHandoffFiles", ...)`, `describe("findNewestHandoff", ...)`, `describe("readHandoffTitle", ...)`, `describe("buildHandoffPointer", ...)`.

4. In their place (directly before `describe("buildBanner", ...)`), add:

```ts
function writeNote(root: string, relPath: string): void {
  const full = path.join(root, ...relPath.split("/"));
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, "# Note\n");
}

function initRepo(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "README.md"), "base\n");
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "base commit"], { cwd: dir });
}

describe("buildLineagePointer", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-session-init-test-"));
    process.env.GIT_CEILING_DIRECTORIES = fs.realpathSync.native(path.dirname(tmpDir));
  });

  afterEach(() => {
    delete process.env.GIT_CEILING_DIRECTORIES;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns undefined when there are no notes", () => {
    expect(buildLineagePointer(tmpDir)).toBeUndefined();
  });

  it("names every note in one line", () => {
    writeNote(tmpDir, ".digismith/docs/A/A.0/handoff.md");
    writeNote(tmpDir, ".digismith/docs/K/handoff.md");
    expect(buildLineagePointer(tmpDir)).toBe(
      `DigiSmith: lineage handoff notes in ${path.join(tmpDir, ".digismith", "docs")}: A/A.0, K — read the one matching your session title (get_session self), or say "resume"`,
    );
  });

  it("reads the main checkout's notes when resolved from a worktree", () => {
    const main = path.join(tmpDir, "main");
    initRepo(main);
    const wt = path.join(tmpDir, "wt");
    spawnSync("git", ["worktree", "add", "-q", "-b", "wt", wt], { cwd: main });
    writeNote(main, ".digismith/docs/A/A.0/handoff.md");
    writeNote(wt, ".digismith/docs/K/handoff.md");
    const mainRoot = resolveMainRoot(wt);

    expect(buildLineagePointer(mainRoot)).toBe(
      `DigiSmith: lineage handoff notes in ${path.join(mainRoot, ".digismith", "docs")}: A/A.0 — read the one matching your session title (get_session self), or say "resume"`,
    );
  });
});
```

5. In `describe("main (CLI)", ...)`: in its `beforeEach`, after `process.chdir(tmpDir);`, add
   `process.env.GIT_CEILING_DIRECTORIES = fs.realpathSync.native(path.dirname(tmpDir));`
   and in its `afterEach`, before `fs.rmSync(...)`, add `delete process.env.GIT_CEILING_DIRECTORIES;`.

6. Replace the test `"prints the handoff pointer even with no .digismith/profile"` with:

```ts
  it("prints the lineage pointer even with no .digismith/profile", async () => {
    writeNote(tmpDir, ".digismith/docs/A/A.0/handoff.md");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main();

    expect(logSpy).toHaveBeenCalledWith(
      `DigiSmith: lineage handoff notes in ${path.join(process.cwd(), ".digismith", "docs")}: A/A.0 — read the one matching your session title (get_session self), or say "resume"`,
    );
  });

  it("ignores the retired sessions folder", async () => {
    fs.mkdirSync(path.join(tmpDir, ".digismith", "sessions"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, ".digismith", "sessions", "abc123.md"), "# Old handoff\n");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main();

    expect(logSpy).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/session-init.test.ts`
Expected: FAIL. `buildLineagePointer` is not exported from `./session-init.ts`.

- [ ] **Step 3: Update `scripts/session-init.ts`**

1. Add this import after the existing `node:url` import:

```ts
import { DOCS_DIR_PATH, listNotes, resolveMainRoot } from "./lineage-handoff.ts";
```

2. Delete the line `export const SESSIONS_DIR_PATH = ".digismith/sessions";`.

3. Delete the four functions `listHandoffFiles`, `findNewestHandoff`, `readHandoffTitle`, and `buildHandoffPointer` in full. Keep `isFile` (still used by `isDigismithRepoRoot` and `loadVoiceSummary`).

4. Add in their place:

```ts
export function buildLineagePointer(mainRoot: string): string | undefined {
  const keys = listNotes(mainRoot);
  if (keys.length === 0) return undefined;
  const docsDir = path.join(mainRoot, ...DOCS_DIR_PATH.split("/"));
  return `DigiSmith: lineage handoff notes in ${docsDir}: ${keys.join(", ")} — read the one matching your session title (get_session self), or say "resume"`;
}
```

5. In `main()`, replace:

```ts
    const handoffPointer = buildHandoffPointer(path.join(process.cwd(), SESSIONS_DIR_PATH));
    if (handoffPointer) console.log(handoffPointer);
```

with:

```ts
    const lineagePointer = buildLineagePointer(resolveMainRoot(process.cwd()));
    if (lineagePointer) console.log(lineagePointer);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/session-init.test.ts`
Expected: PASS. 43 − 19 removed + 5 added = 29 tests.

- [ ] **Step 5: Check the hook command still runs**

Run: `node --experimental-strip-types scripts/session-init.ts`
Expected: exit 0. It prints the attribution line (`DigiSmith: no AI attribution in commits or PRs — no exceptions`), plus the profile banner if `.digismith/profile` exists. It prints a lineage line only if the main checkout already has a `handoff.md`, and nothing about the sessions folder.

- [ ] **Step 6: Run the full suite**

Run: `pnpm test`
Expected: PASS, 56 files.

- [ ] **Step 7: Commit**

```bash
git add scripts/session-init.ts scripts/session-init.test.ts
git commit -m "feat(session-init): point to lineage handoff notes"
```

---

### Task 3: `skills/handoff/SKILL.md`

**Files:**
- Create: `skills/handoff/SKILL.md`

**Interfaces:**
- Consumes (from Task 1): the CLI `node --experimental-strip-types <digismith-root>/scripts/lineage-handoff.ts --action path|ensure-excluded|list [--title "<t>"]`. Also consumes `digismith:preferences` `get`/`set` for key `clear_context` (existing), and the MCP tools `mcp__ccd_session_mgmt__get_session` and `mcp__ccd_session_mgmt__clear_session`.
- Produces: the skill `digismith:handoff`, with write mode (manual and **end-of-ticket mode**) and resume mode. Task 4's Step 7 text invokes it by that name and that mode name.

- [ ] **Step 1: Create the skill file**

Create `skills/handoff/SKILL.md` with exactly this content:

````markdown
---
name: handoff
description: Use when the user asks to hand off, wrap up, checkpoint, "save where we are", start fresh, or clear context — writes this lineage's living handoff note (Done / Decisions / Next / Open problems) and clears the session only when asked. Also use when the user says "resume" or "pick up where we left off", and when digismith:finishing-a-development-branch Step 7 hands off at the end of a ticket.
---

# Handoff

## Overview

The last stage of DigiSmith's ticket workflow, and a checkpoint you can take at any time. Each
lineage keeps one living note that says where the lineage stands now:

```
.digismith/docs/<Clan>/<Lineage>/handoff.md    title "A.0: Primitives"  → A/A.0
.digismith/docs/<Clan>/handoff.md              title "K: Maestro"       → K
.digismith/docs/_unlettered/handoff.md         any other title
```

Every handoff rewrites the whole note. The next session of the lineage finds it from its own
session title. Keep it short: the code, plan, and report carry the rest.

Two modes:

- **Write** (default): compose the note, write it, show it, and clear the session only when that
  was asked for. **End-of-ticket mode** is write mode called by
  `digismith:finishing-a-development-branch` Step 7; it adds the cleanup round below and lets
  the `clear_context` preference decide the clear.
- **Resume**: read this lineage's note and pick the work back up.

## Invoked By

- The human partner, at any time:
  - write: "hand off", "handoff", "wrap up", "save where we are", "checkpoint"
  - write, then clear: "hand off and clear", "start fresh", "clear context"
  - resume: "resume", "pick up where we left off"
- `digismith:finishing-a-development-branch` Step 7, after Option 1 or Option 2 (write,
  end-of-ticket mode).
- A `SessionStart` line `DigiSmith: lineage handoff notes in ...` (resume).

## The Script

`<digismith-root>` is two levels up from this skill's base directory (shown when the skill
loads). Use this copy, not a path asked from the human partner: the script and this text ship
together in one plugin version.

```bash
node --experimental-strip-types <digismith-root>/scripts/lineage-handoff.ts --action path --title "<session title>"
node --experimental-strip-types <digismith-root>/scripts/lineage-handoff.ts --action ensure-excluded --title "<session title>"
node --experimental-strip-types <digismith-root>/scripts/lineage-handoff.ts --action list
```

Run them from the repo being worked in: its main checkout or any of its worktrees. The script
resolves the main checkout itself, so the note always lands in the main checkout's
`.digismith/docs/`. `<main-root>` below is the note path up to `/.digismith/docs/`.

## Resolve the Note

1. Call `mcp__ccd_session_mgmt__get_session` with `session_id: "self"` and read `title`.
2. Run `--action path --title "<title>"`. The printed absolute path is this session's note.
3. If the path is under `_unlettered`, say so in the reply, so a wrong title is noticed.
4. If `get_session` fails or there is no title, ask which lineage this is (e.g. `A.0`) and pass
   `--title "<answer>:"`. Do not guess: a wrong key overwrites another lineage's note.

## Write Mode

1. Resolve the note.
2. If the note already exists, read it. Carry forward only what is still true, typically
   open problems not yet solved and decisions that still hold.
3. Compose the note (see Note Format). Sources: this conversation; any plan ledger or
   `progress.md` for status (cross-check it, do not restate status from memory). For the header,
   run `git branch --show-current` and `git -C <main-root> rev-parse --short HEAD`.
4. **End-of-ticket mode only: the cleanup round.**
   - Sweep the conversation for unresolved threads: a pending question, a task mentioned but not
     started, something asked to be revisited.
   - Check each item that applies here:
     - DigiSmith's own repo (`.claude-plugin/plugin.json` names `digismith`): the lineage's row
       in `MEMORY.md` records this ticket.
     - The ticket is a ClickUp task (a `DGS-` key): its progress comment for this checkpoint is
       posted.
     - Something was filed under another lineage: that lineage's session got a pointer message.
   - Put every open thread and every missing item under Open problems, one line each. Do not do
     the chores themselves.
5. Run `--action ensure-excluded --title "<title>"`.
6. Write the whole note to the resolved path. If the write fails, report it, do not clear, and
   stop.
7. Show the note in the reply.
8. Decide whether to clear (next section).

## Clear Decision

**Manual run:** clear only if this message asked for it ("hand off and clear", "start fresh",
"clear context"). Otherwise stop after showing the note.

**End-of-ticket mode:** invoke `digismith:preferences`' `get` operation for key `clear_context`.

- **`unset`**: go to the check gate, and add two questions to its message: "Clear this session
  now that the ticket is done? And remember that answer as this repo's default?" On the reply, if
  the second answer is yes, write `clear_context` (`yes` or `no`, matching the first answer) with
  `digismith:preferences`' `set` operation. A no to the first question means no clear.
- **`yes`**: if this run's message says "don't clear", "keep going", or "not this time", do not
  clear; the saved value is untouched. Otherwise announce "Using saved default for this repo:
  clearing after you check the note. Say 'don't clear' to keep going." and go to the check gate.
- **`no`**: if this run's message says "clear context" or "start fresh", go to the check gate;
  the saved value is untouched. Otherwise do not clear.

## Check Gate

Every clear waits for the human partner to check the note. End the turn with the note shown and:
"Fix anything, or say ok to clear."

On the next message:

- **ok / yes:** clear.
- **Corrections:** rewrite the note with them, show what changed, then clear.
- **Anything else** (new work, a question, "don't clear"): do not clear. The note stays written;
  handle the message normally.

To clear: first say the final summary (what is done, what is next, `Handoff note: <path>`), then,
as the last action of the turn, call `mcp__ccd_session_mgmt__clear_session` with
`session_id: "self"`. The clear takes effect when the turn ends and the session goes idle. A
message that arrives before then drops the queued clear; that is expected. If `clear_session` is
not available (plain CLI, no desktop app), tell the human partner to run `/clear`.

## Resume Mode

1. Resolve the note.
2. If it does not exist, say "No handoff note for this lineage at `<path>`." and stop. Do not read
   another lineage's note instead.
3. Read it. If the header has `main @ <sha>`, run
   `git -C <main-root> rev-list --count <sha>..HEAD` and report how many commits `main` has
   gained since the note. Skip this if the SHA is missing or unknown.
4. State Done and Next in a few lines, then ask "Continue with <Next>?" Do not start it without a
   go: days may have passed, and another session may have moved things.

## Note Format

```markdown
# <one line: what this lineage is doing>
Updated <UTC time, e.g. 2026-09-26T10:40Z> · branch <current branch> · main @ <short sha>

## Done
<What is finished. Point at the report or commits; do not restate them.>

## Decisions
<Choices made and why, that the code does not show. "None" if none.>

## Next
<The next concrete action, exact enough for a cold session.
Last line: the literal command or skill call, when there is one.>

## Open problems
<Unresolved threads, deferred items with their id or link, cleanup gaps. "None" if none.>
```

The first line is always the H1 title. Exactly these four sections, in this order.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "The ticket's done, they'd obviously want a fresh start" | Only an explicit ask or a saved `yes` clears. Never infer it. |
| "I'll clear now and summarize after" | The clear drops everything after this turn. Summary first, clear last. |
| "The note looks fine, I can skip the check" | Every clear waits for the human partner's ok or fixes. |
| "The title has no prefix; I can tell the lineage from the work" | A wrong key overwrites another lineage's note. An unmatched title goes to `_unlettered`; no title means ask. |
| "I'll append today's work under the old note" | Rewrite the whole note. Carry forward only what is still true. |
| "The write failed, but I'll clear anyway" | The note is the only state that survives the clear. No note, no clear. |
| "Resume found a note, so I'll start on Next" | Ask first. Days may have passed, and another session may have moved things. |
| "While wrapping up I'll also update MEMORY and ClickUp" | The cleanup round checks and lists gaps. It does not do those chores. |
````

- [ ] **Step 2: Verify the frontmatter and the script calls**

Run: `head -4 skills/handoff/SKILL.md`
Expected: `---`, `name: handoff`, a `description:` line, `---`.

Run: `node --experimental-strip-types scripts/lineage-handoff.ts --action path --title "A.0: Primitives"`
Expected: exit 0, prints `D:\Workspace\Jazurite\DigiSmith\.digismith\docs\A\A.0\handoff.md`. That is the **main checkout**, not the worktree, even though this runs from the worktree.

Run: `grep -c "digismith-root" skills/handoff/SKILL.md`
Expected: a count of 4 or more. Every script call uses `<digismith-root>`, never a bare `scripts/` path.

- [ ] **Step 3: Run the full suite**

Run: `pnpm test`
Expected: PASS, no change from Task 2.

- [ ] **Step 4: Commit**

```bash
git add skills/handoff/SKILL.md
git commit -m "feat(handoff): add handoff skill"
```

---

### Task 4: Wire Step 7, fix SDD call sites, bookkeeping

**Files:**
- Modify: `skills/finishing-a-development-branch/SKILL.md` (lines ~268, ~321-322, the whole `## Step 7` section ~376-475, Quick Reference ~490-492, Common Rationalizations ~498-499)
- Modify: `skills/subagent-driven-development/SKILL.md` (lines 77, 106, 487, 566)
- Modify: `vendored/PROVENANCE.md`
- Delete: `backlog/standard-handoff-format.md`
- Modify: `backlog/README.md`, `backlog/handoff-pointer-missed-on-fresh-session-w12.md`

**Interfaces:**
- Consumes (from Task 3): the skill name `digismith:handoff` and its mode name "end-of-ticket mode".
- Produces: nothing code-level. After this task, no text in `skills/` refers to `.digismith/sessions/`.

- [ ] **Step 1: Update the two Step 7 lead-ins in `finishing-a-development-branch`**

Replace:

```
Once cleanup (Step 6) is done, continue to Step 7 to offer clearing this session's context.
```

with:

```
Once cleanup (Step 6) is done, continue to Step 7 to hand off.
```

Replace:

```
Once the Teams-notification offer is resolved (either answer), continue to Step 7 to offer
clearing this session's context.
```

with:

```
Once the Teams-notification offer is resolved (either answer), continue to Step 7 to hand off.
```

- [ ] **Step 2: Replace the whole Step 7 section**

Delete everything from the heading `## Step 7: Offer to Clear Context` down to and including the paragraph that ends `queued clear; that is expected behavior, not a bug to work around.` (the line just before `## Quick Reference`). Put this in its place:

```markdown
## Step 7: Hand Off

**Runs after Option 1 or Option 2 only** — never after Option 3 (Keep As-Is), which is a
deliberate deferral, not completion, the same distinction Step 4.5 already draws for its own
follow-up.

Invoke `digismith:handoff` in end-of-ticket mode. It writes this lineage's handoff note, runs the
end-of-ticket cleanup round, and decides whether to clear this session using the repo's
`clear_context` preference. This skill does nothing further after that.
```

- [ ] **Step 3: Update the Quick Reference paragraph**

Replace:

```
Step 7 (after Options 1/2 only) can similarly skip its own ask when a
`clear_context` preference is already saved for the repo — see that step
for the full logic.
```

with:

```
Step 7 (after Options 1/2 only) hands off to `digismith:handoff`, which owns
the `clear_context` preference.
```

- [ ] **Step 4: Remove the two clear-related rationalization rows**

In `## Common Rationalizations`, delete the row that starts `| "The feature's done, they'd obviously want a fresh start" |` and the row that starts `| "I'll clear now and mention what's next after" |`. Both now live in `skills/handoff/SKILL.md`.

- [ ] **Step 5: Verify the finishing skill**

Run: `grep -n "clear_session\|digismith/sessions\|Offer to Clear" skills/finishing-a-development-branch/SKILL.md`
Expected: no output.

Run: `grep -n "digismith:handoff" skills/finishing-a-development-branch/SKILL.md`
Expected: two lines, one in Step 7 and one in the Quick Reference.

- [ ] **Step 6: Fix the SDD call sites**

Run: `sed -i 's/superpowers:finishing-a-development-branch/digismith:finishing-a-development-branch/g' skills/subagent-driven-development/SKILL.md`

Run: `grep -c "superpowers:finishing-a-development-branch" skills/subagent-driven-development/SKILL.md`
Expected: `0`.

Run: `grep -c "digismith:finishing-a-development-branch" skills/subagent-driven-development/SKILL.md`
Expected: `4`.

Leave SDD's other `superpowers:` references (`requesting-code-review`, `using-git-worktrees`) alone. They are tracked elsewhere.

- [ ] **Step 7: Commit the skill wiring**

```bash
git add skills/finishing-a-development-branch/SKILL.md skills/subagent-driven-development/SKILL.md
git commit -m "refactor(finishing): hand off to digismith:handoff at step 7"
```

- [ ] **Step 8: Record both divergences in `vendored/PROVENANCE.md`**

In the `finishing-a-development-branch` entry, after the sentence ending `` `fire-lifecycle-hook.md` gained the "Merge-range
  pins" contract those hooks read.``, append on the following lines (same two-space indent):

```
  **Further diverged by DGS-85** (2026-09-26, lineage A.0): Step 7 no longer writes
  `.digismith/sessions/` handoffs or clears the session itself. It hands off to the new native
  `digismith:handoff` skill, which owns the per-lineage handoff note and the `clear_context`
  preference.
```

In the `subagent-driven-development` entry, after the sentence ending `also fixing a basename collision between differently-named plan files sharing one folder.`, append:

```
  **Further diverged by DGS-85** (2026-09-26): its four `superpowers:finishing-a-development-branch`
  call sites now point at `digismith:finishing-a-development-branch`; W.3's call-site cutover had
  missed them.
```

- [ ] **Step 9: Backlog bookkeeping**

Delete `backlog/standard-handoff-format.md`: `digismith:handoff` now gives every session one handoff format (the repo's README rule is to delete an applied item).

In `backlog/README.md`, delete the line that starts `- [Standardized session handoff document format](standard-handoff-format.md)`.

Append to the end of `backlog/handoff-pointer-missed-on-fresh-session-w12.md`:

```markdown

## 2026-09-26: resume fallback (DGS-85)

The per-session pointer this item describes is gone. `session-init.ts` now points to per-lineage
notes (`.digismith/docs/<Clan>/<Lineage>/handoff.md`), and `digismith:handoff`'s resume mode
("resume") runs the same lookup by hand when the hook line never arrives. The root cause of the
missing hook output is still unknown.
```

Run: `grep -rn "standard-handoff-format" backlog skills`
Expected: no output. `MEMORY.md` and older design/plan docs still mention it as history; leave them alone.

- [ ] **Step 10: Final checks**

Run: `grep -rn "digismith/sessions" skills scripts`
Expected: no output.

Run: `pnpm test`
Expected: PASS, 56 files, same count as after Task 2.

- [ ] **Step 11: Commit the bookkeeping**

```bash
git add vendored/PROVENANCE.md backlog/README.md backlog/handoff-pointer-missed-on-fresh-session-w12.md
git rm -q backlog/standard-handoff-format.md
git commit -m "docs(handoff): record divergences and retire handoff-format backlog item"
```
