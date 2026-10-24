# Every AI Session Is a Run (DGS-598) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Claude Code session with the DigiSmith plugin becomes a run by itself. Each run has a role, a project and a ticket when known. Oculus and `dg run list` show it, and the watchdog flags only builder, reviewer and scout runs.

**Architecture:** The SessionStart run-event hook creates an automatic run when `DIGISMITH_RUN_ID` is unset. The run id is `s-<session_id>`. A small index in `runs/.index/` maps a session_id (and the claude pid, for `/clear`) to its run, so the other hooks find it. Inside herdr, a detached labeller reads `herdr-ws agent list` once and sets the role. The role rule is one exported function, `roleOf`. The readers, the watchdog, the `nightwatch` views and the Nexus API/web get the new fields, the new roles and a 7-day activity window.

**Tech Stack:** TypeScript under `node --experimental-strip-types` (Node 24), vitest, zod (nexus-shared), Hono (nexus-api), Nuxt/Vue (nexus-web), pnpm.

Spec: `.digismith/board/DGS-598—every-session-a-run/design.html` (approved by Jack, 2026-10-24).

## Global Constraints

- Code in `packages/cli/src/` must run under `node --experimental-strip-types`: no parameter properties, no enums, no namespaces. `packages/cli/src/strip-types.smoke.test.ts` strips every file.
- Code names stay as they are on `main`: `nightwatch` views, `/api/v1/nightwatch`, `nightwatch-run/v1`, `NIGHTWATCH_*` env. New env overrides use the `NIGHTWATCH_` prefix (`NIGHTWATCH_HERDR_WS`, `NIGHTWATCH_TIMING`). In prose, say "run" and "Oculus", never "Nightwatch run" or "dashboard".
- The role rule is one exported function: `roleOf` in `packages/cli/src/run/role.ts`. The hook, the labeller and every other caller use it, and nothing keeps a copy. DGS-599 imports it later.
- Privacy: no message text, prompts, tool inputs or outputs in any file. Types, names, ids and counts only.
- A hook always exits 0, prints nothing and never hurts a session. Errors go to `runs/hook-errors.log` (256 KB cap).
- The hook path imports only `node:fs`, `node:path` and `node:os`, plus `node:child_process` loaded lazily through `process.getBuiltinModule` in the labeller spawn. No yargs and no git process.
- An explicit `DIGISMITH_RUN_ID` always wins: with it set, the behaviour is the DGS-581 behaviour.
- Tests use fakes only: `DIGISMITH_DEPOT_DIR` in a temp folder, fake `.git` trees, fake identity cards, and a fake `herdr-ws` through `NIGHTWATCH_HERDR_WS`. No real ClickUp, herdr, live API or real depot.
- No settings file change (hooks only in the plugin's `hooks/hooks.json`), no sudo, no LaunchAgent, no Caddy change, no delete outside the worktree.
- pnpm only. Commits are title-only conventional commits with no AI attribution, made with a pathspec.
- Run the root tests with `pnpm vitest run <paths>` from the worktree root. Run the web tests with `pnpm --filter @digismith/nexus-web test`. Vitest does not type-check: each task that touches `packages/cli/src` also runs `pnpm --filter @digismith/cli build` (tsc), which must pass.

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/cli/src/run/repo-info.ts` (new) | Project, main root, branch, worktree, ticket-from-branch, read from `.git` files with no git process |
| `packages/cli/src/run/identity-folder.ts` (new) | Is there exactly one Maestro identity card whose `folder:` is this root |
| `packages/cli/src/run/schema.ts` (new) | `RUN_SCHEMA`, `ROLES`, `Role`, `RunSource`, `RoleFrom`, `RunRecord`, `plainName`, `pluginVersion` (fs/path only) |
| `packages/cli/src/run/role.ts` (new) | `roleOf` (THE role rule) and `ticketOfAgentName` |
| `packages/cli/src/run/record.ts` | `createRun` (dg run start) adds the new fields; `readRun` fills defaults; `rewriteRun` (atomic) |
| `packages/cli/src/run/run-index.ts` (new) | `runs/.index/sessions/<sid>` and `runs/.index/pids/<pid>` |
| `packages/cli/src/run/auto.ts` (new) | `startAuto` (new run, resume, /clear) and `findAuto` |
| `packages/cli/src/run/label.ts` (new) | `parseAgentList`, `labelRun` (the labeller logic) |
| `packages/cli/src/run/label-cli.ts` (new) | Detached labeller entry: `node label-cli.ts <run-dir>` |
| `packages/cli/src/run/hook.ts` | The automatic path for all five kinds; spawns the labeller |
| `hooks/hooks.json` | The new guard and the compile cache |
| `packages/cli/src/run/read.ts`, `index.ts` | Dot folders skipped, `--ticket` by record, 7-day activity window, `project` in output, `--days`/`--all` |
| `packages/cli/src/autonomous/watchdog.ts`, `watch.ts` | Only builder, reviewer and scout are classified and watched |
| `packages/cli/src/nightwatch/types.ts`, `derive.ts`, `views.ts`, `index.ts` | `project`, `source`, a nullable ticket, the `project` filter, the 7-day window |
| `scripts/nexus-shared/nightwatch.ts`, `scripts/nexus-api/src/nightwatch-route.ts`, `nightwatch-reader.ts` | The new roles, fields and `project` query |
| `scripts/nexus-web/app/...` | The Project select; a null ticket shows as `-` |
| `packages/cli/src/run/README.md`, `packages/cli/src/autonomous/WATCHDOG.md` | Docs |

---

### Task 1: Repo info and identity folder match

**Files:**
- Create: `packages/cli/src/run/repo-info.ts`
- Create: `packages/cli/src/run/identity-folder.ts`
- Test: `packages/cli/src/run/repo-info.test.ts`
- Test: `packages/cli/src/run/identity-folder.test.ts`

**Interfaces:**
- Consumes: `depotDir(env)` from `packages/cli/src/run/paths.ts`.
- Produces:
  - `export type RepoInfo = { project: string; root: string | null; branch: string | null; worktree: string | null }`
  - `export function safeName(s: string): string`
  - `export function repoInfo(cwd: unknown): RepoInfo`
  - `export function ticketOfBranch(branch: string | null): string | null`
  - `export function maestroIdentityAt(root: string | null, env: NodeJS.ProcessEnv): boolean`

- [ ] **Step 1: Write the failing tests**

`packages/cli/src/run/repo-info.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { repoInfo, safeName, ticketOfBranch } from "./repo-info.ts";

let tmp: string;
beforeEach(() => { tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "nw-repo-"))); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function mainRepo(name: string, branch: string | null): string {
  const root = path.join(tmp, name);
  fs.mkdirSync(path.join(root, ".git"), { recursive: true });
  fs.writeFileSync(path.join(root, ".git", "HEAD"), branch ? `ref: refs/heads/${branch}\n` : "0123456789abcdef0123456789abcdef01234567\n");
  return root;
}

describe("repoInfo", () => {
  it("reads a main checkout from a sub folder", () => {
    const root = mainRepo("DigiSmith", "main");
    fs.mkdirSync(path.join(root, "packages", "cli"), { recursive: true });
    expect(repoInfo(path.join(root, "packages", "cli"))).toEqual({ project: "DigiSmith", root, branch: "main", worktree: null });
  });
  it("reads a linked worktree: project from the main root, branch from the worktree HEAD", () => {
    const root = mainRepo("DigiSmith", "main");
    const gitDir = path.join(root, ".git", "worktrees", "dgs-598");
    fs.mkdirSync(gitDir, { recursive: true });
    fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/DGS-598__every-session-a-run\n");
    const wt = path.join(root, ".worktrees", "dgs-598");
    fs.mkdirSync(wt, { recursive: true });
    fs.writeFileSync(path.join(wt, ".git"), `gitdir: ${gitDir}\n`);
    expect(repoInfo(wt)).toEqual({ project: "DigiSmith", root, branch: "DGS-598__every-session-a-run", worktree: wt });
  });
  it("gives a null branch on a detached HEAD", () => {
    const root = mainRepo("emma-theme", null);
    expect(repoInfo(root).branch).toBeNull();
  });
  it("uses the folder name when there is no .git, and makes it safe", () => {
    const dir = path.join(tmp, "My Notes (old)");
    fs.mkdirSync(dir);
    expect(repoInfo(dir)).toEqual({ project: "My-Notes-old-", root: null, branch: null, worktree: null });
  });
  it("gives project unknown for a missing or relative cwd", () => {
    expect(repoInfo(undefined).project).toBe("unknown");
    expect(repoInfo("relative/path").project).toBe("unknown");
    expect(repoInfo(42).project).toBe("unknown");
  });
});

describe("safeName", () => {
  it("keeps safe names and repairs others", () => {
    expect(safeName("DigiSmith")).toBe("DigiSmith");
    expect(safeName("a b/c")).toBe("a-b-c");
    expect(safeName("..hidden")).toBe("hidden");
    expect(safeName("")).toBe("unknown");
  });
});

describe("ticketOfBranch", () => {
  it("takes the key before __", () => {
    expect(ticketOfBranch("DGS-598__every-session-a-run")).toBe("DGS-598");
    expect(ticketOfBranch("EMKT-9001__fix")).toBe("EMKT-9001");
    expect(ticketOfBranch("main")).toBeNull();
    expect(ticketOfBranch("dgs-598__x")).toBeNull();
    expect(ticketOfBranch(null)).toBeNull();
  });
});
```

`packages/cli/src/run/identity-folder.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { maestroIdentityAt } from "./identity-folder.ts";

let tmp: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-ident-"));
  env = { DIGISMITH_DEPOT_DIR: tmp };
  fs.mkdirSync(path.join(tmp, "identities"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const card = (file: string, folder: string) =>
  fs.writeFileSync(path.join(tmp, "identities", file), `id: x\nname: X\nproject: P\nfolder: ${folder}\nrole: maestro\n`);

describe("maestroIdentityAt", () => {
  it("is true when exactly one card names the root", () => {
    card("digismith-maestro.yml", "/w/DigiSmith");
    card("emma-maestro.yml", "/w/emma");
    expect(maestroIdentityAt("/w/DigiSmith", env)).toBe(true);
  });
  it("is false for no card, two cards, a null root or no identities folder", () => {
    expect(maestroIdentityAt("/w/DigiSmith", env)).toBe(false);
    card("a.yml", "/w/DigiSmith");
    card("b.yml", "/w/DigiSmith");
    expect(maestroIdentityAt("/w/DigiSmith", env)).toBe(false);
    expect(maestroIdentityAt(null, env)).toBe(false);
    expect(maestroIdentityAt("/w/DigiSmith", { DIGISMITH_DEPOT_DIR: path.join(tmp, "none") })).toBe(false);
  });
  it("ignores files that are not .yml and a trailing slash in the card", () => {
    fs.writeFileSync(path.join(tmp, "identities", "notes.txt"), "folder: /w/DigiSmith\n");
    card("m.yml", "/w/DigiSmith/");
    expect(maestroIdentityAt("/w/DigiSmith", env)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/run/repo-info.test.ts packages/cli/src/run/identity-folder.test.ts`
Expected: FAIL. The modules are not found.

- [ ] **Step 3: Write the implementation**

`packages/cli/src/run/repo-info.ts`:

```ts
// packages/cli/src/run/repo-info.ts
// Project, root, branch and worktree of a cwd, read from the .git files. No git process: the hook must stay fast.
import * as fs from "node:fs";
import * as path from "node:path";

export type RepoInfo = { project: string; root: string | null; branch: string | null; worktree: string | null };

export function safeName(s: string): string {
  const t = s.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[^A-Za-z0-9]+/, "");
  return t === "" ? "unknown" : t;
}

function headBranch(gitDir: string): string | null {
  try {
    const m = /^ref: refs\/heads\/(.+?)\s*$/.exec(fs.readFileSync(path.join(gitDir, "HEAD"), "utf8"));
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export function repoInfo(cwd: unknown): RepoInfo {
  if (typeof cwd !== "string" || !path.isAbsolute(cwd)) return { project: "unknown", root: null, branch: null, worktree: null };
  let dir = path.resolve(cwd);
  for (;;) {
    const dotGit = path.join(dir, ".git");
    let st: fs.Stats | null = null;
    try { st = fs.statSync(dotGit); } catch { /* not here */ }
    if (st?.isDirectory()) return { project: safeName(path.basename(dir)), root: dir, branch: headBranch(dotGit), worktree: null };
    if (st?.isFile()) {
      try {
        const m = /^gitdir:\s*(.+?)\s*$/m.exec(fs.readFileSync(dotGit, "utf8"));
        if (m) {
          const gitDir = path.resolve(dir, m[1]);
          const wm = /^(.*)[\\/]\.git[\\/]worktrees[\\/][^\\/]+$/.exec(gitDir);
          const root = wm ? wm[1] : dir;
          return { project: safeName(path.basename(root)), root, branch: headBranch(gitDir), worktree: dir };
        }
      } catch { /* unreadable .git file: treat as no repo */ }
      return { project: safeName(path.basename(dir)), root: dir, branch: null, worktree: null };
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return { project: safeName(path.basename(path.resolve(cwd))), root: null, branch: null, worktree: null };
}

export function ticketOfBranch(branch: string | null): string | null {
  const m = branch === null ? null : /^([A-Z]+-\d+)__/.exec(branch);
  return m ? m[1] : null;
}
```

`packages/cli/src/run/identity-folder.ts`:

```ts
// packages/cli/src/run/identity-folder.ts
// Is this root the folder of exactly one Maestro identity card (DGS-411)? A line regex, no YAML parser: the hook must stay fast.
import * as fs from "node:fs";
import * as path from "node:path";
import { depotDir } from "./paths.ts";

const strip = (p: string): string => (p.length > 1 ? p.replace(/[\\/]+$/, "") : p);

export function maestroIdentityAt(root: string | null, env: NodeJS.ProcessEnv): boolean {
  if (root === null) return false;
  const dir = path.join(depotDir(env), "identities");
  let files: string[];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".yml")); } catch { return false; }
  let hits = 0;
  for (const f of files) {
    try {
      const m = /^folder:\s*(.+?)\s*$/m.exec(fs.readFileSync(path.join(dir, f), "utf8"));
      if (m && strip(m[1]) === strip(root)) hits++;
    } catch { /* unreadable card: not a match */ }
  }
  return hits === 1;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/run/repo-info.test.ts packages/cli/src/run/identity-folder.test.ts packages/cli/src/strip-types.smoke.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/run/repo-info.ts packages/cli/src/run/repo-info.test.ts packages/cli/src/run/identity-folder.ts packages/cli/src/run/identity-folder.test.ts
git commit -m "feat(run): read project, branch and maestro identity without git" -- packages/cli/src/run/repo-info.ts packages/cli/src/run/repo-info.test.ts packages/cli/src/run/identity-folder.ts packages/cli/src/run/identity-folder.test.ts
```

### Task 2: The role rule and the run record fields

**Files:**
- Create: `packages/cli/src/run/schema.ts`
- Create: `packages/cli/src/run/role.ts`
- Modify: `packages/cli/src/run/record.ts` (types and `MANIFEST`/`pluginVersion` move to `schema.ts`; `createRun` and `readRun` change; add `rewriteRun`)
- Modify: `packages/cli/src/run/index.ts` (the `--role` describe text only)
- Test: `packages/cli/src/run/role.test.ts`
- Test: `packages/cli/src/run/record.test.ts` (add cases)

**Interfaces:**
- Consumes: `repoInfo`, `RepoInfo` (Task 1).
- Produces (`schema.ts`):
  - `export const RUN_SCHEMA = "nightwatch-run/v1"`
  - `export const ROLES = ["builder", "reviewer", "scout", "maestro", "conductor", "other"] as const; export type Role = (typeof ROLES)[number]`
  - `export type RunSource = "auto" | "start"`
  - `export type RoleFrom = "herdr" | "identity" | "pending" | "none" | "start"`
  - `export type RunRecord` (the old fields, `ticket: string | null`, plus `source: RunSource; project: string | null; session_id: string | null; role_from: RoleFrom | null`)
  - `export function plainName(v: unknown): string | null` (the `NAME_RE` filter that `hook.ts` uses today)
  - `export function pluginVersion(): string | null`
- Produces (`role.ts`):
  - `export type RoleInput = { inHerdr: boolean; looked: boolean; agentName: string | null; maestroIdentity: boolean }`
  - `export function roleOf(i: RoleInput): { role: Role; role_from: RoleFrom }`
  - `export function ticketOfAgentName(name: string | null): string | null`
- Produces (`record.ts`): it re-exports `RUN_SCHEMA`, `ROLES`, `Role`, `RunRecord`. `readRun(dir): RunRecord` fills the defaults. `export function rewriteRun(runDir: string, record: RunRecord): void` writes through a temp file and a rename.

- [ ] **Step 1: Write the failing tests**

`packages/cli/src/run/role.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { roleOf, ticketOfAgentName } from "./role.ts";

const herdr = (agentName: string | null) => roleOf({ inHerdr: true, looked: true, agentName, maestroIdentity: false });

describe("roleOf", () => {
  it("outside herdr: maestro with one identity card, else other", () => {
    expect(roleOf({ inHerdr: false, looked: false, agentName: null, maestroIdentity: true })).toEqual({ role: "maestro", role_from: "identity" });
    expect(roleOf({ inHerdr: false, looked: false, agentName: null, maestroIdentity: false })).toEqual({ role: "other", role_from: "none" });
  });
  it("inside herdr before the labeller: other, pending", () => {
    expect(roleOf({ inHerdr: true, looked: false, agentName: null, maestroIdentity: true })).toEqual({ role: "other", role_from: "pending" });
  });
  it("applies the agent name table, first match wins", () => {
    expect(herdr("digismith-conductor")).toEqual({ role: "conductor", role_from: "herdr" });
    expect(herdr("main-conductor")).toEqual({ role: "conductor", role_from: "herdr" });
    expect(herdr("dgs-598-rev1")).toEqual({ role: "reviewer", role_from: "herdr" });
    expect(herdr("dgs-598-review")).toEqual({ role: "reviewer", role_from: "herdr" });
    expect(herdr("usage-scout")).toEqual({ role: "scout", role_from: "herdr" });
    expect(herdr("dgs-401-probe")).toEqual({ role: "scout", role_from: "herdr" });
    expect(herdr("dgs-598")).toEqual({ role: "builder", role_from: "herdr" });
    expect(herdr("emkt-9001")).toEqual({ role: "builder", role_from: "herdr" });
    expect(herdr("notes")).toEqual({ role: "other", role_from: "herdr" });
  });
  it("gives other, none when the pane has no agent entry", () => {
    expect(herdr(null)).toEqual({ role: "other", role_from: "none" });
  });
});

describe("ticketOfAgentName", () => {
  it("upper-cases a key-shaped name only", () => {
    expect(ticketOfAgentName("dgs-598")).toBe("DGS-598");
    expect(ticketOfAgentName("dgs-598-rev1")).toBeNull();
    expect(ticketOfAgentName("digismith-conductor")).toBeNull();
    expect(ticketOfAgentName(null)).toBeNull();
  });
});
```

Add to `packages/cli/src/run/record.test.ts` (keep every existing test; add the imports `rewriteRun`, `readRun` and `ROLES` if missing):

```ts
describe("DGS-598 fields", () => {
  it("dg run start writes source start, role_from start, session_id null and the project", () => {
    const r = createRun({ ticket: "DGS-598", role: "conductor", order: "/o.md" }, env);
    expect(r).toMatchObject({ source: "start", role_from: "start", session_id: null, role: "conductor" });
    expect(typeof r.project).toBe("string");
  });
  it("accepts maestro and conductor", () => {
    expect(ROLES).toEqual(["builder", "reviewer", "scout", "maestro", "conductor", "other"]);
    expect(createRun({ ticket: "DGS-598", role: "maestro", order: "/o.md" }, env).role).toBe("maestro");
  });
  it("readRun fills the new fields of an old record", () => {
    const dir = path.join(tmp, "runs", "DGS-1", "builder-old");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "run.json"), JSON.stringify({ schema: "nightwatch-run/v1", run: "builder-old", ticket: "DGS-1", role: "builder", order: null, seat: null, model: null, plugin_version: null, base_sha: null, branch: null, worktree: null, herdr: { workspace: null, tab: null, pane: null }, budget: null, created_at: "2026-10-20T00:00:00.000Z" }));
    expect(readRun(dir)).toMatchObject({ source: "start", project: null, session_id: null, role_from: null, ticket: "DGS-1" });
  });
  it("rewriteRun replaces run.json in one rename and leaves no temp file", () => {
    const r = createRun({ ticket: "DGS-598", role: "other", order: "/o.md" }, env);
    const dir = path.join(tmp, "runs", "DGS-598", r.run);
    rewriteRun(dir, { ...r, role: "builder" });
    expect(readRun(dir).role).toBe("builder");
    expect(fs.readdirSync(dir).filter((f) => f.startsWith("run.json."))).toEqual([]);
  });
});
```

(`record.test.ts` already has `tmp` and `env = { DIGISMITH_DEPOT_DIR: tmp }` in its `beforeEach`. If the names differ, use the file's own names.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/run/role.test.ts packages/cli/src/run/record.test.ts`
Expected: FAIL. `role.ts` is not found, and the new record fields are missing.

- [ ] **Step 3: Write the implementation**

`packages/cli/src/run/schema.ts`:

```ts
// packages/cli/src/run/schema.ts
// The run record types and the small helpers the hook path needs. node:fs and node:path only.
import * as fs from "node:fs";
import * as path from "node:path";

export const RUN_SCHEMA = "nightwatch-run/v1";
export const ROLES = ["builder", "reviewer", "scout", "maestro", "conductor", "other"] as const;
export type Role = (typeof ROLES)[number];
export type RunSource = "auto" | "start";
export type RoleFrom = "herdr" | "identity" | "pending" | "none" | "start";

export type RunRecord = {
  schema: typeof RUN_SCHEMA;
  run: string;
  ticket: string | null;
  role: Role;
  order: string | null;
  seat: string | null;
  model: string | null;
  plugin_version: string | null;
  base_sha: string | null;
  branch: string | null;
  worktree: string | null;
  herdr: { workspace: string | null; tab: string | null; pane: string | null };
  budget: Record<string, unknown> | null;
  created_at: string;
  source: RunSource;
  project: string | null;
  session_id: string | null;
  role_from: RoleFrom | null;
};

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;

// A name or id, or null. Anything with spaces or text in it is dropped.
export function plainName(v: unknown): string | null {
  return typeof v === "string" && NAME_RE.test(v) ? v : null;
}

const MANIFEST = path.join(import.meta.dirname, "..", "..", "..", "..", ".claude-plugin", "plugin.json");

export function pluginVersion(): string | null {
  try {
    const v = (JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as { version?: unknown }).version;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}
```

`packages/cli/src/run/role.ts`:

```ts
// packages/cli/src/run/role.ts
// THE role rule (DGS-598). Every caller uses roleOf; DGS-599 imports it. Type imports only, so the hook stays fast.
import type { Role, RoleFrom } from "./schema.ts";

export type RoleInput = { inHerdr: boolean; looked: boolean; agentName: string | null; maestroIdentity: boolean };

// looked: false in the hook (the herdr name is not read yet), true in the labeller.
export function roleOf(i: RoleInput): { role: Role; role_from: RoleFrom } {
  if (!i.inHerdr) return i.maestroIdentity ? { role: "maestro", role_from: "identity" } : { role: "other", role_from: "none" };
  if (!i.looked) return { role: "other", role_from: "pending" };
  const n = i.agentName;
  if (n === null) return { role: "other", role_from: "none" };
  if (n.endsWith("-conductor")) return { role: "conductor", role_from: "herdr" };
  if (n.includes("-rev")) return { role: "reviewer", role_from: "herdr" };
  if (n.includes("scout") || n.includes("probe")) return { role: "scout", role_from: "herdr" };
  if (/^[a-z]+-\d+$/.test(n)) return { role: "builder", role_from: "herdr" };
  return { role: "other", role_from: "herdr" };
}

export function ticketOfAgentName(name: string | null): string | null {
  return name !== null && /^[a-z]+-\d+$/.test(name) ? name.toUpperCase() : null;
}
```

`packages/cli/src/run/record.ts`:
1. Delete the local `RUN_SCHEMA`, `ROLES`, `Role`, `RunRecord`, `MANIFEST` and `pluginVersion`. Add:
   ```ts
   import { pluginVersion, ROLES, RUN_SCHEMA, type Role, type RunRecord } from "./schema.ts";
   import { repoInfo } from "./repo-info.ts";
   export { ROLES, RUN_SCHEMA };
   export type { Role, RunRecord };
   ```
2. In `createRun`, add these to `rest`:
   ```ts
   source: "start" as const,
   project: repoInfo(input.worktree ?? process.cwd()).project,
   session_id: null,
   role_from: "start" as const,
   ```
3. Replace `readRun` and add `rewriteRun`:
   ```ts
   const DEFAULTS = { source: "start", project: null, session_id: null, role_from: null } as const;

   // An old record has no source, project, session_id or role_from: they read as start, null, null, null.
   export function readRun(runDir: string): RunRecord {
     const raw = JSON.parse(fs.readFileSync(path.join(runDir, "run.json"), "utf8")) as RunRecord;
     return { ...DEFAULTS, ...raw };
   }

   // The labeller's one edit of an automatic run: a temp file, then an atomic rename, so a reader sees the old or the new file.
   export function rewriteRun(runDir: string, record: RunRecord): void {
     const tmp = path.join(runDir, `run.json.${process.pid}.tmp`);
     fs.writeFileSync(tmp, JSON.stringify(record, null, 2) + "\n");
     fs.renameSync(tmp, path.join(runDir, "run.json"));
   }
   ```
4. In `packages/cli/src/run/index.ts`, change the `--role` describe text to `"builder, reviewer, scout, maestro, conductor or other"`.
5. In `packages/cli/src/run/hook.ts`, replace its local `NAME_RE` and `name()` with `import { plainName } from "./schema.ts"`, and use `plainName` wherever `name(` was called. No behaviour change.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/run packages/cli/src/strip-types.smoke.test.ts`
Expected: PASS (every old run test too).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(run): add the role rule and the automatic run fields" -- packages/cli/src/run/schema.ts packages/cli/src/run/role.ts packages/cli/src/run/role.test.ts packages/cli/src/run/record.ts packages/cli/src/run/record.test.ts packages/cli/src/run/index.ts packages/cli/src/run/hook.ts
```

(Run `git add` on the two new files first.)

### Task 3: The run index and the automatic start

**Files:**
- Create: `packages/cli/src/run/run-index.ts`
- Create: `packages/cli/src/run/auto.ts`
- Test: `packages/cli/src/run/run-index.test.ts`
- Test: `packages/cli/src/run/auto.test.ts`

**Interfaces:**
- Consumes: `runsDir`, `depotDir`, `isSafe` (`paths.ts`); `readEvents` (`events.ts`); `repoInfo`, `ticketOfBranch` (Task 1); `maestroIdentityAt` (Task 1); `roleOf` (Task 2); `RUN_SCHEMA`, `RunRecord`, `plainName`, `pluginVersion` (`schema.ts`, Task 2).
- Produces (`run-index.ts`):
  - `export function indexDir(env: NodeJS.ProcessEnv): string` (`<runs>/.index`)
  - `export function writeSessionIndex(env, sessionId: string, rel: string): void` (`rel` = `<folder>/<run-id>`)
  - `export function readSessionIndex(env, sessionId: string): string | null` (an absolute run dir that has `run.json`, else null)
  - `export function writePidIndex(env, pid: string, rel: string, sessionId: string): void`
  - `export function readPidIndex(env, pid: string): { dir: string; session: string } | null`
- Produces (`auto.ts`):
  - `export type AutoRun = { dir: string; run: string; created: boolean; needsLabel: boolean }`
  - `export function startAuto(payload: Record<string, unknown>, env: NodeJS.ProcessEnv, now?: Date): AutoRun | null`
  - `export function findAuto(payload: Record<string, unknown>, env: NodeJS.ProcessEnv): { dir: string; run: string } | null`

- [ ] **Step 1: Write the failing tests**

`packages/cli/src/run/run-index.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { indexDir, readPidIndex, readSessionIndex, writePidIndex, writeSessionIndex } from "./run-index.ts";

let tmp: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-index-"));
  env = { DIGISMITH_DEPOT_DIR: tmp };
  fs.mkdirSync(path.join(tmp, "runs", "DigiSmith", "s-a1"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "runs", "DigiSmith", "s-a1", "run.json"), "{}");
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("run index", () => {
  it("maps a session to its run dir", () => {
    writeSessionIndex(env, "a1", "DigiSmith/s-a1");
    expect(readSessionIndex(env, "a1")).toBe(path.join(tmp, "runs", "DigiSmith", "s-a1"));
    expect(indexDir(env)).toBe(path.join(tmp, "runs", ".index"));
  });
  it("maps a claude pid to its run dir and last session", () => {
    writePidIndex(env, "4242", "DigiSmith/s-a1", "a1");
    expect(readPidIndex(env, "4242")).toEqual({ dir: path.join(tmp, "runs", "DigiSmith", "s-a1"), session: "a1" });
  });
  it("returns null for a missing entry, a run dir without run.json, or an unsafe value", () => {
    expect(readSessionIndex(env, "nope")).toBeNull();
    writeSessionIndex(env, "b2", "DigiSmith/s-gone");
    expect(readSessionIndex(env, "b2")).toBeNull();
    expect(readSessionIndex(env, "../x")).toBeNull();
    fs.mkdirSync(path.join(indexDir(env), "sessions"), { recursive: true });
    fs.writeFileSync(path.join(indexDir(env), "sessions", "c3"), "../../etc/passwd\n");
    expect(readSessionIndex(env, "c3")).toBeNull();
    expect(readPidIndex(env, "abc")).toBeNull();
  });
});
```

`packages/cli/src/run/auto.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { findAuto, startAuto } from "./auto.ts";
import { appendEvent } from "./events.ts";
import { readRun } from "./record.ts";

let tmp: string;
let depot: string;
let repo: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "nw-auto-")));
  depot = path.join(tmp, "depot");
  fs.mkdirSync(depot);
  repo = path.join(tmp, "DigiSmith");
  fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
  fs.writeFileSync(path.join(repo, ".git", "HEAD"), "ref: refs/heads/main\n");
  env = { DIGISMITH_DEPOT_DIR: depot, CLAUDE_PID: "4242" };
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const start = (p: Record<string, unknown>, e: NodeJS.ProcessEnv = env) => startAuto({ cwd: repo, ...p }, e, new Date("2026-10-24T05:00:00Z"));

describe("startAuto", () => {
  it("makes a new run under the project with id s-<session_id>", () => {
    const a = start({ session_id: "sid-1", source: "startup", model: "claude-opus-5-5" })!;
    expect(a).toMatchObject({ run: "s-sid-1", created: true, needsLabel: false });
    expect(a.dir).toBe(path.join(depot, "runs", "DigiSmith", "s-sid-1"));
    expect(readRun(a.dir)).toMatchObject({
      schema: "nightwatch-run/v1", run: "s-sid-1", ticket: null, role: "other", role_from: "none", source: "auto",
      project: "DigiSmith", session_id: "sid-1", order: null, budget: null, base_sha: null, branch: "main",
      worktree: null, model: "claude-opus-5-5", created_at: "2026-10-24T05:00:00.000Z", herdr: { workspace: null, tab: null, pane: null },
    });
    expect(findAuto({ session_id: "sid-1" }, env)).toEqual({ dir: a.dir, run: "s-sid-1" });
  });
  it("files a run under the ticket when the branch names one", () => {
    fs.writeFileSync(path.join(repo, ".git", "HEAD"), "ref: refs/heads/DGS-7__thing\n");
    const a = start({ session_id: "sid-2", source: "startup" })!;
    expect(a.dir).toBe(path.join(depot, "runs", "DGS-7", "s-sid-2"));
    expect(readRun(a.dir).ticket).toBe("DGS-7");
  });
  it("gives maestro outside herdr when one identity card names the repo", () => {
    fs.mkdirSync(path.join(depot, "identities"));
    fs.writeFileSync(path.join(depot, "identities", "m.yml"), `folder: ${repo}\n`);
    expect(readRun(start({ session_id: "sid-3", source: "startup" })!.dir)).toMatchObject({ role: "maestro", role_from: "identity" });
  });
  it("inside herdr: other, pending, the herdr fields, and needsLabel", () => {
    const a = start({ session_id: "sid-4", source: "startup" }, { ...env, HERDR_PANE_ID: "w2:p8W", HERDR_TAB_ID: "w2:t8W", HERDR_WORKSPACE_ID: "w2" })!;
    expect(a.needsLabel).toBe(true);
    expect(readRun(a.dir)).toMatchObject({ role: "other", role_from: "pending", herdr: { workspace: "w2", tab: "w2:t8W", pane: "w2:p8W" } });
  });
  it("a resume (same session_id) continues the run", () => {
    const a = start({ session_id: "sid-5", source: "startup" })!;
    expect(start({ session_id: "sid-5", source: "resume" })).toEqual({ dir: a.dir, run: "s-sid-5", created: false, needsLabel: false });
  });
  it("a /clear in the same claude process continues the run", () => {
    const a = start({ session_id: "sid-6", source: "startup" })!;
    appendEvent(a.dir, a.run, "ended", { reason: "clear", session_id: "sid-6" }, 2000);
    const b = start({ session_id: "sid-6b", source: "clear" })!;
    expect(b).toEqual({ dir: a.dir, run: "s-sid-6", created: false, needsLabel: false });
    expect(findAuto({ session_id: "sid-6b" }, env)?.run).toBe("s-sid-6");
  });
  it("a /clear after an ended with another reason, or in another process, is a new run", () => {
    const a = start({ session_id: "sid-7", source: "startup" })!;
    appendEvent(a.dir, a.run, "ended", { reason: "logout", session_id: "sid-7" }, 2000);
    expect(start({ session_id: "sid-7b", source: "clear" })!.run).toBe("s-sid-7b");
    expect(start({ session_id: "sid-7c", source: "clear" }, { ...env, CLAUDE_PID: "9999" })!.run).toBe("s-sid-7c");
  });
  it("does nothing without a safe session_id or without a depot folder", () => {
    expect(start({ source: "startup" })).toBeNull();
    expect(start({ session_id: "has space" })).toBeNull();
    expect(start({ session_id: "sid-8" }, { DIGISMITH_DEPOT_DIR: path.join(tmp, "no-depot") })).toBeNull();
    expect(fs.existsSync(path.join(tmp, "no-depot"))).toBe(false);
  });
  it("keeps prompt text and other payload fields out of run.json", () => {
    const a = start({ session_id: "sid-9", source: "startup", prompt: "SECRET-PROMPT", transcript_path: "/x/SECRET" })!;
    expect(fs.readFileSync(path.join(a.dir, "run.json"), "utf8")).not.toMatch(/SECRET/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/run/run-index.test.ts packages/cli/src/run/auto.test.ts`
Expected: FAIL. The modules are not found.

- [ ] **Step 3: Write the implementation**

`packages/cli/src/run/run-index.ts`:

```ts
// packages/cli/src/run/run-index.ts
// runs/.index/sessions/<session_id> and runs/.index/pids/<claude pid>: how the hooks of an automatic run find it.
import * as fs from "node:fs";
import * as path from "node:path";
import { isSafe, runsDir } from "./paths.ts";

export function indexDir(env: NodeJS.ProcessEnv): string {
  return path.join(runsDir(env), ".index");
}

// "<folder>/<run-id>" to an absolute run dir, or null when the value is unsafe or the run has no run.json.
function resolveRel(env: NodeJS.ProcessEnv, rel: string): string | null {
  const parts = rel.split("/");
  if (parts.length !== 2 || !parts.every(isSafe)) return null;
  const dir = path.join(runsDir(env), parts[0], parts[1]);
  return fs.existsSync(path.join(dir, "run.json")) ? dir : null;
}

function write(env: NodeJS.ProcessEnv, kind: string, key: string, text: string): void {
  const dir = path.join(indexDir(env), kind);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, key), text + "\n");
}

function read(env: NodeJS.ProcessEnv, kind: string, key: string): string | null {
  if (!isSafe(key)) return null;
  try { return fs.readFileSync(path.join(indexDir(env), kind, key), "utf8").trim(); } catch { return null; }
}

export function writeSessionIndex(env: NodeJS.ProcessEnv, sessionId: string, rel: string): void {
  write(env, "sessions", sessionId, rel);
}

export function readSessionIndex(env: NodeJS.ProcessEnv, sessionId: string): string | null {
  const rel = read(env, "sessions", sessionId);
  return rel === null ? null : resolveRel(env, rel);
}

export function writePidIndex(env: NodeJS.ProcessEnv, pid: string, rel: string, sessionId: string): void {
  write(env, "pids", pid, `${rel} ${sessionId}`);
}

export function readPidIndex(env: NodeJS.ProcessEnv, pid: string): { dir: string; session: string } | null {
  if (!/^\d+$/.test(pid)) return null;
  const line = read(env, "pids", pid);
  if (line === null) return null;
  const [rel, session] = line.split(" ");
  const dir = rel ? resolveRel(env, rel) : null;
  return dir && session && isSafe(session) ? { dir, session } : null;
}
```

`packages/cli/src/run/auto.ts`:

```ts
// packages/cli/src/run/auto.ts
// Automatic runs (DGS-598): a session without DIGISMITH_RUN_ID is a run. node:fs and node:path only.
import * as fs from "node:fs";
import * as path from "node:path";
import { readEvents } from "./events.ts";
import { maestroIdentityAt } from "./identity-folder.ts";
import { depotDir, isSafe, runsDir } from "./paths.ts";
import { repoInfo, ticketOfBranch } from "./repo-info.ts";
import { roleOf } from "./role.ts";
import { readPidIndex, readSessionIndex, writePidIndex, writeSessionIndex } from "./run-index.ts";
import { plainName, pluginVersion, RUN_SCHEMA, type RunRecord } from "./schema.ts";

export type AutoRun = { dir: string; run: string; created: boolean; needsLabel: boolean };

const sessionOf = (p: Record<string, unknown>): string | null => {
  const s = plainName(p.session_id);
  return s !== null && isSafe(s) ? s : null;
};
const relOf = (dir: string): string => `${path.basename(path.dirname(dir))}/${path.basename(dir)}`;
const env1 = (v: string | undefined): string | null => plainName(v);

// A /clear may continue the run of this claude process when that run is still open or ended for the clear.
function continuable(dir: string): boolean {
  const ev = readEvents(dir);
  const types = ev.map((e) => e.type);
  const lastEnded = types.lastIndexOf("ended");
  if (lastEnded <= types.lastIndexOf("started")) return true;
  return ev[lastEnded].data.reason === "clear";
}

export function startAuto(payload: Record<string, unknown>, env: NodeJS.ProcessEnv, now: Date = new Date()): AutoRun | null {
  const sid = sessionOf(payload);
  if (sid === null || !fs.existsSync(depotDir(env))) return null;
  const known = readSessionIndex(env, sid);
  if (known) return { dir: known, run: path.basename(known), created: false, needsLabel: false };
  const pid = env.CLAUDE_PID && /^\d+$/.test(env.CLAUDE_PID) ? env.CLAUDE_PID : null;
  if (payload.source === "clear" && pid) {
    const prev = readPidIndex(env, pid);
    if (prev && continuable(prev.dir)) {
      writeSessionIndex(env, sid, relOf(prev.dir));
      writePidIndex(env, pid, relOf(prev.dir), sid);
      return { dir: prev.dir, run: path.basename(prev.dir), created: false, needsLabel: false };
    }
  }
  const info = repoInfo(payload.cwd);
  const ticket = ticketOfBranch(info.branch);
  const inHerdr = Boolean(env.HERDR_PANE_ID);
  const r = roleOf({ inHerdr, looked: false, agentName: null, maestroIdentity: !inHerdr && maestroIdentityAt(info.root, env) });
  const run = `s-${sid}`;
  const folder = ticket ?? info.project;
  const dir = path.join(runsDir(env), folder, run);
  const record: RunRecord = {
    schema: RUN_SCHEMA, run, ticket, role: r.role, order: null,
    seat: env1(env.DIGISMITH_SEAT), model: plainName(payload.model), plugin_version: pluginVersion(),
    base_sha: null, branch: info.branch, worktree: info.worktree,
    herdr: { workspace: env1(env.HERDR_WORKSPACE_ID), tab: env1(env.HERDR_TAB_ID), pane: env1(env.HERDR_PANE_ID) },
    budget: null, created_at: now.toISOString(),
    source: "auto", project: info.project, session_id: sid, role_from: r.role_from,
  };
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  let created = true;
  try {
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "run.json"), JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    created = false; // a second SessionStart of the same session raced us: continue its run
  }
  writeSessionIndex(env, sid, relOf(dir));
  if (pid) writePidIndex(env, pid, relOf(dir), sid);
  return { dir, run, created, needsLabel: created && r.role_from === "pending" };
}

export function findAuto(payload: Record<string, unknown>, env: NodeJS.ProcessEnv): { dir: string; run: string } | null {
  const sid = sessionOf(payload);
  const dir = sid === null ? null : readSessionIndex(env, sid);
  return dir ? { dir, run: path.basename(dir) } : null;
}
```

Note: `plainName` allows `:`, but `isSafe` does not. A session_id must pass both, so a session index file name is always safe.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/run packages/cli/src/strip-types.smoke.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/run/run-index.ts packages/cli/src/run/run-index.test.ts packages/cli/src/run/auto.ts packages/cli/src/run/auto.test.ts
git commit -m "feat(run): start and continue automatic runs from the session id" -- packages/cli/src/run/run-index.ts packages/cli/src/run/run-index.test.ts packages/cli/src/run/auto.ts packages/cli/src/run/auto.test.ts
```

### Task 4: The hook's automatic path and the herdr labeller

**Files:**
- Create: `packages/cli/src/run/label.ts`
- Create: `packages/cli/src/run/label-cli.ts`
- Modify: `packages/cli/src/run/hook.ts`
- Test: `packages/cli/src/run/label.test.ts`
- Test: `packages/cli/src/run/hook.test.ts` (add an automatic-run block; change the "writes nothing without DIGISMITH_RUN_ID" test)

**Interfaces:**
- Consumes: `startAuto`, `findAuto` (Task 3); `roleOf`, `ticketOfAgentName` (Task 2); `readRun`, `rewriteRun` (Task 2); `depotDir` (`paths.ts`).
- Produces:
  - `hook.ts`: `export function logError(kind: string, message: string, env: NodeJS.ProcessEnv): void` (was private). `runHook(kind, stdin, env)` keeps its signature.
  - `label.ts`: `export type AgentEntry = { name: string; pane_id: string; tab_id: string | null; workspace_id: string | null }`, `export function parseAgentList(stdout: string): AgentEntry[]`, `export type ListAgents = (workspace: string) => string`, `export function defaultListAgents(env: NodeJS.ProcessEnv): ListAgents`, `export function labelRun(dir: string, env: NodeJS.ProcessEnv, list?: ListAgents): void`.
  - `label-cli.ts`: `node --experimental-strip-types label-cli.ts <run-dir>`. It always exits 0 and prints nothing.

- [ ] **Step 1: Write the failing tests**

`packages/cli/src/run/label.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { labelRun, parseAgentList, defaultListAgents } from "./label.ts";
import { startAuto } from "./auto.ts";
import { readRun } from "./record.ts";

const LIST = JSON.stringify({ id: "cli:agent:list", result: { agents: [
  { agent: "claude", name: "digismith-conductor", pane_id: "w2:p1", tab_id: "w2:t1", workspace_id: "w2", cwd: "/SECRET", terminal_title: "SECRET" },
  { agent: "claude", name: "dgs-598", pane_id: "w2:p8W", tab_id: "w2:t8W", workspace_id: "w2" },
] } });

let tmp: string;
let env: NodeJS.ProcessEnv;
let dir: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-label-"));
  env = { DIGISMITH_DEPOT_DIR: tmp, HERDR_PANE_ID: "w2:p8W", HERDR_WORKSPACE_ID: "w2" };
  dir = startAuto({ session_id: "sid-1", source: "startup", cwd: "/nowhere/DigiSmith" }, env)!.dir;
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("parseAgentList", () => {
  it("keeps four fields of each agent", () => {
    expect(parseAgentList(LIST)).toEqual([
      { name: "digismith-conductor", pane_id: "w2:p1", tab_id: "w2:t1", workspace_id: "w2" },
      { name: "dgs-598", pane_id: "w2:p8W", tab_id: "w2:t8W", workspace_id: "w2" },
    ]);
    expect(parseAgentList("not json")).toEqual([]);
  });
});

describe("labelRun", () => {
  it("sets the role and the ticket from this pane's agent name", () => {
    labelRun(dir, env, (ws) => { expect(ws).toBe("w2"); return LIST; });
    expect(readRun(dir)).toMatchObject({ role: "builder", role_from: "herdr", ticket: "DGS-598" });
    expect(fs.readFileSync(path.join(dir, "run.json"), "utf8")).not.toMatch(/SECRET/);
  });
  it("gives other, none when the pane is not listed", () => {
    labelRun(dir, env, () => JSON.stringify({ result: { agents: [] } }));
    expect(readRun(dir)).toMatchObject({ role: "other", role_from: "none", ticket: null });
  });
  it("on a failure: role_from none and one log line", () => {
    labelRun(dir, env, () => { throw new Error("timeout"); });
    expect(readRun(dir)).toMatchObject({ role: "other", role_from: "none" });
    expect(fs.readFileSync(path.join(tmp, "runs", "hook-errors.log"), "utf8")).toMatch(/label .*timeout/);
  });
  it("leaves a run alone when it is not pending", () => {
    labelRun(dir, env, () => LIST);
    labelRun(dir, env, () => { throw new Error("must not be called"); });
    expect(readRun(dir).role).toBe("builder");
  });
  it("runs the fake herdr-ws given by NIGHTWATCH_HERDR_WS, with HERDR_WS set", () => {
    const fake = path.join(tmp, "herdr-ws");
    fs.writeFileSync(fake, `#!/bin/sh\n[ "$HERDR_WS" = w2 ] && [ "$1 $2" = "agent list" ] && cat <<'EOF'\n${LIST}\nEOF\n`, { mode: 0o755 });
    expect(parseAgentList(defaultListAgents({ ...env, NIGHTWATCH_HERDR_WS: fake })("w2"))).toHaveLength(2);
  });
});
```

Add to `packages/cli/src/run/hook.test.ts`:

1. Replace the test `"writes nothing without DIGISMITH_RUN_ID"` with this one. It keeps the old point: no session_id means nothing is written.
   ```ts
   it("writes nothing without DIGISMITH_RUN_ID when the payload has no session_id", () => {
     const before = fs.readdirSync(path.join(runsDir(env), "DGS-581", run));
     runHook("started", "{}", { DIGISMITH_DEPOT_DIR: tmp });
     runHook("started", "{}", { DIGISMITH_DEPOT_DIR: tmp, DIGISMITH_RUN_ID: "" });
     expect(fs.readdirSync(path.join(runsDir(env), "DGS-581", run))).toEqual(before);
     expect(fs.readdirSync(runsDir(env))).toEqual(["DGS-581"]);
     expect(fs.existsSync(path.join(runsDir(env), "hook-errors.log"))).toBe(false);
   });
   ```
2. Add a new block at the end:
   ```ts
   describe("automatic runs (no DIGISMITH_RUN_ID)", () => {
     const auto = (): NodeJS.ProcessEnv => ({ DIGISMITH_DEPOT_DIR: tmp, CLAUDE_PID: "777" });
     it("SessionStart makes the run; the other kinds find it by session_id", () => {
       const e = auto();
       runHook("started", JSON.stringify({ session_id: "sa", source: "startup", cwd: "/nowhere/Proj", prompt: "SECRET" }), e);
       runHook("tool", JSON.stringify({ session_id: "sa", tool_name: "Bash", tool_input: { command: "SECRET" } }), e);
       runHook("blocked", JSON.stringify({ session_id: "sa", notification_type: "permission_prompt", message: "SECRET" }), e);
       runHook("turn_end", JSON.stringify({ session_id: "sa" }), e);
       runHook("ended", JSON.stringify({ session_id: "sa", reason: "other" }), e);
       const dir = findRunDir("s-sa", e)!;
       expect(dir).toBe(path.join(tmp, "runs", "Proj", "s-sa"));
       expect(readEvents(dir).map((x) => x.type)).toEqual(["started", "tool", "blocked", "turn_end", "ended"]);
       for (const f of fs.readdirSync(dir)) if (f !== "lock") expect(fs.readFileSync(path.join(dir, f), "utf8")).not.toMatch(/SECRET/);
     });
     it("a resume appends a second started to the same run", () => {
       const e = auto();
       runHook("started", JSON.stringify({ session_id: "sb", source: "startup", cwd: "/nowhere/Proj" }), e);
       runHook("started", JSON.stringify({ session_id: "sb", source: "resume", cwd: "/nowhere/Proj" }), e);
       expect(readEvents(findRunDir("s-sb", e)!).map((x) => x.data.source)).toEqual(["startup", "resume"]);
     });
     it("a tool event with an unknown session_id writes nothing", () => {
       runHook("tool", JSON.stringify({ session_id: "zz", tool_name: "Bash" }), auto());
       expect(fs.readdirSync(runsDir(env))).toEqual(["DGS-581"]);
     });
     it("an explicit DIGISMITH_RUN_ID wins: no automatic run, no index", () => {
       runHook("started", JSON.stringify({ session_id: "sc", source: "startup", cwd: "/nowhere/Proj" }), { ...env, CLAUDE_PID: "777" });
       expect(events()).toHaveLength(1);
       expect(fs.readdirSync(runsDir(env))).toEqual(["DGS-581"]);
     });
     it("inside herdr it starts the labeller, which sets the role", async () => {
       const fake = path.join(tmp, "herdr-ws");
       const list = JSON.stringify({ result: { agents: [{ name: "main-conductor", pane_id: "w2:p5Q", tab_id: "w2:t5Q", workspace_id: "w2" }] } });
       fs.writeFileSync(fake, `#!/bin/sh\ncat <<'EOF'\n${list}\nEOF\n`, { mode: 0o755 });
       const e = { ...auto(), HERDR_PANE_ID: "w2:p5Q", HERDR_WORKSPACE_ID: "w2", NIGHTWATCH_HERDR_WS: fake };
       runHook("started", JSON.stringify({ session_id: "sd", source: "startup", cwd: "/nowhere/Proj" }), e);
       const dir = findRunDir("s-sd", e)!;
       const deadline = Date.now() + 10_000;
       while (readRun(dir).role_from === "pending" && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
       expect(readRun(dir)).toMatchObject({ role: "conductor", role_from: "herdr" });
     }, 15_000);
   });
   ```
   Add `import { readRun } from "./record.ts";` to the imports.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/run/label.test.ts packages/cli/src/run/hook.test.ts`
Expected: FAIL. `label.ts` is not found, and the automatic-run tests fail.

- [ ] **Step 3: Write the implementation**

`packages/cli/src/run/label.ts`:

```ts
// packages/cli/src/run/label.ts
// The herdr labeller (DGS-598): reads this pane's agent name once from herdr-ws (read-only) and sets the role of an
// automatic run. Keeps name, pane_id, tab_id and workspace_id; drops the rest of the list (cwd, titles). Never throws.
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { logError } from "./hook.ts";
import { depotDir } from "./paths.ts";
import { readRun, rewriteRun } from "./record.ts";
import { roleOf, ticketOfAgentName } from "./role.ts";

export type AgentEntry = { name: string; pane_id: string; tab_id: string | null; workspace_id: string | null };
export type ListAgents = (workspace: string) => string;

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function parseAgentList(stdout: string): AgentEntry[] {
  let v: unknown;
  try { v = JSON.parse(stdout); } catch { return []; }
  const agents = (v as { result?: { agents?: unknown } } | null)?.result?.agents;
  if (!Array.isArray(agents)) return [];
  const out: AgentEntry[] = [];
  for (const a of agents) {
    const o = (a ?? {}) as Record<string, unknown>;
    const name = str(o.name), pane = str(o.pane_id);
    if (name !== null && pane !== null) out.push({ name, pane_id: pane, tab_id: str(o.tab_id), workspace_id: str(o.workspace_id) });
  }
  return out;
}

export function defaultListAgents(env: NodeJS.ProcessEnv): ListAgents {
  const bin = env.NIGHTWATCH_HERDR_WS || path.join(depotDir(env), "bin", "herdr-ws");
  return (workspace) => execFileSync(bin, ["agent", "list"], { env: { ...env, HERDR_WS: workspace }, timeout: 3000, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

export function labelRun(dir: string, env: NodeJS.ProcessEnv, list: ListAgents = defaultListAgents(env)): void {
  try {
    const record = readRun(dir);
    if (record.role_from !== "pending") return;
    const pane = record.herdr.pane;
    let entry: AgentEntry | undefined;
    if (pane !== null) {
      try {
        entry = parseAgentList(list(pane.split(":")[0])).find((e) => e.pane_id === pane);
      } catch (e) {
        logError("label", (e as Error).message, env);
      }
    }
    const r = roleOf({ inHerdr: true, looked: true, agentName: entry?.name ?? null, maestroIdentity: false });
    rewriteRun(dir, { ...record, role: r.role, role_from: r.role_from, ticket: record.ticket ?? ticketOfAgentName(entry?.name ?? null) });
  } catch (e) {
    logError("label", (e as Error).message, env);
  }
}
```

`packages/cli/src/run/label-cli.ts`:

```ts
// Detached labeller entry (DGS-598): node label-cli.ts <run-dir>. Started by the SessionStart hook; always exits 0, prints nothing.
import { labelRun } from "./label.ts";

const dir = process.argv[2];
if (dir) labelRun(dir, process.env);
process.exitCode = 0;
```

`packages/cli/src/run/hook.ts`, changes:
1. Make `logError` exported: `export function logError(...)`.
2. Add the imports and the spawn helper:
   ```ts
   import { findAuto, startAuto } from "./auto.ts";

   const LABEL_CLI = path.join(import.meta.dirname, "label-cli.ts");

   // Starts the labeller and returns at once; child_process is loaded only here.
   function spawnLabeller(dir: string, env: NodeJS.ProcessEnv): void {
     const cp = process.getBuiltinModule("node:child_process") as typeof import("node:child_process");
     cp.spawn(process.execPath, ["--experimental-strip-types", LABEL_CLI, dir], { detached: true, stdio: "ignore", env }).unref();
   }
   ```
3. Replace `runHook` with this:
   ```ts
   export function runHook(kind: string, stdin: string, env: NodeJS.ProcessEnv = process.env): void {
     try {
       if (!(HOOK_TYPES as readonly string[]).includes(kind)) return;
       const k = kind as HookKind;
       let payload: unknown = {};
       try {
         payload = JSON.parse(stdin || "{}");
       } catch {
         /* not JSON: the event is still written, with empty data */
       }
       const p = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
       let target: { dir: string; run: string } | null;
       let label = false;
       const id = env.DIGISMITH_RUN_ID;
       if (id) {
         // An explicit run id wins (DGS-581): no automatic run, no index.
         if (!isSafe(id)) return;
         const dir = findRunDir(id, env);
         target = dir ? { dir, run: id } : null;
       } else if (k === "started") {
         const a = startAuto(p, env);
         target = a;
         label = a?.needsLabel ?? false;
       } else {
         target = findAuto(p, env);
       }
       if (!target) return;
       try {
         appendEvent(target.dir, target.run, k, buildData(k, payload), waitFor(k));
       } catch (e) {
         logError(k, (e as Error).message, env);
       }
       if (label) spawnLabeller(target.dir, env);
     } catch (e) {
       logError(kind, (e as Error).message, env);
     }
   }
   ```
4. Update the file header comment: "Imports node:fs, node:os and node:path (through the run modules); node:child_process only lazily, to start the labeller. No yargs, no git."

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/run scripts/run-events packages/cli/src/strip-types.smoke.test.ts`
Expected: the `packages/cli/src/run` tests and the smoke test PASS. Two `scripts/run-events` tests still expect the old behaviour: the hooks.json guard test and the end-to-end "writes nothing" test. They may fail now, and Task 5 changes them. Note which ones fail.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/run/label.ts packages/cli/src/run/label-cli.ts packages/cli/src/run/label.test.ts
git commit -m "feat(run): record sessions without a run id and label herdr panes" -- packages/cli/src/run/label.ts packages/cli/src/run/label-cli.ts packages/cli/src/run/label.test.ts packages/cli/src/run/hook.ts packages/cli/src/run/hook.test.ts
```

### Task 5: The hooks.json guard, the compile cache, the timing test and the README

**Files:**
- Modify: `hooks/hooks.json` (the five `run-events/hook-cli.ts` commands)
- Modify: `scripts/run-events/hooks-json.test.ts`
- Modify: `scripts/run-events/end-to-end.test.ts`
- Create: `scripts/run-events/hook-timing.test.ts`
- Modify: `packages/cli/src/run/README.md`

**Interfaces:**
- Consumes: the hook from Task 4.
- Produces: the hook command line. Every later test that fires a hook uses it through `hooks/hooks.json`.

- [ ] **Step 1: Write the failing tests**

In `scripts/run-events/hooks-json.test.ts`, replace the first and third `it` blocks:

```ts
  const GUARD = 'D="${DIGISMITH_DEPOT_DIR:-$HOME/.digismith-depot}"; [ -n "$DIGISMITH_RUN_ID" ] || [ -d "$D" ] || exit 0; NODE_COMPILE_CACHE="$D/runs/.index/node-cache" node --experimental-strip-types ';
  it("has the five run commands, each with the depot guard and the compile cache", () => {
    for (const [event, kind] of Object.entries(EXPECTED)) {
      const c = commandFor(event);
      expect(c.startsWith(GUARD)).toBe(true);
      expect(c.endsWith(`/scripts/run-events/hook-cli.ts" ${kind}`)).toBe(true);
    }
  });
  it("starts no node process when DIGISMITH_RUN_ID is unset and there is no depot folder, and exits 0", () => {
    for (const event of Object.keys(EXPECTED)) {
      expect(sh(commandFor(event), {}).status).toBe(0);
      expect(sh(commandFor(event), { DIGISMITH_RUN_ID: "" }).status).toBe(0);
    }
    expect(fs.existsSync(shimLog)).toBe(false);
    expect(fs.existsSync(path.join(tmp, "depot"))).toBe(false);
  });
  it("records a session without DIGISMITH_RUN_ID when the depot exists", () => {
    const depot = path.join(tmp, "depot");
    fs.mkdirSync(depot);
    const r = sh(commandFor("SessionStart"), {}, JSON.stringify({ session_id: "auto-1", source: "startup", cwd: tmp }));
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    const dir = findRunDir("s-auto-1", { DIGISMITH_DEPOT_DIR: depot })!;
    expect(readEvents(dir).map((e) => e.type)).toEqual(["started"]);
    expect(fs.existsSync(path.join(depot, "runs", ".index", "node-cache"))).toBe(true);
  });
```

In `scripts/run-events/end-to-end.test.ts`, replace `"a session without DIGISMITH_RUN_ID writes nothing"` with:

```ts
  it("a session without DIGISMITH_RUN_ID is an automatic run: started, tools, /clear, resume, end", () => {
    const env = { ...base(), CLAUDE_PID: "31337" };
    const cwd = path.join(tmp, "Proj");
    fs.mkdirSync(cwd);
    fire("SessionStart", env, { session_id: "e1", source: "startup", cwd });
    fire("PostToolUse", env, { session_id: "e1", tool_name: "Read", tool_response: {} });
    fire("SessionEnd", env, { session_id: "e1", reason: "clear" });
    fire("SessionStart", env, { session_id: "e2", source: "clear", cwd });
    fire("Stop", env, { session_id: "e2" });
    fire("SessionStart", env, { session_id: "e2", source: "resume", cwd });
    fire("SessionEnd", env, { session_id: "e2", reason: "other" });
    const lines = tailEvents("s-e1", 0, env)!;
    expect(lines.map((e) => e.type)).toEqual(["started", "tool", "ended", "started", "turn_end", "started", "ended"]);
    expect(showRun("s-e1", env)!.record).toMatchObject({ source: "auto", project: "Proj", role: "other" });
    expect(showRun("s-e2", env)).toBeNull();
  });
  it("a session without a session_id writes nothing", () => {
    const env = base();
    for (const e of ["SessionStart", "PostToolUse", "Notification", "Stop", "SessionEnd"]) expect(fire(e, env, { source: "startup" }).status).toBe(0);
    const runs = path.join(tmp, "runs");
    const folders = fs.existsSync(runs) ? fs.readdirSync(runs).filter((n) => !n.startsWith(".")) : [];
    expect(folders).toEqual([]); // only runs/.index (the compile cache) may exist
  });
```

Create `scripts/run-events/hook-timing.test.ts`:

```ts
// scripts/run-events/hook-timing.test.ts
// DGS-598 cost rule: each run-event hook stays under 100 ms (median of 7 real calls through the hooks.json command).
// NIGHTWATCH_TIMING=report prints the numbers without failing (for a loaded machine).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.join(import.meta.dirname, "..", "..");
const hooks = JSON.parse(fs.readFileSync(path.join(ROOT, "hooks", "hooks.json"), "utf8")).hooks as Record<string, { hooks: { command: string }[] }[]>;
const cmd = (event: string) => hooks[event].flatMap((g) => g.hooks.map((h) => h.command)).find((c) => c.includes("run-events/hook-cli.ts"))!;

let tmp: string;
let env: NodeJS.ProcessEnv;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nw-timing-"));
  // a slow fake herdr-ws: the hook must not wait for the labeller
  const fake = path.join(tmp, "herdr-ws");
  fs.writeFileSync(fake, "#!/bin/sh\nsleep 1\necho '{\"result\":{\"agents\":[]}}'\n", { mode: 0o755 });
  env = { ...process.env, DIGISMITH_DEPOT_DIR: path.join(tmp, "depot"), CLAUDE_PLUGIN_ROOT: ROOT, CLAUDE_PID: "1",
    HERDR_PANE_ID: "w9:p1", HERDR_WORKSPACE_ID: "w9", NIGHTWATCH_HERDR_WS: fake };
  delete env.DIGISMITH_RUN_ID;
  fs.mkdirSync(env.DIGISMITH_DEPOT_DIR!);
});
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 1500)); // let the detached labellers (fake herdr sleeps 1 s) finish
  fs.rmSync(tmp, { recursive: true, force: true });
});

function ms(event: string, payload: object): number {
  const t0 = performance.now();
  const r = spawnSync("sh", ["-c", cmd(event)], { input: JSON.stringify(payload), env, encoding: "utf8" });
  const t = performance.now() - t0;
  expect(r.status).toBe(0);
  return t;
}
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe("run-event hook timing", () => {
  it("SessionStart (new run, labeller spawned) and PostToolUse stay under 100 ms (median of 7)", () => {
    ms("SessionStart", { session_id: "warm", source: "startup", cwd: tmp }); // fills the compile cache
    const start = Array.from({ length: 7 }, (_, i) => ms("SessionStart", { session_id: `t${i}`, source: "startup", cwd: tmp }));
    const tool = Array.from({ length: 7 }, () => ms("PostToolUse", { session_id: "t0", tool_name: "Bash", tool_response: {} }));
    console.log(`hook timing: SessionStart median ${median(start).toFixed(0)} ms, PostToolUse median ${median(tool).toFixed(0)} ms`);
    if (process.env.NIGHTWATCH_TIMING === "report") return;
    expect(median(start)).toBeLessThan(100);
    expect(median(tool)).toBeLessThan(100);
  }, 60_000);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/run-events`
Expected: FAIL. The guard prefix does not match, the hooks.json command still skips automatic runs, and the timing test runs no node because of the old guard.

- [ ] **Step 3: Write the implementation**

In `hooks/hooks.json`, replace each of the five commands that contain `run-events/hook-cli.ts`. Use the same text with its own kind (`started`, `blocked`, `tool`, `turn_end`, `ended`) at the end:

```json
"command": "D=\"${DIGISMITH_DEPOT_DIR:-$HOME/.digismith-depot}\"; [ -n \"$DIGISMITH_RUN_ID\" ] || [ -d \"$D\" ] || exit 0; NODE_COMPILE_CACHE=\"$D/runs/.index/node-cache\" node --experimental-strip-types \"${CLAUDE_PLUGIN_ROOT}/scripts/run-events/hook-cli.ts\" started"
```

Change no other command in the file.

In `scripts/run-events/hook-cli.ts`, change the second header line to: "Always exits 0 and prints nothing. The shell in hooks.json has already checked for DIGISMITH_RUN_ID or a depot folder."

In `packages/cli/src/run/README.md`:
- Change the first sentence to: "Every Claude Code session with the DigiSmith plugin is a run (DGS-598): a run that `dg run start` makes (Builder, Reviewer, Scout, sent by the conductor) or an automatic run that the SessionStart hook makes. Oculus and later tickets read these files and nothing else."
- Under "## Files", add:
  ```
  A run lives in `<root>/runs/<ticket or project>/<run-id>/`. The folder is the ticket key when the branch names one (`<KEY>__…`) at the start, else the project (the main repo folder name, made safe). It never changes.
  `runs/.index/` holds `sessions/<session_id>` and `pids/<claude pid>` (one line: `<folder>/<run-id>`, plus the session for a pid) and `node-cache/` (the hooks' compile cache). Readers skip names that start with `.`.
  An automatic run id is `s-<session_id>` of the session that started it.
  ```
- Under "## run.json", add the fields `source` (`auto` or `start`), `project`, `session_id`, `role_from` (`herdr`, `identity`, `pending`, `none`, `start`). Add the roles `maestro` and `conductor`. Say that `ticket` is `null` for an automatic run without a ticket, that a missing field in an old record reads as `start`/`null`, and that the herdr labeller rewrites an automatic run's `run.json` once (role, role_from, ticket) through a temp file and a rename.
- Add a section "## Automatic runs" with these lines:
  ```
  SessionStart without DIGISMITH_RUN_ID: a known session_id (resume, compact) appends `started` to its run. A `/clear` (source clear) continues the run of the same claude process (`CLAUDE_PID`) when that run is open or ended with reason `clear`. Otherwise a new run is made.
  The role comes from `roleOf` in `role.ts`, the only role rule (DGS-599 imports it): outside herdr, one identity card for the repo root gives `maestro`, else `other`. Inside herdr the hook writes `other`/`pending` and starts `label-cli.ts` detached; the labeller reads this pane's agent name through `herdr-ws agent list` (3 s timeout, `NIGHTWATCH_HERDR_WS` overrides the path) and applies the name table: `*-conductor` conductor, `*-rev*` reviewer, `*scout*`/`*probe*` scout, `<letters>-<digits>` builder, else other.
  The other hooks find an automatic run through `runs/.index/sessions/<session_id>`. No entry: nothing is written.
  An explicit DIGISMITH_RUN_ID always wins.
  ```
- Under "## Hooks", replace "Each command tests `DIGISMITH_RUN_ID` in the shell first. With no id, no node process starts." with: "Each command starts node only when `DIGISMITH_RUN_ID` is set or the depot folder exists, and sets `NODE_COMPILE_CACHE` to `runs/.index/node-cache`. A machine without the depot starts no node process. Each hook stays under 100 ms (`scripts/run-events/hook-timing.test.ts`)."

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/run-events packages/cli/src/run`
Expected: PASS. The timing test prints the two medians. If the medians are over 100 ms while the full suite runs in parallel, run `pnpm vitest run scripts/run-events/hook-timing.test.ts` alone and put both results in the task report. Do not raise the limit.

- [ ] **Step 5: Commit**

```bash
git add scripts/run-events/hook-timing.test.ts
git commit -m "feat(hooks): record every session as a run with a fast depot guard" -- hooks/hooks.json scripts/run-events/hooks-json.test.ts scripts/run-events/end-to-end.test.ts scripts/run-events/hook-timing.test.ts scripts/run-events/hook-cli.ts packages/cli/src/run/README.md
```

### Task 6: Readers: dot folders, ticket by record, the activity window, project in the output

**Files:**
- Modify: `packages/cli/src/run/read.ts`
- Modify: `packages/cli/src/run/index.ts` (`list` gains `--days` and `--all`)
- Test: `packages/cli/src/run/read.test.ts` (add cases)
- Test: `packages/cli/src/run/index.test.ts` (add cases)

**Interfaces:**
- Consumes: `RunRecord` with `project`/`ticket: string | null` (Task 2).
- Produces:
  - `export type ListOptions = { days?: number; nowMs?: number }`
  - `export function listRuns(env: NodeJS.ProcessEnv, ticket?: string, opts?: ListOptions): RunRow[]`. With no `days`, every run is listed. The ticket matches the folder name or `record.ticket`.
  - `export const LIST_DAYS = 7`
  - `formatList` columns: `run  ticket|-  project|-  role  seat|-  created  N events  last`. `formatShow` gets a `project   …` line after `ticket`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/cli/src/run/read.test.ts` (use its existing temp and env setup; `createRun`, `listRuns`, `formatList` and `formatShow` are already imported there or are added):

```ts
describe("DGS-598 readers", () => {
  const mk = (folder: string, id: string, rec: Partial<Record<string, unknown>>, ageDays: number) => {
    const dir = path.join(tmp, "runs", folder, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "run.json"), JSON.stringify({ schema: "nightwatch-run/v1", run: id, ticket: null, role: "other", order: null, seat: null, model: null, plugin_version: null, base_sha: null, branch: null, worktree: null, herdr: { workspace: null, tab: null, pane: null }, budget: null, created_at: "2026-10-01T00:00:00.000Z", source: "auto", project: "DigiSmith", session_id: id, role_from: "none", ...rec }));
    fs.writeFileSync(path.join(dir, "events.jsonl"), "");
    const t = (Date.now() - ageDays * 86_400_000) / 1000;
    fs.utimesSync(path.join(dir, "events.jsonl"), t, t);
    fs.utimesSync(path.join(dir, "run.json"), t, t);
  };
  it("skips dot folders without a word", () => {
    fs.mkdirSync(path.join(tmp, "runs", ".index", "sessions"), { recursive: true });
    mk("DigiSmith", "s-a", {}, 0);
    expect(listRuns(env).map((r) => r.record.run)).toEqual(["s-a"]);
  });
  it("matches --ticket on the folder or the record", () => {
    mk("DigiSmith", "s-b", { ticket: "DGS-598" }, 0);
    mk("DGS-598", "s-c", { ticket: "DGS-598" }, 0);
    mk("DigiSmith", "s-d", {}, 0);
    expect(listRuns(env, "DGS-598").map((r) => r.record.run).sort()).toEqual(["s-b", "s-c"]);
  });
  it("keeps only runs active within the window, by file time", () => {
    mk("DigiSmith", "s-new", {}, 1);
    mk("DigiSmith", "s-old", {}, 9);
    expect(listRuns(env, undefined, { days: 7 }).map((r) => r.record.run)).toEqual(["s-new"]);
    expect(listRuns(env).map((r) => r.record.run).sort()).toEqual(["s-new", "s-old"]);
  });
  it("prints the project and a null ticket as -", () => {
    mk("DigiSmith", "s-e", {}, 0);
    const [row] = listRuns(env);
    expect(formatList([row])).toMatch(/^s-e {2}- {2}DigiSmith {2}other /);
    expect(formatShow(row)).toMatch(/ticket {4}-\nproject {3}DigiSmith\n/);
  });
});
```

Add to `packages/cli/src/run/index.test.ts`, inside `describe("dg run", …)`. It uses the file's `dg(...)` helper and `findRunDir`:

```ts
  it("list hides runs idle for more than 7 days unless --all or a wider --days", async () => {
    const fresh = (await dg("start", "--ticket", "DGS-1", "--role", "builder", "--order", "/o.md")).stdout.trim();
    const old = (await dg("start", "--ticket", "DGS-2", "--role", "builder", "--order", "/o.md")).stdout.trim();
    const t = (Date.now() - 9 * 86_400_000) / 1000;
    fs.utimesSync(path.join(findRunDir(old, process.env)!, "run.json"), t, t);
    const ids = async (...a: string[]) => (JSON.parse((await dg("list", "--json", ...a)).stdout) as { record: { run: string } }[]).map((r) => r.record.run).sort();
    expect(await ids()).toEqual([fresh]);
    expect(await ids("--all")).toEqual([fresh, old].sort());
    expect(await ids("--days", "10")).toEqual([fresh, old].sort());
    const bad = await dg("list", "--days", "0");
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("--days must be a whole number of 1 or more");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/run/read.test.ts packages/cli/src/run/index.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

In `packages/cli/src/run/read.ts`:

```ts
export const LIST_DAYS = 7;
const DAY_MS = 86_400_000;
export type ListOptions = { days?: number; nowMs?: number };

// The newest file time of a run: events.jsonl, else run.json. A stat costs far less than reading the events.
function lastActivity(dir: string): number {
  for (const f of ["events.jsonl", "run.json"]) {
    try { return fs.statSync(path.join(dir, f)).mtimeMs; } catch { /* next */ }
  }
  return 0;
}

export function listRuns(env: NodeJS.ProcessEnv, ticket?: string, opts: ListOptions = {}): RunRow[] {
  const root = runsDir(env);
  let keys: string[];
  try {
    keys = fs.readdirSync(root);
  } catch {
    return [];
  }
  const since = opts.days === undefined ? null : (opts.nowMs ?? Date.now()) - opts.days * DAY_MS;
  const rows: RunRow[] = [];
  for (const key of keys) {
    if (key.startsWith(".")) continue; // runs/.index
    const keyDir = path.join(root, key);
    let ids: string[];
    try {
      ids = fs.readdirSync(keyDir);
    } catch {
      continue; // hook-errors.log is a file, not a ticket folder
    }
    for (const id of ids) {
      const dir = path.join(keyDir, id);
      if (since !== null && lastActivity(dir) < since) continue;
      const r = row(dir);
      if (!r) continue;
      if (ticket !== undefined && key !== ticket && r.record.ticket !== ticket) continue;
      rows.push(r);
    }
  }
  return rows.sort((a, b) => (a.record.created_at < b.record.created_at ? 1 : a.record.created_at > b.record.created_at ? -1 : 0));
}
```

`formatList` row: `[r.run, r.ticket ?? "-", r.project ?? "-", r.role, r.seat ?? "-", r.created_at, \`${s.events} events\`, s.last_type ?? "-"]`.
`formatShow`: change the ticket line to `` `ticket    ${r.ticket ?? "-"}` `` and add `` `project   ${r.project ?? "-"}` `` right after it.

In `packages/cli/src/run/index.ts`, `listCommand`:

```ts
const listCommand: CommandModule = {
  command: "list",
  describe: "list runs active in the last 7 days, newest first",
  builder: (y) =>
    y
      .option("ticket", { type: "string" })
      .option("days", { type: "number", default: LIST_DAYS, describe: "only runs with an event in the last N days" })
      .option("all", { type: "boolean", default: false, describe: "every run, however old" })
      .option("json", { type: "boolean", default: false }),
  handler: (a) => {
    const days = a.days as number;
    if (!a.all && (!Number.isInteger(days) || days < 1)) return fail("--days must be a whole number of 1 or more");
    const rows = listRuns(process.env, a.ticket as string | undefined, a.all ? {} : { days });
    console.log(a.json ? JSON.stringify(rows) : formatList(rows));
  },
};
```

Import `LIST_DAYS` from `./read.ts`. Update the README "## Commands" `dg run list` line to: `dg run list [--ticket KEY] [--days N | --all] [--json]` prints one row per run with an event in the last N days (default 7), newest first. `--ticket` matches the folder or the record's ticket.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/run packages/cli/src/nightwatch scripts/run-events`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(run): list recent runs fast and show the project" -- packages/cli/src/run/read.ts packages/cli/src/run/read.test.ts packages/cli/src/run/index.ts packages/cli/src/run/index.test.ts packages/cli/src/run/README.md
```

### Task 7: Watchdog scope: only builder, reviewer and scout

**Files:**
- Modify: `packages/cli/src/autonomous/watchdog.ts`
- Modify: `packages/cli/src/autonomous/watch.ts`
- Modify: `packages/cli/src/autonomous/WATCHDOG.md`
- Test: `packages/cli/src/autonomous/watchdog.test.ts` (add cases)
- Test: `packages/cli/src/autonomous/watch.test.ts` (add cases)

**Interfaces:**
- Consumes: `RunRecord.role` with the new roles (Task 2).
- Produces: `export const WATCHED_ROLES: readonly string[] = ["builder", "reviewer", "scout"]` and `export function isWatched(role: string): boolean` in `watchdog.ts`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/cli/src/autonomous/watchdog.test.ts` (it uses the file's `run(role)`, `ev(type, m)` and `at(m)` helpers; add `isWatched` to the import from `./watchdog.ts`):

```ts
describe("DGS-598 role scope", () => {
  for (const role of ["maestro", "conductor", "other"]) {
    it(`never flags a ${role} run`, () => {
      expect(classify(run(role), [ev("started", 0)], "present", at(180), DEFAULT_BUDGETS)).toEqual({ state: "healthy", cause: "", since: "" });
      expect(classify(run(role), [ev("started", 0)], "gone", at(5), DEFAULT_BUDGETS).state).toBe("healthy");
      expect(classify(run(role), [ev("started", 0), ev("blocked", 1)], "present", at(2), DEFAULT_BUDGETS).state).toBe("healthy");
      expect(classify(run(role), [ev("started", 0), ev("ended", 1)], "present", at(2), DEFAULT_BUDGETS).state).toBe("ended");
    });
  }
  it("still flags builder, reviewer and scout", () => {
    expect(classify(run("scout"), [ev("started", 0)], "present", at(180), DEFAULT_BUDGETS).state).toBe("lost");
    expect(isWatched("builder") && isWatched("reviewer") && isWatched("scout")).toBe(true);
    expect(isWatched("maestro") || isWatched("conductor") || isWatched("other")).toBe(false);
  });
});
```

Add to `packages/cli/src/autonomous/watch.test.ts`, inside `describe("runWatch", …)`. It uses the file's `mk`, `deps`, `env`, `dir`, `NOW` and `present`. Add `readRun` and `rewriteRun` to the import from `../run/record.ts`:

```ts
  it("skips a conductor run before its events are read and opens nothing for it", async () => {
    present = new Set();
    const id = mk("DGS-8", "conductor", 120, [[110, "started"]]);
    writeFileSync(join(findRunDir(id, env)!, "events.jsonl"), "{{{ not json\n");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await runWatch(deps());
    expect(r.opened).toBe(0);
    expect(r.lines.some((l) => l.includes(id))).toBe(false);
    expect(err).not.toHaveBeenCalled();
  });
  it("closes an open blocked item when its run is now a maestro run", async () => {
    present = new Set(["w2:DGS-9"]);
    const id = mk("DGS-9", "builder", 22, [[20, "started"], [5, "blocked"]]);
    expect((await runWatch(deps())).opened).toBe(1);
    const rd = findRunDir(id, env)!;
    rewriteRun(rd, { ...readRun(rd), role: "maestro" });
    const r2 = await runWatch(deps());
    expect(r2.resolved).toBe(1);
    expect(readOpen(dir)).toEqual([]);
    expect(readFileSync(join(dir, "attention.jsonl"), "utf-8")).toContain("role not watched");
  });
  it("makes no stderr line for runs/.index", async () => {
    mkdirSync(join(env.DIGISMITH_DEPOT_DIR!, "runs", ".index", "sessions"), { recursive: true });
    writeFileSync(join(env.DIGISMITH_DEPOT_DIR!, "runs", ".index", "sessions", "x"), "DGS-1/s-x\n");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await runWatch(deps());
    expect(err).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/autonomous/watchdog.test.ts packages/cli/src/autonomous/watch.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`packages/cli/src/autonomous/watchdog.ts`:

```ts
/** DGS-598: only these roles are classified blocked, stalled or lost. Maestro, conductor and other runs are listed, never flagged. */
export const WATCHED_ROLES: readonly string[] = ["builder", "reviewer", "scout"];
export const isWatched = (role: string): boolean => WATCHED_ROLES.includes(role);
```

In `classify`, right after the `ended` check:

```ts
  if (!isWatched(run.role)) return { state: "healthy", cause: "", since: "" };
```

`packages/cli/src/autonomous/watch.ts`:
1. `withEvents` returns `{ runs: { record: RunRecord; events: EventLine[] }[]; unwatched: string[] }`. At the top of the key loop, add `if (key.startsWith(".")) continue; // runs/.index`. Right after `const record = readRun(rd);`, add `if (!isWatched(record.role)) { unwatched.push(record.run); continue; }`. This runs before any events file is read.
2. In `runWatch`, use `const { runs, unwatched } = withEvents(...)`. Before the main loop, add:
   ```ts
   for (const run of unwatched) {
     for (const it of items.filter((o) => o.run === run && AUTO.includes(o.kind))) close(it, "role not watched");
     for (const k of [...opened.keys()]) if (k.startsWith(`${run}|`)) opened.delete(k);
   }
   ```
3. Import `isWatched` from `./watchdog.ts`.

In `packages/cli/src/autonomous/WATCHDOG.md`, after the first paragraph, add:

```
Role scope (DGS-598): only builder, reviewer and scout runs are classified. A maestro, conductor or other run is skipped before its events are read: it gets no item and no comment. An open blocked or stalled item of such a run is closed with the note "role not watched". Oculus still lists these runs, as healthy or ended.
```

Add to "## The check order", before item 1: `0. The role is not builder, reviewer or scout: ended when it has ended, else healthy.`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/autonomous packages/cli/src/nightwatch`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(watchdog): flag only builder, reviewer and scout runs" -- packages/cli/src/autonomous/watchdog.ts packages/cli/src/autonomous/watch.ts packages/cli/src/autonomous/WATCHDOG.md packages/cli/src/autonomous/watchdog.test.ts packages/cli/src/autonomous/watch.test.ts
```

### Task 8: nightwatch views: project, source, a null ticket, the project filter, the window

**Files:**
- Modify: `packages/cli/src/nightwatch/types.ts`
- Modify: `packages/cli/src/nightwatch/derive.ts` (`runRowOf`)
- Modify: `packages/cli/src/nightwatch/views.ts` (`loadAll`, `overviewView`, `runsView`)
- Modify: `packages/cli/src/nightwatch/index.ts` (`VALUE_FLAGS`, the safe check, `runs`)
- Modify: `packages/cli/src/nightwatch/README.md` (the `runs` flags)
- Modify: `packages/cli/src/nightwatch/fixture.test-util.ts` (`FakeRun` gets `folder`, `project`, `source`; a nullable `ticket`)
- Test: `packages/cli/src/nightwatch/derive.test.ts`, `views.test.ts`, `index.test.ts` (add cases; update the expected row objects with `project` and `source`)

**Interfaces:**
- Consumes: `listRuns(env, ticket?, { days, nowMs })`, `LIST_DAYS` (Task 6); `RunRecord.project`/`source` (Task 2).
- Produces: `RunRowView` gets `ticket: string | null`, `role` = the six roles, `project: string | null` and `source: "auto" | "start"`. `runsView(env, now, { state?, role?, ticket?, trigger?, project?, limit? })`. `dg nightwatch view runs --project P`.

- [ ] **Step 1: Write the failing tests**

First extend the fixture `packages/cli/src/nightwatch/fixture.test-util.ts`. `FakeRun` becomes `{ ticket: string | null; folder?: string; run: string; role: RunRecord["role"]; created_at: string; order?: string | null; seat?: string | null; model?: string | null; worktree?: string | null; branch?: string | null; project?: string | null; source?: "auto" | "start" }`. In `writeRun`, the folder is `r.folder ?? r.ticket ?? "unknown"`. Add `source: r.source ?? "start", project: r.project ?? null, session_id: null, role_from: r.source === "auto" ? "none" : "start"` to the record. `writeEvents(ticket, …)` keeps its first argument as the folder name.

Add to `packages/cli/src/nightwatch/views.test.ts` (add `utimesSync` to the `node:fs` import):

```ts
describe("DGS-598", () => {
  const autoRun = (folder: string, run: string, ticket: string | null, role: "maestro" | "builder", project: string): void => {
    d.writeRun({ folder, ticket, run, role, created_at: "2026-10-22T00:00:00.000Z", project, source: "auto" });
    d.writeEvents(folder, run, [{ type: "started", ts: "2026-10-22T00:00:00.000Z", data: { source: "startup" } }]);
  };
  it("runs rows carry project and source; --project filters; a null ticket stays null", () => {
    autoRun("DigiSmith", "s-m1", null, "maestro", "DigiSmith");
    autoRun("EMKT-1", "s-b1", "EMKT-1", "builder", "emma-theme");
    const all = runsView(d.env, NOW, {}).runs;
    expect(all.map((r) => [r.run, r.project, r.source]).sort()).toEqual([["s-b1", "emma-theme", "auto"], ["s-m1", "DigiSmith", "auto"]]);
    expect(runsView(d.env, NOW, { project: "emma-theme" }).runs.map((r) => r.run)).toEqual(["s-b1"]);
    const m = all.find((r) => r.run === "s-m1")!;
    expect(m.ticket).toBeNull();
    expect(m.state).toBe("healthy"); // silent 3 h, but a maestro run is never lost
  });
  it("overview and runs skip runs idle for more than 7 days", () => {
    autoRun("DigiSmith", "s-old", null, "maestro", "DigiSmith");
    const t = (NOW.getTime() - 9 * 86_400_000) / 1000;
    for (const f of ["run.json", "events.jsonl"]) utimesSync(join(d.dir, "runs", "DigiSmith", "s-old", f), t, t);
    expect(runsView(d.env, NOW, {}).runs).toEqual([]);
    expect(overviewView(d.env, NOW).workers).toEqual([]);
  });
});
```

In `derive.test.ts`, add `project` and `source` to the expected `runRowOf` objects (`project: null, source: "start"` for the old fixtures). In `index.test.ts`, add: `runNightwatch(["view", "runs", "--project", "DigiSmith"], env, now)` returns code 0, and `--project "../x"` returns code 1 with "bad id".

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/nightwatch`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`types.ts`:

```ts
export interface RunRowView {
  run: string; ticket: string | null; role: "builder" | "reviewer" | "scout" | "maestro" | "conductor" | "other";
  project: string | null; source: "auto" | "start";
  seat: string | null; model: string | null; trigger: Trigger; state: Health; phase: RunPhase | null;
  startedAt: string; endedAt: string | null; elapsedSec: number; events: number; merged: boolean; pushed: boolean;
}
```

`derive.ts` `runRowOf` return: add `project: run.project ?? null, source: run.source ?? "start",` after `role: run.role,`.

`views.ts`:
- `function loadAll(env: NodeJS.ProcessEnv, ticket?: string, days?: number, nowMs?: number): Loaded[]` calls `listRuns(env, ticket, days === undefined ? {} : { days, nowMs })`.
- `overviewView`: `const loadedAll = loadAll(env, undefined, LIST_DAYS, now.getTime());`
- `runsView(env, now, a: { state?: string; role?: string; ticket?: string; trigger?: string; project?: string; limit?: number })`: `let rows = rowsOf(env, now, loadAll(env, a.ticket, LIST_DAYS, now.getTime()));`, then `if (a.project) rows = rows.filter((r) => r.project === a.project);` next to the other filters.
- Import `LIST_DAYS` from `../run/read.ts`.
- `claimFor` compares `e.ticket === run.ticket`. A null ticket never matches a claim, which is correct, so no change.
- `planView` keeps calling `listRuns(env, a.ticket)` with no window.

`index.ts`: add `"project"` to `VALUE_FLAGS`; change the safe check to `for (const k of ["run", "ticket", "project"])`; and in `runs`, pass `project: f.project`.

`packages/cli/src/nightwatch/README.md`: add `--project P` to the `runs` flags, and say that `overview` and `runs` show runs with an event in the last 7 days.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/nightwatch packages/cli/src/strip-types.smoke.test.ts` and `pnpm --filter @digismith/cli build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(nightwatch): show project and source and filter runs by project" -- packages/cli/src/nightwatch/fixture.test-util.ts packages/cli/src/nightwatch/types.ts packages/cli/src/nightwatch/derive.ts packages/cli/src/nightwatch/views.ts packages/cli/src/nightwatch/index.ts packages/cli/src/nightwatch/README.md packages/cli/src/nightwatch/derive.test.ts packages/cli/src/nightwatch/views.test.ts packages/cli/src/nightwatch/index.test.ts
```

### Task 9: Nexus API and Oculus web: new roles, project, a null ticket

**Files:**
- Modify: `scripts/nexus-shared/nightwatch.ts` (`ROLES`, `runRowSchema`)
- Modify: `scripts/nexus-api/src/nightwatch-route.ts` (`runsQuery`)
- Modify: `scripts/nexus-api/src/nightwatch-reader.ts` (`ALLOWED_KEYS`)
- Modify: `scripts/nexus-web/app/composables/nightwatch-api.ts` (`loadRuns` query type)
- Modify: `scripts/nexus-web/app/components/nw/RunFilters.vue`, `RunFilters.stories.ts`
- Modify: `scripts/nexus-web/app/pages/nightwatch/runs.vue`
- Modify: `scripts/nexus-web/app/components/nw/RunsTable.vue`
- Modify: `scripts/nexus-web/tests/nightwatch-fixtures.ts` (and any other run-row fixture that a strict schema now rejects)
- Test: `scripts/nexus-api/src/nightwatch-route.test.ts`, `nightwatch-reader.test.ts`, `nightwatch-contract.test.ts`; `scripts/nexus-web/app/pages/nightwatch/pages.test.ts`; `scripts/nexus-web/app/components/nw/runs.test.ts`

**Interfaces:**
- Consumes: `dg nightwatch view runs --project P` and the row fields (Task 8).
- Produces: `GET /api/v1/nightwatch/runs?project=P`. A run row has `project: string | null`, `source: 'auto' | 'start'` and `ticket: string | null`. `ROLES` has six roles. `RunFilters` takes `projects: string[]`, and its model has `project`.

- [ ] **Step 1: Write the failing tests**

- `nightwatch-route.test.ts`: `GET /runs?project=DigiSmith` calls the reader with `{ project: 'DigiSmith' }` and returns 200. `GET /runs?project=..%2Fx` returns 400 `bad_request`. `GET /runs?role=maestro` returns 200. A reader row with `ticket: null, project: null, source: 'auto', role: 'conductor'` passes the schema (200, not 503).
- `nightwatch-reader.test.ts`: `read('runs', { project: 'DigiSmith' })` builds argv `['nightwatch', 'view', 'runs', '--project=DigiSmith']`.
- `nightwatch-contract.test.ts`: this test runs the real CLI against a temp depot. Add one automatic-style run (write `run.json` with `source: 'auto'`, `project: 'DigiSmith'`, `ticket: null`, `role: 'maestro'`). Check that `/runs` returns it with those fields, and that `?project=DigiSmith` returns only it.
- `pages.test.ts` (runs page): `route.query = { project: 'DigiSmith' }` calls `loadRuns` with `project: 'DigiSmith'`. `route.query = { project: '../x' }` drops it (`project: ''`). Choosing a project in the filter navigates with `{ query: { project: 'emma-theme' } }`.
- `runs.test.ts` (RunsTable): a row with `ticket: null` shows `-` in the Key cell, and the link still goes to its run.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run scripts/nexus-api scripts/nexus-shared` and `pnpm --filter @digismith/nexus-web test`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`scripts/nexus-shared/nightwatch.ts`:

```ts
export const ROLES = ['builder', 'reviewer', 'scout', 'maestro', 'conductor', 'other'] as const
export const RUN_SOURCES = ['auto', 'start'] as const

export const runRowSchema = z.strictObject({
  run: z.string(), ticket: z.string().nullable(), role: z.enum(ROLES),
  project: z.string().nullable(), source: z.enum(RUN_SOURCES),
  seat: z.string().nullable(), model: z.string().nullable(),
  trigger: z.enum(TRIGGERS), state: z.enum(HEALTH),
  phase: z.enum(RUN_PHASES).nullable(),
  startedAt: iso, endedAt: iso.nullable(), elapsedSec: count, events: count,
  merged: z.boolean(), pushed: z.boolean(),
})
```

`nightwatch-route.ts`: `runsQuery` gets `project: id.optional()`.
`nightwatch-reader.ts`: add `'project'` to `ALLOWED_KEYS`. Update the comment that lists the CLI flags.
`nightwatch-api.ts`: the `loadRuns` query type gets `project?: string`.

`RunFilters.vue`:

```vue
<script setup lang="ts">
import { HEALTH, ROLES, TRIGGERS } from '#nightwatch-schema'

type Filters = { state: string; role: string; trigger: string; project: string; ticket: string }
const props = defineProps<{ modelValue: Filters; projects: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: Filters] }>()
const set = (key: keyof Filters, e: Event): void => {
  emit('update:modelValue', { ...props.modelValue, [key]: (e.target as HTMLInputElement | HTMLSelectElement).value.trim() })
}
const SELECTS = [
  { key: 'state', label: 'State', options: HEALTH },
  { key: 'role', label: 'Role', options: ROLES },
  { key: 'trigger', label: 'Trigger', options: TRIGGERS },
] as const
</script>

<template>
  <div class="filters" role="group" aria-label="Filter the runs">
    <select v-for="s in SELECTS" :key="s.key" :aria-label="s.label" :value="modelValue[s.key]" @change="set(s.key, $event)">
      <option value="">{{ s.label }}: all</option>
      <option v-for="o in s.options" :key="o" :value="o">{{ o }}</option>
    </select>
    <select aria-label="Project" :value="modelValue.project" @change="set('project', $event)">
      <option value="">Project: all</option>
      <option v-for="p in projects" :key="p" :value="p">{{ p }}</option>
    </select>
    <input type="text" aria-label="Ticket" placeholder="Ticket key" :value="modelValue.ticket" @change="set('ticket', $event)">
  </div>
</template>
```

Keep the existing `<style>` block unchanged.

`runs.vue`:
- `filters` gets `project: isSafeId(one(route.query.project)) ? one(route.query.project) : ''`. Put it before `ticket`, so the key order is state, role, trigger, project, ticket.
- Add:
  ```ts
  // the Project choices: every project in the loaded rows, plus the one in the URL
  const projects = computed(() => {
    const seen = new Set((poll.data.value?.runs ?? []).map((r) => r.project).filter((p): p is string => p !== null))
    if (filters.value.project) seen.add(filters.value.project)
    return [...seen].sort()
  })
  ```
- The template: `<NwRunFilters :model-value="filters" :projects="projects" @update:model-value="setFilters" />`.
- Update the existing `pages.test.ts` expectations that list the `loadRuns` argument, to include `project: ''`.

`RunsTable.vue`: the Key cell text becomes `{{ r.ticket ?? '-' }}`.

`RunFilters.stories.ts`: `Default` args become `{ modelValue: { state: '', role: 'builder', trigger: '', project: '', ticket: '' }, projects: ['DigiSmith', 'emma-theme'] }`.

Fixtures: add `project: null, source: 'start'` to every run-row fixture in `scripts/nexus-web/tests/nightwatch-fixtures.ts` and in any other test file that builds a `RunRow` by hand. Search for `merged:` under `scripts/nexus-web` and `scripts/nexus-api` to find them.

- [ ] **Step 4: Run the tests and the web gates**

Run:
- `pnpm vitest run scripts/nexus-api scripts/nexus-shared packages/cli`
- `pnpm --filter @digismith/nexus-web test`
- `pnpm --filter @digismith/nexus-web typecheck`
- `pnpm --filter @digismith/nexus-web visual`. The runs page now has one more select. If its baseline changed, look at the diff image: the only change must be the Project select. Then run `pnpm --filter @digismith/nexus-web visual:update` and commit only the snapshot files of the runs page and RunFilters. Name them in the task report.
- `pnpm --filter @digismith/nexus-web a11y` (axe: the new select has an `aria-label`)

Expected: PASS. If Playwright browsers are missing, say so in the report, and do not install anything outside pnpm.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(oculus): show maestro and conductor runs and filter runs by project" -- scripts/nexus-shared scripts/nexus-api/src scripts/nexus-web/app scripts/nexus-web/tests
```

---

## Self-review against the spec

- §2 facts: Task 1 (`.git` read, identity card line match) and Task 4 (herdr-ws list, four fields).
- §3 layout and record: folders and `.index` (Task 3); run id `s-<sid>` (Task 3); new fields and old-record defaults (Task 2); `--ticket` by record and dot folders skipped (Task 6).
- §4 SessionStart: guard (Task 5), same session, /clear, new run (Task 3), labeller (Task 4), explicit id wins (Task 4).
- §5 role, project, ticket: `roleOf` is the one rule (Task 2); the labeller (Task 4); project, branch, worktree, ticket (Task 1, Task 3).
- §6 hooks and cost: the hooks.json command, no depot means no node, compile cache, timing test, privacy (Task 5, Task 4).
- §7 watchdog and Oculus: `classify` scope and watch skip before events (Task 7); views, project filter, null ticket, 7-day window (Task 8); API, shared schema, web filter (Task 9).
- §8 other changes: `dg run start` roles and fields (Task 2); format project (Task 6); README and WATCHDOG.md (Tasks 5, 6, 7).
- §9 tests: one test or more per bullet across Tasks 1–9; the smoke test covers every new `packages/cli/src` file.
- §10 first use and §11 out of scope: no task (first use runs after the merge and the plugin update).
