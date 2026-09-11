# DigiSmith CLI on npm (V.4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publishable `@digismith/cli` npm package (`packages/cli`) whose `digismith`/`dg` binaries run V.3's `vps status|connect` from any machine, with the vps-session code relocated into it as the first command group.

**Architecture:** A new zero-dependency workspace package with no build step — TypeScript sources ship as-is and Node ≥24 strips types natively. `src/index.ts` is a thin dispatcher (group table, usage, `--version`); `src/vps/` is `scripts/vps-session/` moved verbatim via `git mv`, with only its entry file changing from a process entry point to an exported `run(argv)`. Depot's skill keeps invoking the checkout path; the installed binary is for humans.

**Tech Stack:** TypeScript on Node ≥24 (native type stripping, no flag), pnpm workspace, Vitest, `node:` builtins only. No new dependencies.

## Global Constraints

- Node `>=24` — `engines.node` in the new package; no runtime version check is added.
- Zero runtime and dev dependencies in `packages/cli/package.json`; Vitest and TypeScript come from the workspace root.
- No build step, no `dist/`, no per-package `tsconfig`. The root `tsconfig.json` `include` gains `packages/cli/src/**/*.ts`.
- Package name `@digismith/cli`, version `0.1.0`, bins `digismith` and `dg` both → `src/index.ts`, `files: ["src", "!src/**/*.test.ts"]`, `publishConfig.access: "public"` — exactly as the design's `package.json`.
- Every file's entry is `index.ts`: the package runs `src/index.ts`, a command group runs `src/<group>/index.ts`. No file named `cli`.
- The five non-entry vps files (`config.ts`, `checks.ts`, `run-command.ts`, `status.ts`, `connect.ts`) and their tests move byte-for-byte — `git mv` only, no content edits.
- `.digismith/docs/vps-session/*` is never touched (frozen V.3 build record).
- **Never run `npm login` or `pnpm publish`** — publishing is Jack's step. This plan stops at a verified tarball and a local global install from that tarball, which is uninstalled afterwards.
- Commit messages: one line, `type(scope): summary`, no body, no AI attribution of any kind (`standards/global/commit-style.md`).
- Code comments: none, except the one WHY comment Task 2 specifies (pnpm symlink realpath).
- Surgical changes: touch only the files each task lists.
- Expected environment facts for acceptance on the build machine: Node v24.16.0, pnpm 11.x, global bin dir `C:\Users\jazurite\AppData\Local\pnpm\bin`, **no** `~/.digismith-depot/vps.json` present (so `vps status` stops at the no-config message), nothing named `dg` or `digismith` on PATH yet.

---

## File Structure

| Path | Responsibility |
|---|---|
| `packages/cli/package.json` | Package identity, bins, published files. Create. |
| `packages/cli/README.md` | What npmjs.com renders: install, the two commands, config shape. Create. |
| `packages/cli/src/index.ts` | Dispatcher: `GROUPS`, `usage()`, `resolveGroup()`, `readVersion()`, guarded `main()`. Create. |
| `packages/cli/src/index.test.ts` | Unit tests for the dispatcher's pure functions. Create. |
| `packages/cli/src/vps/index.ts` | Was `scripts/vps-session/cli.ts`; exports `run(argv)`. Move + edit. |
| `packages/cli/src/vps/{config,checks,run-command,status,connect}.ts` + tests | Moved byte-for-byte from `scripts/vps-session/`. |
| `tsconfig.json` | `include` gains the new source tree. Modify. |
| `.gitignore` | Ignore packed tarballs (`*.tgz`). Modify. |
| `pnpm-lock.yaml` | Gains the new workspace importer after `pnpm install`. Modify (generated). |
| `skills/depot/SKILL.md` | VPS Session section points at the new path; one sentence about the installed form. Modify. |
| `MEMORY.md` | V row: V.3 path note + V.4 entry. Modify. |
| `.digismith/history.html` | V.4 timeline entry, V row, doc links. Modify. |

---

### Task 1: Relocate vps-session into the CLI package as the `vps` group

**Files:**
- Move: `scripts/vps-session/` → `packages/cli/src/vps/` (all 10 files, via `git mv`)
- Move: `packages/cli/src/vps/cli.ts` → `packages/cli/src/vps/index.ts`, then edit
- Modify: `tsconfig.json:14` (`include`)
- Test: `packages/cli/src/vps/*.test.ts` (moved, unchanged)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `export function run(argv: string[]): void` in `packages/cli/src/vps/index.ts` — `argv` is the argument list *after* the group name, so `argv[0]` is `"status"` or `"connect"`. Task 2's dispatcher calls `run(rest)`.

- [ ] **Step 1: Confirm the moved tests pass from their current location (baseline)**

Run: `npx vitest run scripts/vps-session`
Expected: 4 test files, 25 tests, all passing. This is the number the same files must still produce after the move.

- [ ] **Step 2: Move the folder and rename the entry file, preserving history**

```bash
mkdir -p packages/cli/src
git mv scripts/vps-session packages/cli/src/vps
git mv packages/cli/src/vps/cli.ts packages/cli/src/vps/index.ts
git status --short
```

Expected: 10 renames listed (`R  scripts/vps-session/... -> packages/cli/src/vps/...`), `scripts/vps-session/` no longer exists. The other nine files are not opened or edited in this task.

- [ ] **Step 3: Turn the entry file into an exported group runner**

Replace the entire content of `packages/cli/src/vps/index.ts` with:

```typescript
import { loadVpsConfig, DEFAULT_VPS_CONFIG_PATH, type VpsConfig } from "./config.ts";
import { runStatusChecks, formatStatusReport, isFullyHealthy } from "./status.ts";
import { runConnect } from "./connect.ts";

export function run(argv: string[]): void {
  const subcommand = argv[0];
  if (subcommand !== "status" && subcommand !== "connect") {
    console.error("usage: digismith vps <status|connect>");
    process.exitCode = 1;
    return;
  }

  let config: VpsConfig | null;
  try {
    config = loadVpsConfig();
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
    return;
  }

  if (config === null) {
    console.error(`vps-session: no VPS configured — create ${DEFAULT_VPS_CONFIG_PATH}`);
    process.exitCode = 1;
    return;
  }

  if (subcommand === "status") {
    const report = runStatusChecks(config, DEFAULT_VPS_CONFIG_PATH);
    console.log(formatStatusReport(report));
    process.exitCode = isFullyHealthy(report) ? 0 : 1;
    return;
  }

  runConnect(config, DEFAULT_VPS_CONFIG_PATH);
}
```

Three deltas from the old `cli.ts`, nothing else: `main()` → exported `run(argv)`; `process.argv[2]` → `argv[0]`; the usage string; and the `pathToFileURL` import plus the self-invocation guard are removed (Task 2's dispatcher owns process entry now). Every message, exit code, and call is otherwise identical.

- [ ] **Step 4: Extend the root tsconfig include**

In `tsconfig.json`, change

```json
  "include": ["scripts/**/*.ts"]
```

to

```json
  "include": ["scripts/**/*.ts", "packages/cli/src/**/*.ts"]
```

- [ ] **Step 5: Verify the moved tests and the type-check**

Run: `npx vitest run packages/cli/src/vps`
Expected: 4 test files, 25 tests, all passing — the same counts as Step 1.

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no output, exit 0.

Run: `npx vitest run`
Expected: whole suite green; no file under `scripts/vps-session` remains to be collected.

- [ ] **Step 6: Commit**

```bash
git add -A packages/cli/src/vps tsconfig.json
git commit -m "refactor(vps-session): move into packages/cli/src/vps as a command group"
```

(`git mv` already staged the ten renames; `-A` on the new folder picks up the `index.ts` edit on top. `git log --follow packages/cli/src/vps/connect.ts` should show V.3's history.)

---

### Task 2: The `@digismith/cli` package — manifest, dispatcher, README, and packaging verification

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/README.md`
- Create: `packages/cli/src/index.ts`
- Test: `packages/cli/src/index.test.ts`
- Modify: `.gitignore` (append `*.tgz`)
- Modify: `pnpm-lock.yaml` (regenerated by `pnpm install`)

**Interfaces:**
- Consumes: `run(argv: string[]): void` from `./vps/index.ts` (Task 1).
- Produces: the published package. Exports from `src/index.ts` used by its own tests: `GROUPS: Record<string, GroupRunner>`, `type GroupRunner = (argv: string[]) => void`, `usage(): string`, `resolveGroup(name: string | undefined): GroupRunner | undefined`, `readVersion(packageJsonPath?: string): string`.

- [ ] **Step 1: Write the package manifest**

Create `packages/cli/package.json`:

```json
{
  "name": "@digismith/cli",
  "version": "0.1.0",
  "description": "DigiSmith's command line — Depot's distribution surface",
  "type": "module",
  "engines": {
    "node": ">=24"
  },
  "bin": {
    "digismith": "src/index.ts",
    "dg": "src/index.ts"
  },
  "files": [
    "src",
    "!src/**/*.test.ts"
  ],
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "test": "vitest run"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/Jazurite/DigiSmith.git",
    "directory": "packages/cli"
  },
  "author": {
    "name": "Jack Huỳnh",
    "email": "jack@jazurite.com"
  }
}
```

- [ ] **Step 2: Write the failing dispatcher tests**

Create `packages/cli/src/index.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { GROUPS, resolveGroup, usage, readVersion } from "./index.ts";

const ownPackageJson = new URL("../package.json", import.meta.url);
const ownVersion = (JSON.parse(fs.readFileSync(ownPackageJson, "utf-8")) as { version: string }).version;

describe("resolveGroup", () => {
  it("returns the vps runner for 'vps'", () => {
    expect(resolveGroup("vps")).toBe(GROUPS.vps);
  });

  it("returns undefined for an unknown group", () => {
    expect(resolveGroup("foo")).toBeUndefined();
  });

  it("returns undefined when no group is given", () => {
    expect(resolveGroup(undefined)).toBeUndefined();
  });

  it("does not resolve Object.prototype members as groups", () => {
    expect(resolveGroup("toString")).toBeUndefined();
  });
});

describe("usage", () => {
  it("names the binary and every registered group", () => {
    const text = usage();
    expect(text).toContain("digismith");
    expect(text).toContain("--version");
    for (const name of Object.keys(GROUPS)) {
      expect(text).toContain(name);
    }
  });
});

describe("readVersion", () => {
  it("reads the version from the package's own package.json by default", () => {
    expect(readVersion()).toBe(ownVersion);
  });

  it("returns unknown when the file is missing", () => {
    expect(readVersion(path.join(os.tmpdir(), "digismith-cli-does-not-exist.json"))).toBe("unknown");
  });

  it("returns unknown when the file has no string version", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-cli-version-"));
    const file = path.join(dir, "package.json");
    fs.writeFileSync(file, JSON.stringify({ name: "x" }));
    try {
      expect(readVersion(file)).toBe("unknown");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run packages/cli/src/index.test.ts`
Expected: FAIL — the suite cannot load `./index.ts` (file does not exist).

- [ ] **Step 4: Write the dispatcher**

Create `packages/cli/src/index.ts`:

```typescript
#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { run as runVps } from "./vps/index.ts";

export type GroupRunner = (argv: string[]) => void;

export const GROUPS: Record<string, GroupRunner> = {
  vps: runVps,
};

export function usage(): string {
  const groups = Object.keys(GROUPS)
    .map((name) => `  ${name}`)
    .join("\n");
  return `usage: digismith <group> [args]\n       digismith --version\n\ngroups:\n${groups}`;
}

export function resolveGroup(name: string | undefined): GroupRunner | undefined {
  if (name === undefined) return undefined;
  return Object.prototype.hasOwnProperty.call(GROUPS, name) ? GROUPS[name] : undefined;
}

const OWN_PACKAGE_JSON = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");

export function readVersion(packageJsonPath: string = OWN_PACKAGE_JSON): string {
  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "unknown";
  } catch {
    return "unknown";
  }
}

function main(): void {
  const [group, ...rest] = process.argv.slice(2);
  if (group === "--version") {
    console.log(readVersion());
    return;
  }
  const run = resolveGroup(group);
  if (run === undefined) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }
  run(rest);
}

// pnpm installs global packages behind symlinks, and Node resolves
// import.meta.url to the real path — so argv[1] must be realpath'd too or the
// installed binary compares unequal and silently does nothing.
function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return pathToFileURL(fs.realpathSync(entry)).href === import.meta.url;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main();
}
```

That comment is the one permitted in this plan — it records a constraint that is invisible from the code and that would otherwise reappear as "the global install prints nothing" in Step 11.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run packages/cli/src/index.test.ts`
Expected: 8 tests passing.

- [ ] **Step 6: Write the README**

Create `packages/cli/README.md`:

````markdown
# @digismith/cli

DigiSmith's command line. Installs the `digismith` binary and its short alias `dg`.

Requires Node 24 or newer — the sources are TypeScript and Node strips the types itself, so there is no build step and nothing to compile.

```bash
pnpm add -g @digismith/cli
```

## Commands

```
digismith vps status      # read-only health report of the VPS claude session
digismith vps connect     # fix what's safely fixable, then attach interactively
digismith --version
```

`dg` accepts exactly the same arguments.

`vps` expects `~/.digismith-depot/vps.json`, written by hand once:

```json
{
  "host": "203.0.113.10",
  "user": "root",
  "identity_file": "~/.ssh/id_ed25519",
  "tmux_session": "claude-main"
}
```

`vps connect` ends in an interactive `ssh -t … tmux attach`, so run it from a real terminal (Windows Terminal, PowerShell, cmd, or a macOS/Linux terminal) — not from an agent's shell tool or MinTTY Git Bash without `winpty`. `vps status` works from anywhere.

Source and design docs: <https://github.com/Jazurite/DigiSmith> (`packages/cli`).
````

- [ ] **Step 7: Ignore packed tarballs and register the workspace package**

Append one line to `.gitignore`:

```
*.tgz
```

Then, from the repo root:

Run: `pnpm install`
Expected: completes without adding dependencies; `pnpm-lock.yaml` gains a `packages/cli` importer entry (`git diff --stat pnpm-lock.yaml` shows a small change).

- [ ] **Step 8: Verify the whole suite and the type-check**

Run: `npx vitest run`
Expected: green; the count is the pre-task total plus 8.

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no output, exit 0 (the shebang line is legal TypeScript).

- [ ] **Step 9: Verify the binary from the checkout**

Run each from the repo root and record stdout/stderr and exit code (`echo $?` in bash):

| Command | Expected |
|---|---|
| `node packages/cli/src/index.ts vps status` | stderr: `vps-session: no VPS configured — create C:\Users\jazurite\.digismith-depot\vps.json`; exit 1 |
| `node packages/cli/src/index.ts` | stderr: the `usage:` block listing `vps`; exit 1 |
| `node packages/cli/src/index.ts foo` | same usage block; exit 1 |
| `node packages/cli/src/index.ts vps` | stderr: `usage: digismith vps <status|connect>`; exit 1 |
| `node packages/cli/src/index.ts --version` | stdout: `0.1.0`; exit 0 |

Do **not** run `vps connect` — it would attempt a real SSH attach.

- [ ] **Step 10: Pack and inspect the tarball**

```bash
cd packages/cli
pnpm pack
tar -tzf digismith-cli-0.1.0.tgz | sort
cd ../..
```

Expected file list, exactly:

```
package/README.md
package/package.json
package/src/index.ts
package/src/vps/checks.ts
package/src/vps/config.ts
package/src/vps/connect.ts
package/src/vps/index.ts
package/src/vps/run-command.ts
package/src/vps/status.ts
```

No `*.test.ts` anywhere. If a test file appears, the `files` negation is not being honoured — stop and report rather than adjusting the pattern by guesswork.

- [ ] **Step 11: Install the tarball globally and run the real binaries**

Pre-check that the names are free, then install:

```bash
where dg digismith 2>/dev/null || echo "names free"
pnpm add -g ./packages/cli/digismith-cli-0.1.0.tgz
dg --version
dg vps status; echo "exit=$?"
digismith vps status; echo "exit=$?"
```

Expected: `names free`; install succeeds; `dg --version` prints `0.1.0`; both `vps status` invocations print the same no-config line as Step 9 with exit 1. If either binary prints **nothing** and exits 0, the realpath guard in Step 4 is not matching — report it with the output of `where dg` and `readlink -f "$(where dg | head -1)"` rather than patching blindly.

- [ ] **Step 12: Uninstall and clean up**

```bash
pnpm remove -g @digismith/cli
where dg digismith 2>/dev/null || echo "names free again"
rm packages/cli/digismith-cli-0.1.0.tgz
git status --short
```

Expected: `names free again`; the only changes are the files this task creates/modifies (no stray `.tgz`).

- [ ] **Step 13: Commit**

```bash
git add packages/cli/package.json packages/cli/README.md packages/cli/src/index.ts packages/cli/src/index.test.ts .gitignore pnpm-lock.yaml
git commit -m "feat(cli): add @digismith/cli package with the vps command group"
```

---

### Task 3: Docs — Depot skill, map row, history

**Files:**
- Modify: `skills/depot/SKILL.md` (Overview bullet line 31; "Resource: VPS Session" section lines 299–347)
- Modify: `MEMORY.md` (V row, line 118)
- Modify: `.digismith/history.html` (V row in the map table, V doc-links paragraph, one timeline entry)

**Interfaces:**
- Consumes: the paths established by Tasks 1–2 (`packages/cli/src/index.ts`, group `vps`).
- Produces: documentation only.

- [ ] **Step 1: Point Depot's skill at the new entry point**

In `skills/depot/SKILL.md`, make exactly these edits:

1. Overview bullet (line 31): replace the substring `` `scripts/vps-session/cli.ts` `` with `` `packages/cli/src/index.ts vps` — published on npm as `@digismith/cli` (map item **V.4**) ``.

2. Section intro (line 301): replace

   ```
   A standalone CLI (`scripts/vps-session/cli.ts`, map item **V.3**) that reconnects to an
   ```

   with

   ```
   The `vps` command group of DigiSmith's CLI (`packages/cli/src/index.ts`, map items **V.3**
   and **V.4**) that reconnects to an
   ```

3. After the paragraph ending `written by hand, no creation/edit tooling.` (line 305), insert one new paragraph:

   ```
   From a checkout the commands below run via `node <digismith-repo>/packages/cli/src/index.ts`;
   with the package installed globally (`pnpm add -g @digismith/cli`) the same thing is
   `digismith vps status|connect` or `dg vps status|connect` from any directory. This skill
   always uses the checkout form — a Claude Code session driving Depot has one — and never
   depends on the package being installed.
   ```

4. The `status` code block (line 322): replace `node --experimental-strip-types scripts/vps-session/cli.ts status` with `node <digismith-repo>/packages/cli/src/index.ts vps status`.

5. The `connect` code block (line 334): replace `node --experimental-strip-types scripts/vps-session/cli.ts connect` with `node <digismith-repo>/packages/cli/src/index.ts vps connect`.

Then verify: `grep -n "vps-session/cli" skills/depot/SKILL.md` prints nothing; the frontmatter `description:` (line 3) is still a single line and was not edited.

- [ ] **Step 2: Update the map row**

In `MEMORY.md`'s **V** row (line 118), make two edits:

1. Replace the substring

   ```
   a standalone `scripts/vps-session/cli.ts` (`status`/`connect`)
   ```

   with

   ```
   a standalone `status`/`connect` CLI (built as `scripts/vps-session/cli.ts`, relocated into `packages/cli/src/vps/` by **V.4** the same day)
   ```

2. Replace the row's closing substring

   ```
   See `.digismith/docs/vps-session/design.html`/`plan.md`/`report.html`. |
   ```

   with

   ```
   See `.digismith/docs/vps-session/design.html`/`plan.md`/`report.html`. · **V.4** (2026-09-11) publishes Depot's CLI surface as the npm package `@digismith/cli` (`packages/cli`): binaries `digismith` and its alias `dg`, one command group so far (`vps`, V.3's code moved in as `src/vps/`), zero dependencies and no build step — Node ≥24 strips types natively, and an npm `bin` can't pass Node flags, so shipping `.ts` is the only zero-build option that works. Own semver from `0.1.0`, independent of the plugin version; publishing is manual (`pnpm publish --access public` from `packages/cli`, Jack's own npm login, `digismith` org required) — auto-publish is a future `post-finish` hook. The "login / save credentials / connect to our server" half of the original CLI vision is deliberately out of scope until letter **X** provides a server with real auth. See `.digismith/docs/digismith-cli-npm/design.html`/`plan.md`/`report.html`. |
   ```

Verify: `grep -c "V.4" MEMORY.md` ≥ 1; the row is still a single table line.

- [ ] **Step 3: Record V.4 in the history page**

In `.digismith/history.html`, make three edits:

1. Map table, V row — replace the substring

   ```
   not yet live-verified against the real box, 2026-09-11 <span class="status done">Done</span></td>
   ```

   with

   ```
   not yet live-verified against the real box, 2026-09-11 <span class="status done">Done</span> · <strong>V.4</strong> the CLI published to npm as <code>@digismith/cli</code> (<code>digismith</code>/<code>dg</code>; <code>vps</code> is the first command group; zero build, Node ≥ 24), 2026-09-11 <span class="status done">Done</span></td>
   ```

2. Doc-links paragraph for V — replace

   ```
       V.3 <a href="docs/vps-session/design.html">design</a> ·
       <a href="docs/vps-session/plan.md">plan</a> ·
       <a href="docs/vps-session/report.html">report</a>
     </p>
   ```

   with

   ```
       V.3 <a href="docs/vps-session/design.html">design</a> ·
       <a href="docs/vps-session/plan.md">plan</a> ·
       <a href="docs/vps-session/report.html">report</a> ·
       V.4 <a href="docs/digismith-cli-npm/design.html">design</a> ·
       <a href="docs/digismith-cli-npm/plan.md">plan</a>
     </p>
   ```

3. Timeline — insert this event immediately before the closing `  </div>\n</section>\n\n<footer>` of the timeline section (i.e. after the last existing `<div class="event">…</div>`):

   ```html
       <div class="event">
         <div class="date">2026-09-11</div>
         <h4>V.4 — the DigiSmith CLI published to npm as <code>@digismith/cli</code> — 3 tasks, subagent-driven-development</h4>
         <p>Straight after V.3 shipped, Jack asked for "our own DigiSmith CLI" on npm so it
         runs from any machine without a checkout. The brainstorm split the ask in two: the
         package itself (this), and the "login / save credentials / connect to our server" half,
         which needs the server side letter <strong>X</strong> reserves and stays out of scope.
         v1 ships one command group, <code>vps</code> — <code>scripts/vps-session/</code> moved
         by <code>git mv</code> into <code>packages/cli/src/vps/</code> with only its entry file
         changing to an exported <code>run(argv)</code> — behind a thin
         <code>src/index.ts</code> dispatcher, with binaries <code>digismith</code> and the alias
         <code>dg</code>. No build step: Node 24 strips types natively (verified: a
         <code>.ts</code> entry runs with no flag and no warning), and an npm <code>bin</code>
         can't pass Node flags, so shipping <code>.ts</code> was the only zero-build option that
         actually works. One gotcha the design hadn't foreseen surfaced while planning: pnpm's
         global installs go through symlinks and Node realpaths <code>import.meta.url</code>, so
         the entry guard compares real paths or the installed binary silently does nothing. Own
         semver from <code>0.1.0</code>; publishing stays manual and Jack's (<code>npm login</code>,
         the <code>digismith</code> org, <code>pnpm publish</code>) — the build's acceptance bar is
         a verified tarball and a working global install from it on this Windows machine. See
         <a href="docs/digismith-cli-npm/design.html">design</a> and
         <a href="docs/digismith-cli-npm/plan.md">plan</a>.</p>
       </div>
   ```

Verify: `grep -c 'digismith-cli-npm' .digismith/history.html` ≥ 3; every `href="docs/…"` added resolves to an existing file.

- [ ] **Step 4: Commit**

```bash
git add skills/depot/SKILL.md MEMORY.md .digismith/history.html
git commit -m "docs: record V.4 across the depot skill, map, and history"
```
