# DGS-498 Git Drift Alarm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find tracked files that drift (CRLF-only or mode-only changes) in every git checkout under `~/Workspace`, alarm at session start, and show it in workbox-health.

**Architecture:** One Node script, `scripts/workbox-health/drift-check.ts`, built from small pure functions (`countDrift`, `findCheckouts`, `formatLine`, `appendCsv`, `run`). A SessionStart hook calls it with `--alarm`. `workbox-health.sh` calls the installed wrapper. Spec: `spec.md` in this folder.

**Tech Stack:** Node (`--experimental-strip-types`), git 2.50, Vitest, bash.

## Global Constraints

- Node built-ins and git only. Run with `node --experimental-strip-types`.
- Every git call: `GIT_OPTIONAL_LOCKS=0`, `-c core.autocrlf=false`, `--no-renames`, `--ignore-submodules=all`; 20 s timeout per call.
- eol drift = names from `diff --name-only -z` (fileMode=false) minus paths in `diff --ignore-cr-at-eol --numstat -z`.
- mode drift = `diff --raw -z` (fileMode=true), status `M`, old mode differs from new mode, path not in the eol/content set.
- Read-only. The only file written is the CSV. No restore, stage or config change.
- Default root `~/Workspace`; depth 6; never enter `.git`, `node_modules`, `.debris`.
- Alarm line exactly: `DigiSmith: drift alarm: <repo> <n> eol, <m> mode (DGS-498)`. `--alarm` always exits 0, never writes the CSV, swallows failures.
- CSV: `$DIGISMITH_DEPOT_DIR` or `~/.digismith-depot/observability/drift.csv`, header `time_utc7,repo,eol,mode,note`.
- Exit codes: 0 clean, 1 on drift, broken link or failed check.
- Commits: title-only conventional commits, no AI attribution. pnpm only.

---

### Task 1: Count drift in one checkout

**Files:**
- Create: `scripts/workbox-health/drift-check.ts`
- Test: `scripts/workbox-health/drift-check.test.ts`

**Interfaces:**
- Produces: `type Result = { repo: string; eol: number; mode: number; broken: string | null; error: string | null }`; `countDrift(repo: string): { eol: number; mode: number }` (throws on git failure or timeout).

- [ ] **Step 1: Write the failing tests**

```ts
// scripts/workbox-health/drift-check.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { countDrift } from "./drift-check.ts";

let tmp: string;
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" });
const put = (cwd: string, f: string, t: string | Buffer) => { fs.mkdirSync(path.dirname(path.join(cwd, f)), { recursive: true }); fs.writeFileSync(path.join(cwd, f), t); };

// a repo configured like the Workbox (DGS-478): autocrlf=input, fileMode=false
function mkRepo(name = "repo"): string {
  const r = path.join(tmp, name);
  fs.mkdirSync(r, { recursive: true });
  git(r, "init", "-q");
  git(r, "config", "user.email", "t@t"); git(r, "config", "user.name", "t");
  git(r, "config", "core.autocrlf", "input"); git(r, "config", "core.fileMode", "false");
  put(r, "crlf.txt", "a\nb\n"); put(r, "real.txt", "x\n"); put(r, "both.txt", "x\ny\n"); put(r, "mode.sh", "echo\n");
  put(r, "bin.dat", Buffer.from([0, 1, 2, 3]));
  git(r, "add", "."); git(r, "commit", "-qm", "init");
  return r;
}
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dgs498-")); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("countDrift", () => {
  it("clean repo: 0 and 0", () => { expect(countDrift(mkRepo())).toEqual({ eol: 0, mode: 0 }); });
  it("CRLF only counts as eol", () => {
    const r = mkRepo(); put(r, "crlf.txt", "a\r\nb\r\n");
    expect(countDrift(r)).toEqual({ eol: 1, mode: 0 });
  });
  it("a real change is not drift", () => {
    const r = mkRepo(); put(r, "real.txt", "changed\n");
    expect(countDrift(r)).toEqual({ eol: 0, mode: 0 });
  });
  it("CRLF plus a real edit is not drift", () => {
    const r = mkRepo(); put(r, "both.txt", "x\r\nz\r\n");
    expect(countDrift(r)).toEqual({ eol: 0, mode: 0 });
  });
  it("mode only counts as mode, although fileMode=false in the repo", () => {
    const r = mkRepo(); fs.chmodSync(path.join(r, "mode.sh"), 0o755);
    expect(countDrift(r)).toEqual({ eol: 0, mode: 1 });
  });
  it("mixed: 1 eol, 1 mode, real changes ignored", () => {
    const r = mkRepo(); put(r, "crlf.txt", "a\r\nb\r\n"); put(r, "real.txt", "c\n"); fs.chmodSync(path.join(r, "mode.sh"), 0o755);
    expect(countDrift(r)).toEqual({ eol: 1, mode: 1 });
  });
  it("a changed binary file and a deleted file are real changes", () => {
    const r = mkRepo(); put(r, "bin.dat", Buffer.from([9, 9, 9])); fs.rmSync(path.join(r, "real.txt"));
    expect(countDrift(r)).toEqual({ eol: 0, mode: 0 });
  });
  it("a file with content change and mode change is not counted as mode", () => {
    const r = mkRepo(); put(r, "mode.sh", "echo 2\n"); fs.chmodSync(path.join(r, "mode.sh"), 0o755);
    expect(countDrift(r)).toEqual({ eol: 0, mode: 0 });
  });
  it("is read-only: HEAD, index and config are unchanged", () => {
    const r = mkRepo(); put(r, "crlf.txt", "a\r\nb\r\n");
    const snap = () => [git(r, "rev-parse", "HEAD"), fs.readFileSync(path.join(r, ".git/index")).toString("hex"), fs.readFileSync(path.join(r, ".git/config"), "utf8")];
    const before = snap(); countDrift(r);
    expect(snap()).toEqual(before);
  });
  it("throws on a folder that is not a repo", () => {
    const d = path.join(tmp, "plain"); fs.mkdirSync(d);
    expect(() => countDrift(d)).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run scripts/workbox-health/drift-check.test.ts`
Expected: FAIL (cannot resolve `./drift-check.ts`).

- [ ] **Step 3: Write the minimal implementation**

```ts
// scripts/workbox-health/drift-check.ts
// Read-only check for DGS-498: tracked files that changed only in line endings (CRLF) or mode.
// The Workbox repos set core.autocrlf=input and core.fileMode=false (DGS-478), so git status hides this; we override both.

import { execFileSync } from "node:child_process";

export type Result = { repo: string; eol: number; mode: number; broken: string | null; error: string | null };

const TIMEOUT_MS = 20_000;

function git(repo: string, fileMode: boolean, args: string[]): string {
  return execFileSync("git", ["-C", repo, "-c", "core.autocrlf=false", "-c", `core.fileMode=${fileMode}`, ...args], {
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  });
}

const COMMON = ["diff", "--no-renames", "--ignore-submodules=all"];

export function countDrift(repo: string): { eol: number; mode: number } {
  // A: every file whose bytes differ (a CR counts). B: files with a real change (numstat drops CR-only files; --name-only would not).
  const a = new Set(git(repo, false, [...COMMON, "--name-only", "-z"]).split("\0").filter(Boolean));
  const b = new Set<string>();
  for (const rec of git(repo, false, [...COMMON, "--ignore-cr-at-eol", "--numstat", "-z"]).split("\0").filter(Boolean)) {
    b.add(rec.split("\t").slice(2).join("\t"));
  }
  let eol = 0;
  for (const f of a) if (!b.has(f)) eol++;

  // mode: --raw gives exact mode columns; a file already in A is a content change, not a mode-only change.
  let mode = 0;
  const tokens = git(repo, true, [...COMMON, "--raw", "-z"]).split("\0").filter(Boolean);
  for (let i = 0; i < tokens.length; i += 2) {
    const [oldMode, newMode, , , status] = tokens[i].slice(1).split(" ");
    if (status === "M" && oldMode !== newMode && !a.has(tokens[i + 1])) mode++;
  }
  return { eol, mode };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run scripts/workbox-health/drift-check.test.ts`
Expected: PASS (10 tests). If the `--raw` token split fails on a git version, print `tokens` and fix the offsets; do not switch to `--summary`.

- [ ] **Step 5: Commit**

```bash
git add scripts/workbox-health/drift-check.ts scripts/workbox-health/drift-check.test.ts
git commit -m "feat(workbox-health): count eol and mode drift in one checkout"
```

---

### Task 2: Discovery, output, CSV and the CLI

**Files:**
- Modify: `scripts/workbox-health/drift-check.ts`
- Modify: `scripts/workbox-health/drift-check.test.ts`

**Interfaces:**
- Consumes: `countDrift`, `Result` from Task 1.
- Produces: `findCheckouts(root: string): string[]` (absolute paths, sorted); `checkRepo(repo: string): Result`; `formatLine(r: Result, root: string): string | null` (null when clean); `appendCsv(results: Result[], root: string, env?: NodeJS.ProcessEnv, now?: Date): void`; `run(argv: string[], env?: NodeJS.ProcessEnv, out?: (s: string) => void): number` (exit code). Alarm handling lands in Task 3.

- [ ] **Step 1: Write the failing tests** (append to the test file; add `findCheckouts, checkRepo, formatLine, run` to the import)

```ts
import { findCheckouts, checkRepo, formatLine, run } from "./drift-check.ts";

describe("findCheckouts", () => {
  it("finds repos and linked worktrees, skips node_modules and .debris", () => {
    const r = mkRepo("proj");
    git(r, "worktree", "add", "-q", path.join(r, ".worktrees", "wt"), "-b", "wt");
    mkRepo("node_modules/dep"); mkRepo(".debris/old");
    const got = findCheckouts(tmp).map((p) => path.relative(tmp, p));
    expect(got).toEqual(["proj", path.join("proj", ".worktrees", "wt")]);
  });
  it("a .git file with a missing gitdir is a broken link, with no crash", () => {
    const d = path.join(tmp, "dead"); fs.mkdirSync(d); fs.writeFileSync(path.join(d, ".git"), "gitdir: ../nowhere\n");
    expect(checkRepo(d)).toMatchObject({ eol: 0, mode: 0, broken: "../nowhere" });
  });
});

describe("formatLine", () => {
  const base = { repo: "", broken: null, error: null };
  it("prints nothing for a clean repo", () => { expect(formatLine({ ...base, repo: "/r/a", eol: 0, mode: 0 }, "/r")).toBeNull(); });
  it("uses a path relative to the root", () => { expect(formatLine({ ...base, repo: "/r/a/b", eol: 3, mode: 1 }, "/r")).toBe("a/b: 3 eol, 1 mode"); });
  it("keeps a path outside the root absolute", () => { expect(formatLine({ ...base, repo: "/x/a", eol: 1, mode: 0 }, "/r")).toBe("/x/a: 1 eol, 0 mode"); });
  it("names a broken link and a failed check", () => {
    expect(formatLine({ ...base, repo: "/r/a", eol: 0, mode: 0, broken: "../nowhere" }, "/r")).toBe("a: broken git link (../nowhere)");
    expect(formatLine({ ...base, repo: "/r/a", eol: 0, mode: 0, error: "timeout" }, "/r")).toBe("a: check failed (timeout)");
  });
});

describe("run", () => {
  const go = (argv: string[], env: NodeJS.ProcessEnv = { DIGISMITH_DEPOT_DIR: path.join(tmp, "depot") }) => {
    const lines: string[] = []; const code = run(argv, env, (s) => lines.push(s)); return { code, lines };
  };
  it("exit 0 and no output when clean; one CSV line per repo", () => {
    mkRepo("a"); mkRepo("b");
    const { code, lines } = go(["--root", tmp]);
    expect(code).toBe(0); expect(lines).toEqual([]);
    const csv = fs.readFileSync(path.join(tmp, "depot/observability/drift.csv"), "utf8").trim().split("\n");
    expect(csv[0]).toBe("time_utc7,repo,eol,mode,note");
    expect(csv).toHaveLength(3);
    expect(csv[1]).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d,a,0,0,$/);
  });
  it("exit 1 and a line for a drifting repo", () => {
    const r = mkRepo("a"); put(r, "crlf.txt", "a\r\nb\r\n");
    const { code, lines } = go(["--root", tmp]);
    expect(code).toBe(1); expect(lines).toEqual(["a: 1 eol, 0 mode"]);
  });
  it("--no-log writes no CSV", () => {
    mkRepo("a"); go(["--root", tmp, "--no-log"]);
    expect(fs.existsSync(path.join(tmp, "depot/observability/drift.csv"))).toBe(false);
  });
  it("--json lists every checkout, clean ones too", () => {
    mkRepo("a"); const r = mkRepo("b"); put(r, "crlf.txt", "a\r\nb\r\n");
    const { lines } = go(["--root", tmp, "--json", "--no-log"]);
    expect(JSON.parse(lines.join("\n"))).toEqual([
      { repo: path.join(tmp, "a"), eol: 0, mode: 0, broken: null, error: null },
      { repo: path.join(tmp, "b"), eol: 1, mode: 0, broken: null, error: null },
    ]);
  });
  it("--repo checks one checkout, found from a subfolder", () => {
    const r = mkRepo("a"); put(r, "crlf.txt", "a\r\nb\r\n"); mkRepo("b");
    const { code, lines } = go(["--repo", path.join(r, ".git/.."), "--no-log"]);
    expect(code).toBe(1); expect(lines).toHaveLength(1);
  });
  it("a failed check is reported, not clean, with a CSV note", () => {
    const d = path.join(tmp, "bad"); fs.mkdirSync(path.join(d, ".git"), { recursive: true });
    const { code, lines } = go(["--root", tmp]);
    expect(code).toBe(1); expect(lines[0]).toMatch(/^bad: check failed \(/);
    expect(fs.readFileSync(path.join(tmp, "depot/observability/drift.csv"), "utf8")).toContain(",bad,,,check-failed");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run scripts/workbox-health/drift-check.test.ts`
Expected: FAIL (`findCheckouts` etc. not exported).

- [ ] **Step 3: Write the implementation** (add to `drift-check.ts`; extend the imports with `fs`, `os`, `path`, `pathToFileURL`)

```ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const SKIP = new Set([".git", "node_modules", ".debris"]);
const MAX_DEPTH = 6;

export function findCheckouts(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string, depth: number) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    if (entries.some((e) => e.name === ".git")) found.push(dir);
    if (depth >= MAX_DEPTH) return;
    for (const e of entries) if (e.isDirectory() && !SKIP.has(e.name)) walk(path.join(dir, e.name), depth + 1);
  };
  walk(root, 0);
  return found.sort();
}

export function checkRepo(repo: string): Result {
  const res: Result = { repo, eol: 0, mode: 0, broken: null, error: null };
  const dotgit = path.join(repo, ".git");
  try {
    if (fs.statSync(dotgit).isFile()) {
      const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(dotgit, "utf8"));
      const gitdir = m ? m[1].trim() : "";
      if (!gitdir || !fs.existsSync(path.resolve(repo, gitdir))) { res.broken = gitdir || "(empty)"; return res; }
    }
    Object.assign(res, countDrift(repo));
  } catch (e) {
    res.error = (e as NodeJS.ErrnoException).code === "ETIMEDOUT" ? "timeout" : String((e as Error).message).split("\n")[0].slice(0, 120);
  }
  return res;
}

const rel = (repo: string, root: string) => (repo.startsWith(root + path.sep) ? path.relative(root, repo) : repo);

export function formatLine(r: Result, root: string): string | null {
  const name = rel(r.repo, root);
  if (r.broken) return `${name}: broken git link (${r.broken})`;
  if (r.error) return `${name}: check failed (${r.error})`;
  if (r.eol + r.mode === 0) return null;
  return `${name}: ${r.eol} eol, ${r.mode} mode`;
}

const depotDir = (env: NodeJS.ProcessEnv) => env.DIGISMITH_DEPOT_DIR || path.join(os.homedir(), ".digismith-depot");

export function appendCsv(results: Result[], root: string, env: NodeJS.ProcessEnv = process.env, now = new Date()): void {
  const file = path.join(depotDir(env), "observability", "drift.csv");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, "time_utc7,repo,eol,mode,note\n");
  const t = new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 19).replace("T", " ");
  const lines = results.map((r) => {
    const note = r.broken ? "broken-link" : r.error ? "check-failed" : "";
    return [t, rel(r.repo, root), note ? "" : r.eol, note ? "" : r.mode, note].join(",");
  });
  fs.appendFileSync(file, lines.join("\n") + (lines.length ? "\n" : ""));
}

export function run(argv: string[], env: NodeJS.ProcessEnv = process.env, out: (s: string) => void = (s) => console.log(s)): number {
  const val = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const root = path.resolve(val("--root") ?? path.join(os.homedir(), "Workspace"));
  const repoArg = val("--repo");
  let repos: string[];
  if (repoArg) {
    try { repos = [git(path.resolve(repoArg), false, ["rev-parse", "--show-toplevel"]).trim()]; } catch { return 0; }
  } else repos = findCheckouts(root);
  const results = repos.map(checkRepo);
  if (argv.includes("--json")) out(JSON.stringify(results, null, 2));
  else for (const r of results) { const l = formatLine(r, root); if (l) out(l); }
  if (!argv.includes("--no-log")) appendCsv(results, root, env);
  return results.some((r) => r.broken || r.error || r.eol + r.mode > 0) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(run(process.argv.slice(2)));
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run scripts/workbox-health/drift-check.test.ts`
Expected: PASS (all tests of Tasks 1 and 2).

- [ ] **Step 5: Commit**

```bash
git add scripts/workbox-health/drift-check.ts scripts/workbox-health/drift-check.test.ts
git commit -m "feat(workbox-health): find checkouts, print drift lines, log a CSV"
```

---

### Task 3: The `--alarm` mode and the SessionStart hook

**Files:**
- Modify: `scripts/workbox-health/drift-check.ts` (the `run` function)
- Modify: `scripts/workbox-health/drift-check.test.ts`
- Modify: `hooks/hooks.json` (the `SessionStart` hooks list, after the run-events command)

**Interfaces:**
- Consumes: `run`, `checkRepo`, `Result` from Tasks 1-2.
- Produces: `run(["--alarm","--repo",<path>])` prints the alarm line or nothing and returns 0.

- [ ] **Step 1: Write the failing tests** (append)

```ts
describe("--alarm", () => {
  const alarm = (cwd: string) => {
    const lines: string[] = []; const code = run(["--alarm", "--repo", cwd], { DIGISMITH_DEPOT_DIR: path.join(tmp, "depot") }, (s) => lines.push(s)); return { code, lines };
  };
  it("is silent on a clean checkout and exits 0", () => { expect(alarm(mkRepo())).toEqual({ code: 0, lines: [] }); });
  it("prints exactly one line on drift, exits 0, writes no CSV", () => {
    const r = mkRepo(); put(r, "crlf.txt", "a\r\nb\r\n"); fs.chmodSync(path.join(r, "mode.sh"), 0o755);
    const { code, lines } = alarm(r);
    expect(code).toBe(0);
    expect(lines).toEqual([`DigiSmith: drift alarm: ${fs.realpathSync(r)} 1 eol, 1 mode (DGS-498)`]);
    expect(fs.existsSync(path.join(tmp, "depot/observability/drift.csv"))).toBe(false);
  });
  it("is silent outside a git checkout", () => {
    const d = path.join(tmp, "plain"); fs.mkdirSync(d);
    expect(alarm(d)).toEqual({ code: 0, lines: [] });
  });
  it("is silent on a broken link or a failed check, and still exits 0", () => {
    const d = path.join(tmp, "dead"); fs.mkdirSync(d); fs.writeFileSync(path.join(d, ".git"), "gitdir: ../nowhere\n");
    expect(alarm(d)).toEqual({ code: 0, lines: [] });
  });
});

describe("hooks.json", () => {
  it("has the alarm in SessionStart with --alarm --repo \"$PWD\"", () => {
    const hooks = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", "..", "hooks", "hooks.json"), "utf8")).hooks;
    const cmds: string[] = hooks.SessionStart.flatMap((g: { hooks: { command: string }[] }) => g.hooks.map((h) => h.command));
    expect(cmds.filter((c) => c.includes("workbox-health/drift-check.ts"))).toEqual([
      'node --experimental-strip-types "${CLAUDE_PLUGIN_ROOT}/scripts/workbox-health/drift-check.ts" --alarm --repo "$PWD"',
    ]);
  });
});
```

The alarm prints the repo as the path git reports (`rev-parse --show-toplevel`, already resolved). Keep the test's `realpathSync` so a symlinked temp dir (`/var` to `/private/var` on macOS) passes.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run scripts/workbox-health/drift-check.test.ts`
Expected: FAIL (alarm prints the normal lines or writes the CSV; hook entry missing).

- [ ] **Step 3: Implement**

At the top of `run`, before the other logic:

```ts
  if (argv.includes("--alarm")) {
    try {
      const repoArg = argv[argv.indexOf("--repo") + 1];
      const top = git(path.resolve(repoArg), false, ["rev-parse", "--show-toplevel"]).trim();
      const r = checkRepo(top);
      if (!r.broken && !r.error && r.eol + r.mode > 0) out(`DigiSmith: drift alarm: ${top} ${r.eol} eol, ${r.mode} mode (DGS-498)`);
    } catch { /* a hook must not break a session */ }
    return 0;
  }
```

In `hooks/hooks.json`, add this object at the end of the `SessionStart[0].hooks` array (after the run-events command; keep the JSON valid):

```json
          ,{
            "type": "command",
            "command": "node --experimental-strip-types \"${CLAUDE_PLUGIN_ROOT}/scripts/workbox-health/drift-check.ts\" --alarm --repo \"$PWD\""
          }
```

(Write it with normal JSON commas and 10-space indentation like its siblings.)

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run scripts/workbox-health/drift-check.test.ts scripts/run-events/hooks-json.test.ts`
Expected: PASS. The run-events test still passes (it filters by `run-events/hook-cli.ts`).

- [ ] **Step 5: Commit**

```bash
git add scripts/workbox-health/drift-check.ts scripts/workbox-health/drift-check.test.ts hooks/hooks.json
git commit -m "feat(workbox-health): drift alarm at session start"
```

---

### Task 4: workbox-health section and the installed wrapper

**Files:**
- Modify: `scripts/workbox-health/install.sh`
- Modify: `scripts/workbox-health/workbox-health.sh` (before the final `echo "$now,...` CSV line)
- Create: `scripts/workbox-health/install.test.ts`

**Interfaces:**
- Consumes: `drift-check.ts` CLI from Tasks 1-3.
- Produces: `$HOME/.digismith-depot/bin/drift-check` (bash wrapper) and `$HOME/.digismith-depot/bin/drift-check.ts` (copy).

- [ ] **Step 1: Write the failing test**

```ts
// scripts/workbox-health/install.test.ts
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

describe("install.sh", () => {
  it("installs a drift-check wrapper that runs the copied .ts", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "dgs498-home-"));
    const ws = path.join(home, "ws"); fs.mkdirSync(ws);
    const inst = spawnSync("bash", [path.join(import.meta.dirname, "install.sh")], { env: { ...process.env, HOME: home }, encoding: "utf8" });
    expect(inst.status).toBe(0);
    const bin = path.join(home, ".digismith-depot/bin");
    expect(fs.existsSync(path.join(bin, "drift-check.ts"))).toBe(true);
    const r = spawnSync(path.join(bin, "drift-check"), ["--root", ws, "--no-log"], { env: { ...process.env, HOME: home }, encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    fs.rmSync(home, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run scripts/workbox-health/install.test.ts`
Expected: FAIL (no `drift-check.ts` installed).

- [ ] **Step 3: Implement**

`install.sh` (add after the existing `install` line, before the first `echo`; keep both echos):

```bash
install -m 644 "$(dirname "$0")/drift-check.ts" "$HOME/.digismith-depot/bin/drift-check.ts"
cat > "$HOME/.digismith-depot/bin/drift-check" <<'WRAP'
#!/bin/bash
# DGS-498: runs the drift-check.ts copy that sits next to this file (the .ts needs the Node flag).
exec node --experimental-strip-types "$(dirname "$0")/drift-check.ts" "$@"
WRAP
chmod 755 "$HOME/.digismith-depot/bin/drift-check"
echo "installed: $HOME/.digismith-depot/bin/drift-check"
```

`workbox-health.sh`, insert before the line `echo "$now,$cpu_c,...`:

```bash
echo "  git drift (line endings, file modes):"
DRIFT="$HOME/.digismith-depot/bin/drift-check"
if [ -x "$DRIFT" ]; then
  drift_out=$("$DRIFT" 2>&1) && echo "    clean" || printf '%s\n' "$drift_out" | sed 's/^/    /'
else
  echo "    drift-check is not installed (run scripts/workbox-health/install.sh)"
fi
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run scripts/workbox-health/install.test.ts && bash -n scripts/workbox-health/workbox-health.sh`
Expected: PASS, and no syntax error.

- [ ] **Step 5: Commit**

```bash
git add scripts/workbox-health/install.sh scripts/workbox-health/workbox-health.sh scripts/workbox-health/install.test.ts
git commit -m "feat(workbox-health): git drift section and the drift-check wrapper"
```

---

### Task 5: Live run on the Workbox

**Files:** none changed (fixes, if any, go back into Tasks 1-4 files).

- [ ] **Step 1: Install and run**

Run: `bash scripts/workbox-health/install.sh && time ~/.digismith-depot/bin/drift-check --no-log`
Expected: finishes in a few seconds over all `~/Workspace` checkouts; prints only repos with drift or failures. Any line that is a real MEGA drift is reported to the conductor, not fixed (read-only rule).

- [ ] **Step 2: Time the alarm**

Run: `cd ~/Workspace/Jazurite/DigiSmith && time node --experimental-strip-types scripts/workbox-health/drift-check.ts --alarm --repo "$PWD"`
Expected: under 1 s, exit 0, no output on a clean main checkout (the four modified `tokens.json` files are real changes).

- [ ] **Step 3: Prove the alarm fires, on a temp copy only**

Run: `T=$(mktemp -d) && git clone -q . "$T/r" && printf 'x\r\n' >> "$T/r/package.json" && sed -i '' 's/$/\r/' "$T/r/package.json" && node --experimental-strip-types scripts/workbox-health/drift-check.ts --alarm --repo "$T/r"`
Expected: one `DigiSmith: drift alarm: ... (DGS-498)` line. (The temp dir is left for Jack; no delete.)

- [ ] **Step 4: Full test run**

Run: `pnpm test`
Expected: PASS.

### Task 6: Whole-branch review and merge

- [ ] **Step 1:** Whole-branch review by the Reviewer (per the order). Fix verified findings.
- [ ] **Step 2:** Merge steps per the merge order (post-finish hooks 01-03, `report.html`, `plan.md` committed with it).

---

## Self-review

- Spec coverage: counting (T1), discovery, output, flags, CSV, broken link, failed check (T2), alarm and hook (T3), workbox-health and install (T4), live timing (T5), out-of-scope items untouched. Tests list in the spec: all covered in T1-T4 (timeout is covered by the failed-check test; it shares the `error` path).
- Names are the same in every task: `countDrift`, `findCheckouts`, `checkRepo`, `formatLine`, `appendCsv`, `run`, `Result`.

## Definition of Ready

Checked 2026-10-26 (UTC+7) against ClickUp (`dg clickup get-task DGS-498`) and `origin/main`.

| Item | State |
|---|---|
| Spec | Done and approved by Jack (`spec.md`). |
| Plan | Done (this file): 4 build tasks, a live run, whole-branch review. |
| Milestone | **Gap.** The ticket has none set that I can read. Proposal: after Dawn (V1.1, DGS-470). Reason: it is a Workbox safety net, not needed for V1. The conductor sets it. |
| Blockers | None. Nothing blocks DGS-498. It blocks DGS-557 (drift sweep) and one more ticket (dependency links on the ticket); DGS-557 stays in `refinement` until this one is built. |
| Mode | Proposed **Autonomous**. Reason: the spec fixes every behaviour, the work is test-first with temp repos, and the check is read-only. The one shared file it changes is `hooks/hooks.json`; the alarm swallows all failures and exits 0, and a test pins the entry. Nothing needs Jack during the build. |
| Sign-off | Proposed **Auto**. Reason: a fully defined contract (internal tool, tests, exact alarm line). The alarm wording is user-facing but is set in the approved spec. |
| Risks for the Builder | (1) The `--raw -z` token offsets: if a git version differs, fix the parser, never use `--summary`. (2) Alarm output reaches every session start, so a false positive is noisy: the eol and mode counts must stay exact. (3) Live run on `~/Workspace` reads Emma and Soveron checkouts: read-only, report drift, never fix it. |
| Skipped | The plan checklist sync (`dg clickup checklist sync`): docs only, nothing is built yet. |

Ticket stays `refinement` until Jack approves.
