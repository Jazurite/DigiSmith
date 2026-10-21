# DGS-585 Merge and Cleanup Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add salvage before teardown, a night merge gate, strict guardrail config, an already-done check before the claim, and a drift section in the morning report.

**Architecture:** Small pure modules in `packages/cli/src/autonomous/` and `packages/cli/src/salvage/`. Git goes through one injected function `Git` so tests run against temporary repos or fakes. `runScan` gets one optional port `ScanGuard`; production wiring always passes it, so the real scan fails closed.

**Tech Stack:** TypeScript under `node --experimental-strip-types`, yargs, vitest, real `git` in temp repos for tests. pnpm only.

Spec: `design.md` in this folder (checkpoint 1 approved, with four changes folded in).

## Global Constraints

- Code in `packages/cli/src/` runs under `node --experimental-strip-types`: no parameter properties, no enums, no namespaces. The smoke test `packages/cli/src/strip-types.smoke.test.ts` strips every file.
- Nexus jobs run the built CLI `dist/index.js`. A file under `packages/cli/src` does not import from `scripts/` (only tests may).
- Fakes only in tests: temp git repos, a fake tracker, a temp depot dir. No real ClickUp, herdr, depot or live API. Never touch port 4300.
- Salvage never deletes (file, branch or worktree). Cleanup never uses `git branch -D`.
- Salvage never reads a file's content to check for secrets; it matches names and sizes only.
- Commits are title-only, conventional, no AI attribution.
- Protected default paths (verbatim from the spec): `hooks/`, `hooks/hooks.json`, `.digismith/config.yml`, `skills/finishing-*/`, `skills/reviewer/`, `packages/cli/src/reviewer/`, `packages/cli/src/autonomous/`, `scripts/nexus-api/src/scheduler/`, `.digismith/mandate.yml`, `.digismith/profiles/`.
- Secret patterns (verbatim): `.env*`, `*.pem`, `*.key`, `*secret*`, `*token*`, and any file over 5 MB.
- Already-done rules: a main commit counts only when its subject scope names the key (`(dgs-123)` or `(DGS-123)`), or the `<KEY>__*` branch is an ancestor of origin/main.
- Test command from the worktree root: `pnpm --filter @digismith/cli exec vitest run <file>`; typecheck: `pnpm --filter @digismith/cli exec tsc -p tsconfig.json --noEmit` (older type errors in `tracker-clickup.ts` and some older tests exist; add none).

## File Structure

| File | Responsibility |
|---|---|
| `packages/cli/src/autonomous/gitx.ts` (new) | `Git` type and `realGit` |
| `packages/cli/src/autonomous/protected-paths.ts` (new) | default list, pattern match |
| `packages/cli/src/autonomous/guardrails.ts` (new) | strict reader of the `nightwatch:` block, `readMainConfig` |
| `packages/cli/src/salvage/secrets.ts` (new) | secret and size check on untracked files |
| `packages/cli/src/salvage/salvage.ts` (new) | the five salvage steps |
| `packages/cli/src/salvage/index.ts` (new) | `dg salvage` command |
| `packages/cli/src/autonomous/merge-gate.ts` (new) | gate logic |
| `packages/cli/src/autonomous/already-done.ts` (new) | merged-work and blocker checks |
| `packages/cli/src/autonomous/scan-guard.ts` (new) | `ScanGuard` port and the real one |
| `packages/cli/src/autonomous/drift.ts` (new) | drift lines |
| `skills/finishing-a-development-branch/scripts/post-merge-cleanup.ts` | calls salvage first |
| `packages/cli/src/autonomous/{act,scan,report,index}.ts`, `src/index.ts` | wiring |

---

### Task 1: Git port, protected paths, guardrail reader

**Files:**
- Create: `packages/cli/src/autonomous/gitx.ts`, `protected-paths.ts`, `guardrails.ts`
- Test: `packages/cli/src/autonomous/protected-paths.test.ts`, `guardrails.test.ts`

**Interfaces:**
- Produces:
  - `type Git = (cwd: string, args: string[]) => string` (throws on a non-zero exit); `realGit: Git`
  - `DEFAULT_PROTECTED: readonly string[]`; `touchedProtected(paths: string[], patterns: readonly string[]): string[]`
  - `interface Guardrails { protectedPaths: string[] | null; budgets: Partial<Record<"building" | "review" | "merge", number>>; problems: string[] }`
  - `readGuardrails(text: string): Guardrails` (`protectedPaths` null = key absent, defaults apply)
  - `type MainConfig = { ok: true; guardrails: Guardrails } | { ok: false; error: string }`; `readMainConfig(git: Git, repo: string): MainConfig` reads `git show main:.digismith/config.yml`.

- [ ] **Step 1: Write the failing tests**

`protected-paths.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_PROTECTED, touchedProtected } from "./protected-paths.ts";

describe("touchedProtected", () => {
  it("matches a folder pattern at any depth below it", () => {
    expect(touchedProtected(["hooks/x/y.sh", "docs/a.md"], ["hooks/"])).toEqual(["hooks/x/y.sh"]);
  });
  it("matches an exact file and nothing longer", () => {
    expect(touchedProtected([".digismith/config.yml", ".digismith/config.yml.bak"], [".digismith/config.yml"])).toEqual([".digismith/config.yml"]);
  });
  it("lets * stand for one path segment part", () => {
    expect(touchedProtected(["skills/finishing-a-development-branch/SKILL.md", "skills/finishing/x"], ["skills/finishing-*/"]))
      .toEqual(["skills/finishing-a-development-branch/SKILL.md"]);
  });
  it("does not match a folder name that only starts the same", () => {
    expect(touchedProtected(["hooks-extra/a"], ["hooks/"])).toEqual([]);
  });
  it("covers every default named in the spec", () => {
    const probe = ["hooks/hooks.json", ".digismith/config.yml", "skills/finishing-x/a", "skills/reviewer/a", "packages/cli/src/reviewer/a.ts",
      "packages/cli/src/autonomous/scan.ts", "scripts/nexus-api/src/scheduler/registry.ts", ".digismith/mandate.yml", ".digismith/profiles/a.yml"];
    expect(touchedProtected(probe, DEFAULT_PROTECTED)).toEqual(probe);
  });
});
```

`guardrails.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseConfig } from "../../../../scripts/config-parse.ts";
import { readGuardrails, readMainConfig } from "./guardrails.ts";
import type { Git } from "./gitx.ts";

const ok = `profile: digismith
nightwatch:
  protected_paths:
    - hooks/
    - "skills/finishing-*/"
  budgets:
    building: 45
    review: 60
`;

describe("readGuardrails", () => {
  it("reads paths and budgets", () => {
    const g = readGuardrails(ok);
    expect(g.problems).toEqual([]);
    expect(g.protectedPaths).toEqual(["hooks/", "skills/finishing-*/"]);
    expect(g.budgets).toEqual({ building: 45, review: 60 });
  });
  it("no nightwatch block: no problems, defaults apply", () => {
    expect(readGuardrails("profile: x\n")).toEqual({ protectedPaths: null, budgets: {}, problems: [] });
  });
  it.each([
    ["inline value for protected_paths", "nightwatch:\n  protected_paths: hooks/\n"],
    ["flow list", "nightwatch:\n  protected_paths: [hooks/]\n"],
    ["empty list", "nightwatch:\n  protected_paths:\n"],
    ["tab indent", "nightwatch:\n\tbudgets:\n"],
    ["budget not a number", "nightwatch:\n  budgets:\n    building: soon\n"],
    ["budget zero", "nightwatch:\n  budgets:\n    merge: 0\n"],
    ["unknown budget key", "nightwatch:\n  budgets:\n    deploy: 5\n"],
    ["duplicate budget key", "nightwatch:\n  budgets:\n    merge: 5\n    merge: 6\n"],
    ["unknown nightwatch key (a typo must not drop the guardrail)", "nightwatch:\n  protected_path:\n    - hooks/\n"],
  ])("reports a problem: %s", (_name, text) => {
    expect(readGuardrails(text).problems.length).toBeGreaterThan(0);
  });
  it("ignores an error outside the nightwatch block", () => {
    expect(readGuardrails("profile: x\nbroken line without colon\nnightwatch:\n  budgets:\n    merge: 5\n").problems).toEqual([]);
  });
  it("agrees with scripts/config-parse.ts on syntax inside the block", () => {
    for (const text of ["nightwatch:\n  budgets: {a: 1}\n", "nightwatch:\n\tx: 1\n", "nightwatch:\n  budgets:\n    merge 5\n"]) {
      expect(() => parseConfig(text)).toThrow();
      expect(readGuardrails(text).problems.length).toBeGreaterThan(0);
    }
    for (const text of [ok, "nightwatch:\n  budgets:\n    merge: 5 # note\n"]) {
      expect(() => parseConfig(text)).not.toThrow();
      expect(readGuardrails(text).problems).toEqual([]);
    }
  });
});

describe("readMainConfig", () => {
  it("reads main, never the working tree", () => {
    const calls: string[][] = [];
    const git: Git = (_cwd, args) => { calls.push(args); return ok; };
    const r = readMainConfig(git, "/repo");
    expect(calls).toEqual([["show", "main:.digismith/config.yml"]]);
    expect(r.ok && r.guardrails.protectedPaths).toEqual(["hooks/", "skills/finishing-*/"]);
  });
  it("fails closed when main has no config", () => {
    const git: Git = () => { throw new Error("fatal: path does not exist"); };
    const r = readMainConfig(git, "/repo");
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests, expect FAIL** (modules not found)

Run: `pnpm --filter @digismith/cli exec vitest run src/autonomous/protected-paths.test.ts src/autonomous/guardrails.test.ts`

- [ ] **Step 3: Implement**

`gitx.ts`:

```ts
import { execFileSync } from "node:child_process";

/** Runs git in cwd and returns stdout. Throws on a non-zero exit. */
export type Git = (cwd: string, args: string[]) => string;

export const realGit: Git = (cwd, args) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
```

`protected-paths.ts`:

```ts
export const DEFAULT_PROTECTED: readonly string[] = [
  "hooks/", "hooks/hooks.json", ".digismith/config.yml", "skills/finishing-*/", "skills/reviewer/",
  "packages/cli/src/reviewer/", "packages/cli/src/autonomous/", "scripts/nexus-api/src/scheduler/",
  ".digismith/mandate.yml", ".digismith/profiles/",
];

const escape = (s: string): string => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

function toRegExp(pattern: string): RegExp {
  const folder = pattern.endsWith("/");
  const body = folder ? pattern.slice(0, -1) : pattern;
  const source = body.split("*").map(escape).join("[^/]*");
  return new RegExp(`^${source}${folder ? "(/.*)?" : ""}$`);
}

/** The paths that match at least one pattern, in input order. */
export function touchedProtected(paths: string[], patterns: readonly string[]): string[] {
  const res = patterns.map(toRegExp);
  return paths.filter((p) => res.some((re) => re.test(p)));
}
```

`guardrails.ts`:

```ts
import type { Git } from "./gitx.ts";

const PHASES = ["building", "review", "merge"] as const;
type Phase = (typeof PHASES)[number];
export interface Guardrails { protectedPaths: string[] | null; budgets: Partial<Record<Phase, number>>; problems: string[] }
export type MainConfig = { ok: true; guardrails: Guardrails } | { ok: false; error: string };

const SIGNIFICANT = /^\s*[^#\s]/;
const indentOf = (l: string): number => l.length - l.trimStart().length;
const stripComment = (v: string): string => v.replace(/\s+#.*$/, "").trim();
const unquote = (v: string): string => (/^(["']).*\1$/.test(v) ? v.slice(1, -1) : v);

/** Reads only the nightwatch: block. Every problem inside it is a guardrail problem; nothing outside it is read. */
export function readGuardrails(text: string): Guardrails {
  const out: Guardrails = { protectedPaths: null, budgets: {}, problems: [] };
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const start = lines.findIndex((l) => /^nightwatch:\s*(#.*)?$/.test(l));
  if (start < 0) return out;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (SIGNIFICANT.test(lines[i]) && indentOf(lines[i]) === 0) { end = i; break; }
  const body = lines.slice(start + 1, end);
  const bad = (m: string): void => { out.problems.push(`nightwatch: ${m}`); };
  if (body.some((l) => /^\s*\t/.test(l) || /^ *\t/.test(l))) { bad("tab in indentation; use spaces"); return out; }

  const sig = body.map((l, n) => ({ l, n })).filter((x) => SIGNIFICANT.test(x.l));
  if (sig.length === 0) { bad("'nightwatch:' has no indented lines under it"); return out; }
  const childIndent = indentOf(sig[0].l);
  const seen = new Set<string>();
  for (let k = 0; k < sig.length; k++) {
    const { l } = sig[k];
    if (indentOf(l) !== childIndent) continue;
    const m = /^\s+([a-z0-9_]+):(.*)$/.exec(l);
    if (!m) { bad(`line "${l.trim()}" is not "key: value"`); continue; }
    const key = m[1];
    const inline = stripComment(m[2]);
    const kids: string[] = [];
    for (let j = k + 1; j < sig.length && indentOf(sig[j].l) > childIndent; j++) kids.push(sig[j].l);
    if (seen.has(key)) bad(`${key} is set more than once`);
    seen.add(key);
    if (/^[[{]/.test(inline)) { bad(`${key}: flow syntax ([...] or {...}) is not supported`); continue; }
    if (key === "protected_paths") {
      if (inline !== "") { bad("protected_paths must be a list, one '- path' per line"); continue; }
      const items = kids.map((x) => /^\s+-\s+(.+)$/.exec(x)?.[1]);
      if (items.length === 0 || items.some((x) => x === undefined)) { bad("protected_paths must hold at least one '- path' line and nothing else (remove the key to use the defaults)"); continue; }
      out.protectedPaths = items.map((x) => unquote(stripComment(x as string)));
    } else if (key === "budgets") {
      if (inline !== "") { bad("budgets must be a block of 'phase: minutes' lines"); continue; }
      const bseen = new Set<string>();
      for (const kid of kids) {
        const b = /^\s+([A-Za-z_]+):\s*(.*)$/.exec(kid);
        if (!b) { bad(`budgets line "${kid.trim()}" is not "phase: minutes"`); continue; }
        const [, name, rawV] = b;
        const raw = stripComment(rawV);
        if (!(PHASES as readonly string[]).includes(name)) { bad(`budgets.${name} is not a phase (building, review, merge)`); continue; }
        if (bseen.has(name)) bad(`budgets.${name} is set more than once`);
        bseen.add(name);
        if (!/^[1-9]\d*$/.test(raw)) { bad(`budgets.${name}: "${raw}" is not a positive whole number of minutes`); continue; }
        out.budgets[name as Phase] = Number(raw);
      }
    } else {
      bad(`unknown guardrail key "${key}" (protected_paths, budgets)`);
    }
  }
  return out;
}

/** The policy is read from main, never from the branch or the working tree. Unreadable = not ok (fail closed). */
export function readMainConfig(git: Git, repo: string): MainConfig {
  let text: string;
  try { text = git(repo, ["show", "main:.digismith/config.yml"]); } catch (e) {
    return { ok: false, error: `cannot read .digismith/config.yml from main: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}` };
  }
  return { ok: true, guardrails: readGuardrails(text) };
}
```

- [ ] **Step 4: Run the tests, expect PASS.** Fix the parity fixtures only if `parseConfig` itself accepts one of the "must throw" samples (then replace that sample with one it rejects; do not weaken the reader).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/autonomous/gitx.ts packages/cli/src/autonomous/protected-paths.ts packages/cli/src/autonomous/guardrails.ts packages/cli/src/autonomous/protected-paths.test.ts packages/cli/src/autonomous/guardrails.test.ts
git commit -m "feat(dgs-585): add the git port, protected paths and the strict guardrail reader"
```

---

### Task 2: Salvage

**Files:**
- Create: `packages/cli/src/salvage/secrets.ts`, `salvage.ts`, `index.ts`
- Modify: `packages/cli/src/index.ts` (import and `.command(salvageCommand)` after `.command(runCommand)`)
- Test: `packages/cli/src/salvage/secrets.test.ts`, `salvage.test.ts`

**Interfaces:**
- Consumes: `Git`, `realGit` from `../autonomous/gitx.ts`.
- Produces:
  - `secretFiles(files: { path: string; size: number }[]): string[]`
  - `interface SalvageDeps { git: Git; repo: string; depotDir: string; now: () => Date; statSize: (path: string) => number }`
  - `type SalvageResult = { ok: true; steps: string[]; bundle: string | null } | { ok: false; steps: string[]; message: string }`
  - `salvage(d: SalvageDeps, a: { ticket: string; worktree?: string; dryRun?: boolean }): SalvageResult`
  - default export `salvageCommand: CommandModule` (`dg salvage --ticket <KEY> [--worktree <path>] [--dry-run]`, exit 1 when not ok).

- [ ] **Step 1: Write the failing tests**

`secrets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { secretFiles } from "./secrets.ts";

const f = (path: string, size = 10) => ({ path, size });
describe("secretFiles", () => {
  it.each([".env", ".env.local", "a/b/.env.production", "x.pem", "k/id.key", "my-Secret-notes.txt", "a/api_token.json", "TOKEN"])
    ("flags %s", (p) => expect(secretFiles([f(p)])).toEqual([p]));
  it("flags a file over 5 MB", () => expect(secretFiles([f("big.bin", 5 * 1024 * 1024 + 1)])).toEqual(["big.bin"]));
  it("passes 5 MB exactly and ordinary names", () => {
    expect(secretFiles([f("a.ts"), f("env.md"), f("exact.bin", 5 * 1024 * 1024)])).toEqual([]);
  });
});
```

`salvage.test.ts` builds real temp repos:

```ts
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realGit } from "../autonomous/gitx.ts";
import { salvage, type SalvageDeps } from "./salvage.ts";

const sh = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
let root: string, origin: string, repo: string, wt: string, depot: string;
const mk = (over: Partial<SalvageDeps> = {}): SalvageDeps => ({
  git: realGit, repo, depotDir: depot, now: () => new Date("2026-10-22T03:04:05Z"),
  statSize: (p) => statSync(p).size, ...over,
});
const bundles = () => (existsSync(join(depot, "salvage")) ? readdirSync(join(depot, "salvage")) : []);
const rescue = () => sh(origin, "branch", "--list", "rescue/*");

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "salvage-"));
  origin = join(root, "origin.git"); repo = join(root, "repo"); wt = join(root, "wt"); depot = join(root, "depot");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  for (const [k, v] of [["user.email", "t@t"], ["user.name", "t"]]) sh(repo, "config", k, v);
  writeFileSync(join(repo, "a.txt"), "a\n"); sh(repo, "add", "."); sh(repo, "commit", "-qm", "init");
  sh(repo, "remote", "add", "origin", origin); sh(repo, "push", "-q", "origin", "main");
  sh(repo, "worktree", "add", "-q", "-b", "DGS-9__x", wt, "main");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("salvage", () => {
  it("clean and merged: nothing to salvage, no bundle", () => {
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(r).toMatchObject({ ok: true, bundle: null });
    expect(bundles()).toEqual([]);
  });
  it("dirty tree: WIP commit, verified bundle, rescue branch on origin", () => {
    writeFileSync(join(wt, "new.ts"), "x\n");
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(r.ok).toBe(true);
    expect(sh(wt, "log", "-1", "--format=%s")).toBe("wip(dgs-9): salvage before teardown");
    expect(bundles()).toEqual(["DGS-9-20261022T030405Z.bundle"]);
    sh(repo, "bundle", "verify", join(depot, "salvage", bundles()[0]));
    expect(rescue()).toContain("rescue/DGS-9");
  });
  it("clean but unmerged: no WIP commit, bundle and push still happen", () => {
    writeFileSync(join(wt, "n.ts"), "x\n"); sh(wt, "add", "."); sh(wt, "commit", "-qm", "feat: n");
    const before = sh(wt, "rev-parse", "HEAD");
    expect(salvage(mk(), { ticket: "DGS-9" }).ok).toBe(true);
    expect(sh(wt, "rev-parse", "HEAD")).toBe(before);
    expect(rescue()).toContain("rescue/DGS-9");
  });
  it.each([".env", "cert.pem", "id.key", "my-secret.txt", "api-token.json"])("a secret file %s stops everything", (name) => {
    writeFileSync(join(wt, name), "s\n");
    const before = sh(wt, "rev-parse", "HEAD");
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.message).toBe(`not salvaged: ${name}`);
    expect(sh(wt, "rev-parse", "HEAD")).toBe(before);
    expect(bundles()).toEqual([]);
    expect(rescue()).toBe("");
  });
  it("a file over 5 MB stops everything", () => {
    writeFileSync(join(wt, "big.bin"), Buffer.alloc(5 * 1024 * 1024 + 1));
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(!r.ok && r.message).toBe("not salvaged: big.bin");
    expect(rescue()).toBe("");
  });
  it("a rejected push is a failure and leaves no rescue branch", () => {
    writeFileSync(join(wt, "n.ts"), "x\n");
    mkdirSync(join(origin, "hooks"), { recursive: true });
    writeFileSync(join(origin, "hooks", "pre-receive"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/push/);
    expect(rescue()).toBe("");
  });
  it("two worktrees for the key: stop", () => {
    sh(repo, "worktree", "add", "-q", "-b", "DGS-9__y", join(root, "wt2"), "main");
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(r.ok).toBe(false);
  });
  it("dry run changes nothing", () => {
    writeFileSync(join(wt, "new.ts"), "x\n");
    const before = sh(wt, "rev-parse", "HEAD");
    const r = salvage(mk(), { ticket: "DGS-9", dryRun: true });
    expect(r.ok && r.steps.every((s) => s.startsWith("would "))).toBe(true);
    expect(sh(wt, "rev-parse", "HEAD")).toBe(before);
    expect(bundles()).toEqual([]);
    expect(rescue()).toBe("");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**: `pnpm --filter @digismith/cli exec vitest run src/salvage`

- [ ] **Step 3: Implement**

`secrets.ts`:

```ts
const MAX_BYTES = 5 * 1024 * 1024;
const NAME = [/^\.env/i, /\.pem$/i, /\.key$/i, /secret/i, /token/i];

/** Names and sizes only; no file is read. Returns the paths that must not be salvaged. */
export function secretFiles(files: { path: string; size: number }[]): string[] {
  return files
    .filter((f) => {
      const base = f.path.split("/").pop() ?? f.path;
      return NAME.some((re) => re.test(base)) || f.size > MAX_BYTES;
    })
    .map((f) => f.path);
}
```

`salvage.ts`:

```ts
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Git } from "../autonomous/gitx.ts";
import { secretFiles } from "./secrets.ts";

export interface SalvageDeps { git: Git; repo: string; depotDir: string; now: () => Date; statSize: (path: string) => number }
export type SalvageResult = { ok: true; steps: string[]; bundle: string | null } | { ok: false; steps: string[]; message: string };

const utcStamp = (d: Date): string => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e)).split("\n")[0];

export function salvage(d: SalvageDeps, a: { ticket: string; worktree?: string; dryRun?: boolean }): SalvageResult {
  const steps: string[] = [];
  const fail = (message: string): SalvageResult => ({ ok: false, steps, message });
  const act = (label: string, run: () => void): void => {
    steps.push(a.dryRun ? `would ${label}` : label);
    if (!a.dryRun) run();
  };
  try {
    // 1. the worktree and the branch
    const listing = d.git(d.repo, ["worktree", "list", "--porcelain"]).split("\n\n").map((b) => {
      const path = /^worktree (.+)$/m.exec(b)?.[1];
      const branch = /^branch refs\/heads\/(.+)$/m.exec(b)?.[1];
      return path && branch ? { path, branch } : null;
    }).filter((x): x is { path: string; branch: string } => x !== null);
    const prefix = `${a.ticket}__`;
    const found = a.worktree === undefined ? listing.filter((w) => w.branch.startsWith(prefix)) : listing.filter((w) => w.path === a.worktree);
    if (found.length !== 1) return fail(`expected one worktree for ${a.ticket}, found ${found.length}`);
    const { path: wt, branch } = found[0];

    // 2. is salvage needed
    const status = d.git(wt, ["status", "--porcelain", "-z", "--untracked-files=all"]);
    const dirty = status.split("\0").filter(Boolean).length > 0;
    const merged = d.git(d.repo, ["branch", "--merged", "main", "--format=%(refname:short)"]).split("\n").includes(branch);
    if (!dirty && merged) return { ok: true, steps: ["nothing to salvage"], bundle: null };

    // 3. secret check before any commit
    if (dirty) {
      const names = d.git(wt, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
      const hits = secretFiles(names.map((p) => ({ path: p, size: d.statSize(join(wt, p)) })));
      if (hits.length > 0) return fail(`not salvaged: ${hits.join(", ")}`);
      // 4. WIP commit
      act("make the WIP commit", () => {
        d.git(wt, ["add", "-A"]);
        d.git(wt, ["commit", "--no-verify", "-m", `wip(${a.ticket.toLowerCase()}): salvage before teardown`]);
      });
    }

    // 5. bundle, then verify
    const dir = join(d.depotDir, "salvage");
    const bundle = join(dir, `${a.ticket}-${utcStamp(d.now())}.bundle`);
    act(`write ${bundle}`, () => {
      mkdirSync(dir, { recursive: true });
      d.git(wt, ["bundle", "create", bundle, branch]);
      d.git(wt, ["bundle", "verify", bundle]);
    });

    // 6. push
    act(`push ${branch} to rescue/${a.ticket}`, () => {
      d.git(wt, ["push", "origin", `${branch}:refs/heads/rescue/${a.ticket}`]);
    });
    return { ok: true, steps, bundle };
  } catch (e) {
    return fail(`salvage failed (${steps[steps.length - 1] ?? "start"}): ${msg(e)}`);
  }
}
```

(The push failure message contains the last step label `push …`, which the rejected-push test matches.)

`index.ts`:

```ts
import { homedir } from "node:os";
import { statSync } from "node:fs";
import { join } from "node:path";
import type { CommandModule } from "yargs";
import { realGit } from "../autonomous/gitx.ts";
import { salvage } from "./salvage.ts";

const command: CommandModule = {
  command: "salvage",
  describe: "before a worktree is removed: WIP commit, bundle to the depot, push rescue/<KEY>; never deletes",
  builder: (y) =>
    y
      .option("ticket", { type: "string", demandOption: true, describe: "ticket key, e.g. DGS-585" })
      .option("worktree", { type: "string", describe: "the worktree path (default: the one worktree on <KEY>__*)" })
      .option("repo", { type: "string", describe: "the main checkout (default: the current directory's repo)" })
      .option("dry-run", { type: "boolean", default: false }),
  handler: (a) => {
    const repo = (a.repo as string | undefined) ?? realGit(process.cwd(), ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim().replace(/\/\.git$/, "");
    const r = salvage(
      { git: realGit, repo, depotDir: join(homedir(), ".digismith-depot"), now: () => new Date(), statSize: (p) => statSync(p).size },
      { ticket: a.ticket as string, worktree: a.worktree as string | undefined, dryRun: a["dry-run"] as boolean },
    );
    for (const s of r.steps) console.log(s);
    if (r.ok) { console.log(r.bundle ? `salvaged: ${r.bundle}` : "salvage: nothing needed"); process.exitCode = 0; }
    else { console.error(r.message); process.exitCode = 1; }
  },
};
export default command;
```

In `src/index.ts` add `import salvageCommand from "./salvage/index.ts";` and `.command(salvageCommand)`.

- [ ] **Step 4: Run, expect PASS**: `pnpm --filter @digismith/cli exec vitest run src/salvage src/strip-types.smoke.test.ts`
- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/salvage packages/cli/src/index.ts
git commit -m "feat(dgs-585): add dg salvage with a secret and size check"
```

---

### Task 3: Cleanup calls salvage; the lost path asks for it

**Files:**
- Modify: `skills/finishing-a-development-branch/scripts/post-merge-cleanup.ts`, `skills/finishing-a-development-branch/SKILL.md` (Step 6 and the Discard section), `packages/cli/src/autonomous/act.ts`, `notify.ts`
- Test: `skills/finishing-a-development-branch/scripts/post-merge-cleanup.test.ts`, `packages/cli/src/autonomous/act.test.ts`, `tick.test.ts`, `notify.test.ts`

**Interfaces:**
- Consumes: `dg salvage --ticket <KEY> --worktree <path>` (Task 2) with exit 0/1.
- Produces: `CleanupOptions.salvage?: (a: { ticket: string; worktree: string }) => { ok: boolean; message: string }` (default: runs `dg salvage` via `execFileSync`, exit 0 = ok). The cleanup script cannot import the cli package (it ships in the plugin), so it calls the command.

Behaviour to implement in `cleanup()`:
- Ticket key = `/^([A-Z]+-\d+)__/.exec(branch)?.[1]`. No key and the worktree needs salvage: stop with `no ticket key in branch <b>; cannot salvage; nothing was changed`.
- Where the tree has tracked changes or non-cache untracked files (today's stop at "holds changes that are not known caches"), call `salvage` first (not in dry-run: add the step `would salvage ...`). Salvage not ok: stop with `salvage failed, nothing removed: <message>`. Salvage ok: continue to removal with `--force` (the WIP commit left the tree clean, so plain remove works; keep `--force` only for caches).
- After a WIP commit the branch is no longer in `--merged`, so `git branch -d` refuses: let that error surface as the stop message `rescue/<KEY> holds the work; branch kept: <git message>`. Never `-D`.

- [ ] **Step 1: Failing tests** in `post-merge-cleanup.test.ts` (reuse the file's existing temp-repo helpers; read them first and follow their style): (a) a merged branch with an untracked `notes.md`: injected `salvage` returns ok → worktree removed, `salvage` was called once with the ticket and path, branch kept with the `rescue/` message; (b) same but `salvage` returns `{ ok: false, message: "not salvaged: .env" }` → `ok:false`, worktree and branch still exist, message starts `salvage failed, nothing removed`; (c) clean merged worktree → `salvage` not called; (d) caches-only worktree → `salvage` not called; (e) `--dry-run` with a dirty tree → `salvage` not called, steps contain `would salvage`.
  In `act.test.ts` change the two merge expectations to the new merge text and the restart text (below); `tick.test.ts` lines 67, 91, 141 likewise. In `notify.test.ts` add: a `lost` item comment ends with the salvage ask.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
  `post-merge-cleanup.ts`: add to `CleanupOptions` `salvage?: ...`; add

```ts
const defaultSalvage = ({ ticket, worktree }: { ticket: string; worktree: string }): { ok: boolean; message: string } => {
  try {
    execFileSync("dg", ["salvage", "--ticket", ticket, "--worktree", worktree], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, message: "salvaged" };
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    return { ok: false, message: (err.stderr || err.message).trim().split("\n")[0] };
  }
};
```

  and, inside the `if (tracked.length > 0 || other.length > 0)` branch, replace the `return stop(...)` with: key lookup; if `dryRun` push `would salvage ...` and continue to the dry-run removal steps; else run `salvage` and `return stop(...)` on failure. Keep the old "holds changes" stop only for the case where there is no ticket key. Wrap the final `git branch -d` in try/catch returning `stop(\`rescue/${key} holds the work; branch kept: ${first line}\`)` when salvage ran this call.
  `act.ts`:

```ts
export const ORDER_TEXTS = {
  merge: (t: string) => `${t}: run dg autonomous merge-gate --ticket ${t} first; merge per hooks 01-03 only if it prints go, then release merged`,
  restart: (t: string) => `${t}: restart the builder, its pane is gone; before any teardown run dg salvage --ticket ${t}, and if it fails stop and tell Jack`,
};
```

  `notify.ts` line 45: append, for `it.kind === "lost"`, ` Before any teardown run dg salvage --ticket ${it.ticket}.` (no change for other kinds).
  `SKILL.md`: in Step 6 list add after item 2: "3. when the worktree holds changes that are not known caches, runs `dg salvage --ticket <KEY> --worktree <path>`; a failed salvage stops here and nothing is removed (renumber the rest)". In the Discard section add: "Run `dg salvage --ticket <KEY>` first; if it fails, stop and tell your human partner."
- [ ] **Step 4: Run** `pnpm exec vitest run skills/finishing-a-development-branch packages/cli/src/autonomous/act.test.ts packages/cli/src/autonomous/tick.test.ts packages/cli/src/autonomous/notify.test.ts`, expect PASS.
- [ ] **Step 5: Commit**

```bash
git add skills/finishing-a-development-branch packages/cli/src/autonomous/act.ts packages/cli/src/autonomous/act.test.ts packages/cli/src/autonomous/tick.test.ts packages/cli/src/autonomous/notify.ts packages/cli/src/autonomous/notify.test.ts
git commit -m "feat(dgs-585): salvage before cleanup and ask for it on the lost path"
```

---

### Task 4: Night merge gate

**Files:**
- Create: `packages/cli/src/autonomous/merge-gate.ts`
- Modify: `packages/cli/src/autonomous/index.ts` (new `merge-gate` command), `.digismith/config.yml` (protected paths block)
- Test: `packages/cli/src/autonomous/merge-gate.test.ts`

**Interfaces:**
- Consumes: `Git`, `readMainConfig`, `DEFAULT_PROTECTED`, `touchedProtected`, `appendOpen` (`./attention.ts`), `classOfCause` (`./causes.ts`).
- Produces:
  - `interface GateDeps { git: Git; repo: string; dir: string; now: () => Date }`
  - `type GateResult = { go: true } | { go: false; code: "config" | "no-branch" | "no-commits" | "protected-path"; reason: string }`
  - `runMergeGate(d: GateDeps, ticket: string): GateResult`. A refusal writes one attention item (run = ticket, kind `refused`, cause `merge-refused: <reason>`, `causeClass` durable, `retryEligible` false). `go` writes nothing.

- [ ] **Step 1: Failing tests** with real temp repos (same helper shape as Task 2: bare origin not needed; one repo with `main`, a branch `DGS-9__x` made with `git checkout -b`, the config committed on main). Cases: (a) branch with a normal commit → `{ go: true }`, no attention file; (b) 0 commits ahead → `no-commits`; (c) a commit touching `hooks/hooks.json` → `protected-path`, reason lists the path, `readOpen(dir)` has one item `{ run: "DGS-9", kind: "refused" }` and a second call does not add another; (d) the branch edits `.digismith/config.yml` to set `nightwatch.protected_paths` to `- nothing/` and also touches `hooks/a` → still refused (policy from main); (e) main's config has `nightwatch:\n  protected_paths:\n    - docs/` and the branch touches `docs/a.md` → refused, and touching `hooks/a` alone → go (the config list replaces the defaults); (f) main has a broken `nightwatch.budgets` line → `config`, refused; (g) no config on main → `config`; (h) no branch for the key, and two branches for the key → `no-branch`; (i) each new default path (`packages/cli/src/autonomous/x.ts`, `scripts/nexus-api/src/scheduler/x.ts`, `.digismith/mandate.yml`, `.digismith/profiles/p.yml`) refused when the config has no `protected_paths` key.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `merge-gate.ts`:

```ts
import { appendOpen } from "./attention.ts";
import { classOfCause } from "./causes.ts";
import type { Git } from "./gitx.ts";
import { readMainConfig } from "./guardrails.ts";
import { DEFAULT_PROTECTED, touchedProtected } from "./protected-paths.ts";

export interface GateDeps { git: Git; repo: string; dir: string; now: () => Date }
export type GateResult =
  | { go: true }
  | { go: false; code: "config" | "no-branch" | "no-commits" | "protected-path"; reason: string };

export function runMergeGate(d: GateDeps, ticket: string): GateResult {
  const refuse = (code: "config" | "no-branch" | "no-commits" | "protected-path", reason: string): GateResult => {
    const iso = d.now().toISOString();
    appendOpen(d.dir, { ticket, run: ticket, kind: "refused", cause: `merge-refused: ${reason}`, causeClass: classOfCause("merge-refused"), retryEligible: false, since: iso, ts: iso });
    return { go: false, code, reason };
  };
  const cfg = readMainConfig(d.git, d.repo);
  if (!cfg.ok) return refuse("config", cfg.error);
  if (cfg.guardrails.problems.length > 0) return refuse("config", cfg.guardrails.problems.join("; "));
  let branches: string[];
  try {
    branches = d.git(d.repo, ["branch", "--list", `${ticket}__*`, "--format=%(refname:short)"]).split("\n").filter(Boolean);
  } catch (e) { return refuse("no-branch", `cannot list branches: ${(e as Error).message.split("\n")[0]}`); }
  if (branches.length !== 1) return refuse("no-branch", `expected one branch ${ticket}__*, found ${branches.length}`);
  const branch = branches[0];
  try {
    if (Number(d.git(d.repo, ["rev-list", "--count", `main..${branch}`]).trim()) === 0) return refuse("no-commits", `${branch} has 0 commits ahead of main`);
    const files = d.git(d.repo, ["diff", "--name-only", `main...${branch}`]).split("\n").filter(Boolean);
    const hits = touchedProtected(files, cfg.guardrails.protectedPaths ?? DEFAULT_PROTECTED);
    if (hits.length > 0) return refuse("protected-path", `protected path: ${hits.join(", ")}`);
  } catch (e) { return refuse("config", `git failed: ${(e as Error).message.split("\n")[0]}`); }
  return { go: true };
}
```

  In `index.ts` add after `release`:

```ts
        .command({
          command: "merge-gate",
          describe: "before a night merge: go, or refuse (no commits ahead, a protected path, a bad config on main)",
          builder: (e) =>
            e
              .option("ticket", { type: "string", requiresArg: true, demandOption: true, describe: "ticket key, e.g. DGS-585" })
              .option("repo", { type: "string", requiresArg: true, describe: "the main checkout (default: the main checkout)" }),
          handler: (argv) =>
            guarded(depsFactory, async (d) => {
              const r = runMergeGate({ git: realGit, repo: (argv.repo as string | undefined) ?? d.mainRepo ?? MAIN_CHECKOUT, dir: d.dir, now: d.now }, argv.ticket as string);
              if (!r.go) throw new Error(`refused: ${r.reason}`);
              return ["go"];
            }),
        })
```

  (add the imports `realGit` and `runMergeGate`). `.digismith/config.yml`: append

```yaml

nightwatch:
  protected_paths:
    - hooks/
    - hooks/hooks.json
    - .digismith/config.yml
    - skills/finishing-*/
    - skills/reviewer/
    - packages/cli/src/reviewer/
    - packages/cli/src/autonomous/
    - scripts/nexus-api/src/scheduler/
    - .digismith/mandate.yml
    - .digismith/profiles/
```

  (If `nightwatch:` already exists in the file, add only the `protected_paths` block under it.) Add a test that `readGuardrails` of the repo's own `.digismith/config.yml` has no problems and its list equals `DEFAULT_PROTECTED`.
- [ ] **Step 4: Run** `pnpm --filter @digismith/cli exec vitest run src/autonomous/merge-gate.test.ts src/autonomous/index.test.ts`, expect PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/autonomous/merge-gate.ts packages/cli/src/autonomous/merge-gate.test.ts packages/cli/src/autonomous/index.ts .digismith/config.yml
git commit -m "feat(dgs-585): add the night merge gate and the protected paths config"
```

---

### Task 5: Already-done check and the scan guard

**Files:**
- Create: `packages/cli/src/autonomous/already-done.ts`, `scan-guard.ts`
- Modify: `packages/cli/src/autonomous/scan.ts`, `index.ts`, `types.ts` (`EventKind` gains `"guardrail-config"`), `ready.ts` (no change to `checkReady`)
- Test: `already-done.test.ts`, `scan-guard.test.ts`, additions to `scan.test.ts`

**Interfaces:**
- Consumes: `Git`, `readMainConfig`, `LoTask`.
- Produces:
  - `mergedOnMain(git: Git, repo: string, key: string): string | null` returns a short sha or reason text when the key's work is on origin/main by the two allowed rules, else null.
  - `blockerProblem(git: Git, repo: string, blockerKey: string): string | null` (null = passes).
  - `interface ScanGuard { guardrailProblems(): string[]; alreadyDone(t: LoTask): { reason: string; attention?: string } | null }` — `reason` is the skip reason; `attention` set only for the already-merged case (cause `already-merged-but-open`).
  - `makeScanGuard(git: Git, repo: string): ScanGuard` (runs `git fetch origin main` once per scan on first use; a failed fetch makes `alreadyDone` return `{ reason: "cannot check origin/main: <msg>" }` and `guardrailProblems` is unaffected).
  - `ScanDeps.guard?: ScanGuard` (optional only so older tests keep passing; production always passes it).
  - `ScanResult.outcome` gains `"guardrail-config"`.

Rules in `already-done.ts` (all against `origin/main`):
- `scopeOf(subject)`: the text in the first `(...)` of a subject, after `^\w+`; a subject like `feat(dgs-585): x` gives `dgs-585`. Only that scope can name the key; comparison is case-insensitive and exact (`dgs-58` does not match `DGS-585`; scope `dgs-585,dgs-586` is split on `,` and `/`).
- Rule (a): `git log origin/main --format=%h%x09%s` lines whose scope names the key.
- Rule (b): branches `<KEY>__*` from `git branch -a --list` (local, `origin/`) — each checked with `git merge-base --is-ancestor <branch> origin/main` (exit 0 = ancestor; the `Git` port throws on exit 1, so catch).
- `mergedOnMain` is true on (a) or (b).
- `blockerProblem`: collect branches named `<KEY>__*` locally, `origin/<KEY>__*`, and `origin/rescue/<KEY>`. None found → null (passes on ClickUp done). Some found → pass only when `mergedOnMain` is true; otherwise return `blocker-not-on-main: <KEY>` (a rescue branch alone never passes).

- [ ] **Step 1: Failing tests.**
  `already-done.test.ts` (real temp repos with a bare origin; commit helper with a subject argument): (1) commit `feat(dgs-7): x` on origin/main → `mergedOnMain` returns a sha; also `fix(DGS-7): y`; (2) key only in the body, or in a subject without a scope (`merge DGS-7 stuff`), or in a later paren (`chore(x): see (dgs-7)`) → null; (3) `dgs-70` scope does not match `DGS-7`; (4) branch `DGS-7__a` pushed and merged into main (merge commit with no key in the subject) → returns non-null by rule (b); (5) branch not merged → null; (6) blocker with an unmerged local branch → `blocker-not-on-main: DGS-7`; with only `origin/rescue/DGS-7` → same; with the branch merged → null; with no branch at all → null.
  `scan-guard.test.ts`: fake `Git` function (records args): `guardrailProblems()` returns main-config problems from a fixture, and the read-failure text when `git show` throws; `alreadyDone` returns the merged reason with `attention: "already-merged-but-open"`; a blocker in `t.blockers` with `done: true` that fails gives `{ reason: "blocker-not-on-main: DGS-3" }`; a blocker with `done: false` is ignored here (checkReady handles it); a failed fetch gives the "cannot check" reason; fetch runs once for two calls.
  `scan.test.ts` additions (use `mk({ guard })` with a fake guard object): guardrail problems → outcome `guardrail-config`, no claim, no tracker `setStatus`, an `autonomous/attention.jsonl` item `{ run: "-", kind: "failed", cause: "bad-guardrail-config" }` and a `guardrail-config` event; a clean second scan closes that item (resolved line) and claims; `alreadyDone` returning a reason skips that ticket with the reason in `skipped`, writes a `skip` event, and the next ready ticket is claimed; the `attention` field opens an item `{ run: <KEY>, kind: "unknown", cause: "already-merged-but-open" }`; dry-run lists the reason in `verdicts`; no `guard` → today's behaviour (the existing tests stay green).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
  `already-done.ts`:

```ts
import type { Git } from "./gitx.ts";

export const scopeOf = (subject: string): string[] => {
  const m = /^\w+\(([^)]*)\)!?:/.exec(subject);
  return m ? m[1].split(/[,/]/).map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
};

function branchesFor(git: Git, repo: string, key: string): string[] {
  const out = git(repo, ["branch", "-a", "--list", `${key}__*`, `origin/${key}__*`, `remotes/origin/${key}__*`, `remotes/origin/rescue/${key}`, "--format=%(refname:short)"]);
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

const isAncestor = (git: Git, repo: string, ref: string): boolean => {
  try { git(repo, ["merge-base", "--is-ancestor", ref, "origin/main"]); return true; } catch { return false; }
};

export function mergedOnMain(git: Git, repo: string, key: string): string | null {
  const want = key.toLowerCase();
  for (const line of git(repo, ["log", "origin/main", "--format=%h%x09%s"]).split("\n")) {
    const [sha, subject] = [line.slice(0, line.indexOf("\t")), line.slice(line.indexOf("\t") + 1)];
    if (sha && scopeOf(subject).includes(want)) return sha;
  }
  for (const b of branchesFor(git, repo, key).filter((x) => !x.includes("rescue/"))) {
    if (isAncestor(git, repo, b)) return `branch ${b}`;
  }
  return null;
}

export function blockerProblem(git: Git, repo: string, blockerKey: string): string | null {
  if (branchesFor(git, repo, blockerKey).length === 0) return null;
  return mergedOnMain(git, repo, blockerKey) === null ? `blocker-not-on-main: ${blockerKey}` : null;
}
```

  `scan-guard.ts`:

```ts
import { blockerProblem, mergedOnMain } from "./already-done.ts";
import type { Git } from "./gitx.ts";
import { readMainConfig } from "./guardrails.ts";
import type { LoTask } from "./types.ts";

export interface ScanGuard {
  guardrailProblems(): string[];
  alreadyDone(t: LoTask): { reason: string; attention?: string } | null;
}

export function makeScanGuard(git: Git, repo: string): ScanGuard {
  let fetched: string | null | undefined; // undefined: not yet, null: ok, string: the failure
  const fetchOnce = (): string | null => {
    if (fetched === undefined) {
      try { git(repo, ["fetch", "origin", "main"]); fetched = null; } catch (e) { fetched = (e as Error).message.split("\n")[0]; }
    }
    return fetched;
  };
  return {
    guardrailProblems() {
      const c = readMainConfig(git, repo);
      return c.ok ? c.guardrails.problems : [c.error];
    },
    alreadyDone(t) {
      const key = t.key ?? t.id;
      const f = fetchOnce();
      if (f !== null) return { reason: `cannot check origin/main: ${f}` };
      try {
        const hit = mergedOnMain(git, repo, key);
        if (hit !== null) return { reason: `already-merged: ${hit}`, attention: "already-merged-but-open" };
        for (const b of t.blockers.filter((x) => x.done)) {
          const p = blockerProblem(git, repo, b.key);
          if (p !== null) return { reason: p };
        }
      } catch (e) {
        return { reason: `cannot check origin/main: ${(e as Error).message.split("\n")[0]}` };
      }
      return null;
    },
  };
}
```

  `scan.ts`: add `guard?: ScanGuard` to `ScanDeps`, `"guardrail-config"` to `ScanResult.outcome` and `"guardrail-config"` to `EventKind`. After the lock check (step 2) and before `readNotes`, when `d.guard` and not `dryRun`:

```ts
  if (d.guard && !d.dryRun) {
    const problems = d.guard.guardrailProblems();
    if (problems.length > 0) {
      const cause = "bad-guardrail-config";
      try { appendAttention(d.dir, now, { ticket: null, run: "-", kind: "failed", cause }); } catch { /* the scan still stops */ }
      appendEvent(d.dir, now, "guardrail-config", { problems: problems.join("; ").slice(0, 300) });
      return { outcome: "guardrail-config", candidates: 0, skipped };
    }
    for (const it of readOpen(d.dir)) if (it.run === "-" && it.cause === "bad-guardrail-config") appendResolved(d.dir, it.id, "watchdog", now.toISOString(), "guardrails read clean");
  }
```

  (import `readOpen`, `appendResolved` from `./attention.ts`). In dry-run, when `d.guard` exists, push `guardrail-config: <problems>` as a verdict for key `-` instead of stopping, so `dg autonomous scan --dry-run` shows it. In the rank loop, after `checkReady` and when `reasons.length === 0` and `d.guard`, call `d.guard.alreadyDone(t)`; a non-null result is added to `reasons` (so the existing skip comment, event and dry-run verdict paths handle it), and when `attention` is set and not dry-run, `appendAttention(d.dir, now, { ticket: key, run: key, kind: "unknown", cause: attention })`.
  `index.ts`: build the guard in the `scan` handler: `guard: makeScanGuard(realGit, argv.repo as string)`; add `guard?: ScanGuard` pass-through only there.
- [ ] **Step 4: Run** `pnpm --filter @digismith/cli exec vitest run src/autonomous/already-done.test.ts src/autonomous/scan-guard.test.ts src/autonomous/scan.test.ts src/autonomous/index.test.ts`, expect PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/autonomous
git commit -m "feat(dgs-585): stop the scan on bad guardrails and skip work already on main"
```

---

### Task 6: Drift section in the morning report

**Files:**
- Create: `packages/cli/src/autonomous/drift.ts`
- Modify: `packages/cli/src/autonomous/scan.ts` (claim event gains `taskId`), `report.ts`, `index.ts` (report handler passes git)
- Test: `drift.test.ts`, additions to `report.test.ts`

**Interfaces:**
- Consumes: `mergedOnMain` (Task 5), `Tracker.getStatus(taskId)`, claim events `{ ticket, taskId }`.
- Produces:
  - `interface Claimed { ticket: string; taskId: string }`
  - `interface DriftFacts { status: string | null; mergedSha: string | null; branchEmpty: boolean }` (`status` null = unreadable)
  - `driftLines(claimed: Claimed[], facts: Map<string, DriftFacts>): string[]`
  - `gatherDrift(d: { tracker: Tracker; git: Git; repo: string }, claimed: Claimed[]): Promise<Map<string, DriftFacts>>`
  - `buildReport(..., drift: string[] = [])` gains a trailing optional parameter; the new section `Drift` prints after `Still building` (`none` when empty).

Rules for `driftLines` (statuses lowercase-compared; "done" means `complete` or `done` or `closed`):
- `status === null`: `<KEY>: status unreadable`
- done and `mergedSha === null`: `<KEY>: done in ClickUp, nothing on main`
- not done and `mergedSha !== null`: `<KEY>: <status> in ClickUp, merged on main (<sha>)`
- `branchEmpty`: `<KEY>: branch has no commits` (added in addition to the above when it holds)
- otherwise no line.

- [ ] **Step 1: Failing tests.** `drift.test.ts`: a table test with one case per rule and a no-drift case; `gatherDrift` with `FakeTracker` (set a task status to `complete`) and a fake `Git` that answers `log` with a scoped commit for one ticket and nothing for another, a throwing `getStatus` gives `status: null`. `report.test.ts`: `buildReport` with `drift = []` prints `Drift\nnone`; with two lines prints them as `- ` bullets after `Still building`; the existing snapshots/expectations that compare the whole text are updated for the new `Drift` block.
  `scan.test.ts`: the `claim` event now carries `taskId`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** `drift.ts`:

```ts
import { mergedOnMain } from "./already-done.ts";
import type { Git } from "./gitx.ts";
import type { Tracker } from "./types.ts";

export interface Claimed { ticket: string; taskId: string }
export interface DriftFacts { status: string | null; mergedSha: string | null; branchEmpty: boolean }
const DONE = new Set(["complete", "done", "closed"]);

export function driftLines(claimed: Claimed[], facts: Map<string, DriftFacts>): string[] {
  const out: string[] = [];
  for (const c of claimed) {
    const f = facts.get(c.ticket);
    if (!f) continue;
    if (f.status === null) out.push(`${c.ticket}: status unreadable`);
    else if (DONE.has(f.status.toLowerCase()) && f.mergedSha === null) out.push(`${c.ticket}: done in ClickUp, nothing on main`);
    else if (!DONE.has(f.status.toLowerCase()) && f.mergedSha !== null) out.push(`${c.ticket}: ${f.status} in ClickUp, merged on main (${f.mergedSha})`);
    if (f.branchEmpty) out.push(`${c.ticket}: branch has no commits`);
  }
  return out;
}

export async function gatherDrift(d: { tracker: Tracker; git: Git; repo: string }, claimed: Claimed[]): Promise<Map<string, DriftFacts>> {
  const facts = new Map<string, DriftFacts>();
  for (const c of claimed) {
    let status: string | null = null;
    try { status = await d.tracker.getStatus(c.taskId); } catch { /* shown as unreadable */ }
    let mergedSha: string | null = null;
    let branchEmpty = false;
    try {
      mergedSha = mergedOnMain(d.git, d.repo, c.ticket);
      const branches = d.git(d.repo, ["branch", "--list", `${c.ticket}__*`, "--format=%(refname:short)"]).split("\n").filter(Boolean);
      branchEmpty = branches.length === 1 && Number(d.git(d.repo, ["rev-list", "--count", `main..${branches[0]}`]).trim()) === 0 && mergedSha === null;
    } catch { /* git facts missing: only the status is compared */ }
    facts.set(c.ticket, { status, mergedSha, branchEmpty });
  }
  return facts;
}
```

  `mergedOnMain` returns a string such as `branch X` for rule (b); that is accepted in the drift line text. `report.ts`: add the optional `drift` parameter and, after the `Still building` block, `"Drift", list(drift), ""`. `runReport` gets optional `git?: Git` and `repo?: string` in `ReportDeps`; when both are present it collects `claim` events from `events` (`ticket`, `taskId` strings, de-duplicated by ticket) in `[from, to]`, calls `gatherDrift`, and passes `driftLines(...)` to `buildReport`. `scan.ts` claim event: `appendEvent(d.dir, now, "claim", { ticket: key, order, taskId: t.id })`. `index.ts` report handler: `runReport({ tracker: d.tracker(), dir: d.dir, now: d.now, git: realGit, repo: d.mainRepo ?? MAIN_CHECKOUT })`.
- [ ] **Step 4: Run** `pnpm --filter @digismith/cli exec vitest run src/autonomous/drift.test.ts src/autonomous/report.test.ts src/autonomous/scan.test.ts`, expect PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/autonomous
git commit -m "feat(dgs-585): add the drift section to the morning report"
```

---

### Task 7: Docs, first-use text and full verification

**Files:**
- Modify: `packages/cli/src/autonomous/WATCHDOG.md` (new section "Merge and cleanup safety"), `.digismith/board/DGS-585—merge-cleanup-safety/runbook-text.md` (create: the text the Maestro pastes into the sessions runbook: the gate in the merge step, salvage, first use)
- Modify: `design.md` in this folder (one line: drift uses the existing `Tracker.getStatus`, not a new `statusOf`)

**Interfaces:** none new.

- [ ] **Step 1: Write the text.** `WATCHDOG.md` gets: what `dg salvage` does and that it never deletes; `dg autonomous merge-gate` outputs (`go` / `refused: ...`, exit 0 / 1) and that a refusal is a `refused` item; the `nightwatch.protected_paths` key and the defaults; that any problem inside `nightwatch:` stops the scan with `bad-guardrail-config`; the already-done and blocker rules in two lines; the `Drift` section. `runbook-text.md` repeats the merge step: "run `dg autonomous merge-gate --ticket <KEY>`; on a refusal release with `--result failed --cause merge-refused`" and the four first-use steps of the spec.
- [ ] **Step 2: Full verification** (from the worktree root; each must pass and the output goes in the report):

```bash
pnpm --filter @digismith/cli exec vitest run
pnpm exec vitest run skills/finishing-a-development-branch scripts/config-parse.test.ts
pnpm --filter @digismith/cli exec tsc -p tsconfig.json --noEmit
node --experimental-strip-types packages/cli/src/index.ts salvage --help
node --experimental-strip-types packages/cli/src/index.ts autonomous merge-gate --help
```

  The typecheck must show no new error in any file this ticket added (older errors in `tracker-clickup.ts` and some older tests stay).
- [ ] **Step 3: Check the stripped output by hand** for the new files: `node -e "const {stripTypeScriptTypes}=require('node:module');..."` is already done by the smoke test; confirm `strip-types.smoke.test.ts` ran and passed in the full run.
- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/autonomous/WATCHDOG.md ".digismith/board/DGS-585—merge-cleanup-safety"
git commit -m "docs(dgs-585): document salvage, the merge gate, strict guardrails and drift"
```

---

## First use (copied from the spec)

After the merge the Maestro rebuilds the CLI dist and runs `scripts/nexus-api/install.sh`. Then:

1. `dg salvage --ticket DGS-585 --dry-run` on a finished ticket's worktree prints the plan and writes nothing.
2. `dg autonomous merge-gate --ticket <KEY>` on a night branch: `go`. On a throwaway branch that edits `hooks/hooks.json`: `refused: protected path`, and `dg autonomous attention` lists the `refused` item.
3. Break `nightwatch.budgets.building` on a scratch copy of the config: the next `dg autonomous scan --dry-run` reports `guardrail-config` and claims nothing.
4. The next morning report has a `Drift` section. The first real night is the real test of the already-done check.

## Self-review

- Spec coverage: Part 1 salvage with secret check (Tasks 2, 3); lost-path ask (Task 3); Part 2 gate with new default paths and the config list (Tasks 1, 4); Part 3 strict config (Tasks 1, 5); Part 4 already-done with the scope rule and branch-based blockers (Task 5); Part 5 drift (Task 6); docs and first use (Task 7).
- Names used across tasks: `Git`/`realGit`, `readMainConfig`, `readGuardrails`, `DEFAULT_PROTECTED`, `touchedProtected`, `mergedOnMain`, `blockerProblem`, `ScanGuard`, `makeScanGuard`, `driftLines`, `gatherDrift`, `runMergeGate`, `salvage`, `secretFiles`.
- Known limit, stated in the spec and tests: a cleanup that salvages a merged branch leaves the branch in place (the WIP commit makes `git branch -d` refuse); Jack decides.
