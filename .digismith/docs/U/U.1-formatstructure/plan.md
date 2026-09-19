# CLI Domain Framework (U.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `@digismith/cli`'s hand-rolled `vps`/`depot` dispatcher to a yargs-based, HubSpot-style domain framework with branded help output, and close out letter U's ownership split.

**Architecture:** Every domain (`vps`, `depot`) and sub-domain (`depot clone`, `depot opencode`, `depot bridge`) becomes a yargs "bucket" `CommandModule` (`{ command, describe, builder, handler: () => {} }` with `demandCommand(1, '')`) composed of leaf `CommandModule`s that call the logic functions each file already exports. A shared `src/lib/brand-help.ts` post-processes yargs' own generated help text (via `.showHelp(callback)`) to add DigiSmith's purple brand accent and a root-only banner, rather than replacing yargs' help generation outright.

**Tech Stack:** TypeScript (NodeNext ESM, Node ≥24), yargs ^18.1.0, picocolors ^1.1.1, Vitest.

## Global Constraints

- Every user-facing command keeps its exact current argv shape (`dg depot clone ensure`, `dg vps status`, `dg depot bridge ensure --repo <path>`, etc.) — this is an internal restructure, not a breaking change.
- No new global option groups beyond migrating the one existing hand-parsed flag (`depot bridge ensure --repo <path>`) to a declared yargs option.
- `process-lifecycle.ts` logic is untouched — only import paths of its consumers change (one level deeper).
- No ASCII logo. Branding is a single bold-purple wordmark line at root help only, plus colorized `Commands:`/`Options:`/`Domains:` section headers everywhere.
- Module system: NodeNext, ESM only, relative imports use explicit `.ts` extensions (rewritten to `.js` at build via `rewriteRelativeImportExtensions`) — match this exactly in every new file.
- Map item: **U.1**.

---

### Task 1: Shared CLI framework primitives — command types, branded help renderer, new dependencies

**Files:**
- Modify: `packages/cli/package.json`
- Create: `packages/cli/src/lib/brand-help.ts`
- Create: `packages/cli/src/lib/brand-help.test.ts`

**Interfaces:**
- Produces: `brandHelp(rawHelp: string, options?: { root?: boolean }): string` — pure formatter. `attachHelp(y: Argv, options?: { root?: boolean }): Argv` — wires `brandHelp` into a yargs instance's `.showHelp()`. Every later task's bucket/root builder consumes `attachHelp`.

- [ ] **Step 1: Add the new dependencies**

Edit `packages/cli/package.json`, adding a `dependencies` block (the package currently has none) right after `"license"`:

```json
  "license": "MIT",
  "dependencies": {
    "yargs": "^18.1.0",
    "picocolors": "^1.1.1"
  },
```

Run from the repo root: `pnpm install`

Expected: lockfile updates, no errors. `packages/cli/node_modules/yargs` and `.../picocolors` now resolve.

- [ ] **Step 2: Write the failing test for the branded help formatter**

Create `packages/cli/src/lib/brand-help.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { brandHelp } from "./brand-help.ts";

const ROOT_HELP = [
  "Usage: dg <command>",
  "",
  "Commands:",
  "  dg vps      reconnect to the Hetzner VPS's persistent claude session",
  "  dg depot    manage machine-wide shared resources (clone, opencode, bridge)",
  "",
  "Options:",
  "  --help     Show help",
  "  --version  Show version number",
].join("\n");

const NESTED_HELP = [
  "Usage: dg depot <command>",
  "",
  "Commands:",
  "  dg depot clone      manage the shared packages/ clone",
  "  dg depot opencode   manage the shared OpenCode server",
  "  dg depot bridge     manage the shared Agentic Bridge proxy",
].join("\n");

describe("brandHelp", () => {
  it("prepends the wordmark banner and relabels Commands as Domains at root", () => {
    const out = brandHelp(ROOT_HELP, { root: true });
    expect(out).toContain("digismith");
    expect(out).toContain("personal SDLC CLI");
    expect(out).toContain("Domains:");
    expect(out).not.toMatch(/^Commands:$/m);
  });

  it("omits the banner and keeps the literal Commands header for nested help", () => {
    const out = brandHelp(NESTED_HELP, { root: false });
    expect(out).not.toContain("personal SDLC CLI");
    expect(out).toMatch(/^Commands:$/m);
  });

  it("defaults to non-root when no options are given", () => {
    const out = brandHelp(NESTED_HELP);
    expect(out).not.toContain("personal SDLC CLI");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @digismith/cli exec vitest run src/lib/brand-help.test.ts`
Expected: FAIL — `Cannot find module './brand-help.ts'`.

- [ ] **Step 3: Implement the branded help renderer**

Create `packages/cli/src/lib/brand-help.ts`:

```ts
import type { Argv } from "yargs";
import pc from "picocolors";

const HEADER_PATTERN = /^(Commands|Options|Positionals|Domains):$/gm;

export interface BrandHelpOptions {
  root?: boolean;
}

export function brandHelp(rawHelp: string, options: BrandHelpOptions = {}): string {
  const relabeled = options.root ? rawHelp.replace(/^Commands:$/m, "Domains:") : rawHelp;
  const colored = relabeled.replace(HEADER_PATTERN, (label) => pc.bold(pc.magenta(label)));
  const banner = options.root
    ? `${pc.bold(pc.magenta("digismith"))}${pc.dim(" — personal SDLC CLI")}\n\n`
    : "";
  return `${banner}${colored}`;
}

export function attachHelp(y: Argv, options: BrandHelpOptions = {}): Argv {
  return y.showHelp((text: string) => console.log(brandHelp(text, options)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @digismith/cli exec vitest run src/lib/brand-help.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/package.json pnpm-lock.yaml packages/cli/src/lib/brand-help.ts packages/cli/src/lib/brand-help.test.ts
git commit -m "feat(cli): add yargs/picocolors deps and a branded help renderer"
```

---

### Task 2: `vps` domain → yargs bucket + leaves

**Files:**
- Create: `packages/cli/src/vps/shared.ts`
- Create: `packages/cli/src/vps/shared.test.ts`
- Modify: `packages/cli/src/vps/status.ts` (add `statusCommand` export)
- Modify: `packages/cli/src/vps/connect.ts` (add `connectCommand` export)
- Modify: `packages/cli/src/vps/index.ts` (replace `run(argv)` with the `vps` bucket module)

**Interfaces:**
- Consumes: `attachHelp` from Task 1 (`../lib/brand-help.ts`).
- Produces: `default export vpsCommand: CommandModule` from `vps/index.ts` — Task 5 imports this directly.

- [ ] **Step 1: Write the failing test for the shared config-loading guard**

Create `packages/cli/src/vps/shared.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadConfigOrExit } from "./shared.ts";

describe("loadConfigOrExit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exits 1 and reports when no vps.json exists", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => loadConfigOrExit()).toThrow("exit:1");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("no VPS configured"));
  });

  it("returns the parsed config when vps.json is valid", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vps-shared-"));
    const configPath = path.join(dir, "vps.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({ host: "h", user: "u", identity_file: "i", tmux_session: "t" })
    );
    try {
      const config = loadConfigOrExit(configPath);
      expect(config).toEqual({ host: "h", user: "u", identity_file: "i", tmux_session: "t" });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @digismith/cli exec vitest run src/vps/shared.test.ts`
Expected: FAIL — `Cannot find module './shared.ts'`.

- [ ] **Step 3: Implement the shared guard, then wire the leaves and bucket**

Create `packages/cli/src/vps/shared.ts` (extracted from the pre-existing `vps/index.ts` `run()` body, made reusable and parameterized by config path for the test above):

```ts
import { loadVpsConfig, DEFAULT_VPS_CONFIG_PATH, type VpsConfig } from "./config.ts";

export function loadConfigOrExit(configPath: string = DEFAULT_VPS_CONFIG_PATH): VpsConfig {
  let config: VpsConfig | null;
  try {
    config = loadVpsConfig(configPath);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
  if (config === null) {
    console.error(`vps-session: no VPS configured — create ${configPath}`);
    process.exit(1);
  }
  return config;
}
```

Modify `packages/cli/src/vps/status.ts` — change the top import line and append the command export:

```ts
import { DEFAULT_VPS_CONFIG_PATH, type VpsConfig } from "./config.ts";
```

```ts
import type { CommandModule } from "yargs";
import { loadConfigOrExit } from "./shared.ts";

export const statusCommand: CommandModule = {
  command: "status",
  describe: "read-only health report of the VPS claude session",
  handler: () => {
    const config = loadConfigOrExit();
    const report = runStatusChecks(config, DEFAULT_VPS_CONFIG_PATH);
    console.log(formatStatusReport(report));
    process.exitCode = isFullyHealthy(report) ? 0 : 1;
  },
};
```

Modify `packages/cli/src/vps/connect.ts` — change the top import line and append the command export:

```ts
import { DEFAULT_VPS_CONFIG_PATH, type VpsConfig } from "./config.ts";
```

```ts
import type { CommandModule } from "yargs";
import { loadConfigOrExit } from "./shared.ts";

export const connectCommand: CommandModule = {
  command: "connect",
  describe: "fix what's safely fixable, then attach interactively",
  handler: () => {
    const config = loadConfigOrExit();
    runConnect(config, DEFAULT_VPS_CONFIG_PATH);
  },
};
```

Replace all of `packages/cli/src/vps/index.ts` with:

```ts
import type { CommandModule } from "yargs";
import { attachHelp } from "../lib/brand-help.ts";
import { statusCommand } from "./status.ts";
import { connectCommand } from "./connect.ts";

const vpsCommand: CommandModule = {
  command: "vps",
  describe: "reconnect to the Hetzner VPS's persistent claude session",
  builder: (y) =>
    attachHelp(y.command(statusCommand).command(connectCommand).demandCommand(1, ""), { root: false }),
  handler: () => {},
};

export default vpsCommand;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @digismith/cli exec vitest run src/vps/`
Expected: PASS — `shared.test.ts`'s 2 new tests, plus the pre-existing `status.test.ts`/`connect.test.ts`/`checks.test.ts`/`config.test.ts` (unaffected, still pure-logic tests) all green.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/vps/
git commit -m "feat(cli): migrate vps domain to a yargs bucket with status/connect leaves"
```

---

### Task 3: `depot clone` sub-domain → yargs bucket + leaves

**Files:**
- Create: `packages/cli/src/depot/clone/lib.ts` (logic moved from `depot/clone.ts`)
- Create: `packages/cli/src/depot/clone/ensure.ts`
- Create: `packages/cli/src/depot/clone/refresh.ts`
- Create: `packages/cli/src/depot/clone/index.ts`
- Modify: `packages/cli/src/depot/clone.test.ts` → move to `packages/cli/src/depot/clone/lib.test.ts` (import path only, logic unchanged)
- Delete: `packages/cli/src/depot/clone.ts`

**Interfaces:**
- Consumes: `attachHelp` from Task 1.
- Produces: `default export cloneCommand: CommandModule` from `depot/clone/index.ts` — Task 4's `depot/index.ts` consumes this.

- [ ] **Step 1: Move the existing test, updating only its import**

Run: `git mv packages/cli/src/depot/clone.test.ts packages/cli/src/depot/clone/lib.test.ts`

Edit the new `packages/cli/src/depot/clone/lib.test.ts`'s import line:

```ts
import { cloneExists, ensureClone, refreshClone } from "./lib.ts";
```

(No other change — this file's assertions test pure logic untouched by this migration.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @digismith/cli exec vitest run src/depot/clone/lib.test.ts`
Expected: FAIL — `Cannot find module './lib.ts'` (it doesn't exist yet).

- [ ] **Step 3: Move the logic, then add the yargs leaves and bucket**

Run: `git mv packages/cli/src/depot/clone.ts packages/cli/src/depot/clone/lib.ts`

Edit `packages/cli/src/depot/clone/lib.ts` — delete the trailing `run(argv: string[])` function (lines 63-77 of the original file) entirely; everything above it (`DEFAULT_DEPOT_REPO_PATH`, `DEFAULT_DEPOT_REMOTE`, `CommandResult`, `runGit`, `cloneExists`, `ensureClone`, `refreshClone`) stays exactly as-is.

Create `packages/cli/src/depot/clone/ensure.ts`:

```ts
import type { CommandModule } from "yargs";
import { ensureClone } from "./lib.ts";

export const ensureCommand: CommandModule = {
  command: "ensure",
  describe: "clone ~/.digismith-depot/repo if missing, else no-op",
  handler: () => {
    const result = ensureClone();
    if (result.status !== 0) {
      console.error(`depot clone: ${result.stderr.trim() || "git command failed"}`);
      process.exitCode = 1;
      return;
    }
    console.log(`depot clone: ensure — ${result.stdout.trim() || "ok"}`);
  },
};
```

Create `packages/cli/src/depot/clone/refresh.ts`:

```ts
import type { CommandModule } from "yargs";
import { refreshClone } from "./lib.ts";

export const refreshCommand: CommandModule = {
  command: "refresh",
  describe: "fetch + hard-reset the clone to origin/main",
  handler: () => {
    const result = refreshClone();
    if (result.status !== 0) {
      console.error(`depot clone: ${result.stderr.trim() || "git command failed"}`);
      process.exitCode = 1;
      return;
    }
    console.log(`depot clone: refresh — ${result.stdout.trim() || "ok"}`);
  },
};
```

Create `packages/cli/src/depot/clone/index.ts`:

```ts
import type { CommandModule } from "yargs";
import { attachHelp } from "../../lib/brand-help.ts";
import { ensureCommand } from "./ensure.ts";
import { refreshCommand } from "./refresh.ts";

const cloneCommand: CommandModule = {
  command: "clone",
  describe: "manage the shared packages/ clone",
  builder: (y) =>
    attachHelp(y.command(ensureCommand).command(refreshCommand).demandCommand(1, ""), { root: false }),
  handler: () => {},
};

export default cloneCommand;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @digismith/cli exec vitest run src/depot/clone/`
Expected: PASS — all 4 pre-existing `lib.test.ts` cases green against the moved file.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/depot/clone/
git commit -m "feat(cli): migrate depot clone sub-domain to a yargs bucket with ensure/refresh leaves"
```

---

### Task 4: `depot opencode`/`depot bridge` sub-domains → yargs, plus the `depot` root bucket

**Files:**
- Create: `packages/cli/src/depot/opencode/lib.ts`, `ensure.ts`, `stop.ts`, `index.ts`
- Create: `packages/cli/src/depot/bridge/lib.ts`, `ensure.ts`, `stop.ts`, `index.ts`
- Modify: `packages/cli/src/depot/opencode.test.ts` → move to `packages/cli/src/depot/opencode/ensure.test.ts` + `stop.test.ts`
- Modify: `packages/cli/src/depot/bridge.test.ts` → move to `packages/cli/src/depot/bridge/lib.test.ts` + `ensure.test.ts` + `stop.test.ts`
- Delete: `packages/cli/src/depot/opencode.ts`, `packages/cli/src/depot/bridge.ts`
- Modify: `packages/cli/src/depot/index.ts` (replace `run(argv)` with the `depot` root bucket)

**Interfaces:**
- Consumes: `attachHelp` (Task 1), `ensureProcess`/`stopProcess` from `../process-lifecycle.ts` (unchanged, now imported one level deeper as `../../process-lifecycle.ts`), `cloneCommand` (Task 3).
- Produces: `default export depotCommand: CommandModule` from `depot/index.ts` — Task 5 imports this directly.

**Note on testability:** the original `opencode.ts`/`bridge.ts` `run(argv, trackingFile, logFile)` shells took the tracking/log file paths as parameters with defaults specifically so tests could redirect them into a tmp dir instead of touching the real `~/.digismith-depot/*` files. A bare `CommandModule` object loses that hook — its `handler` only receives parsed `argv`. Preserve the original testability by exporting a `createEnsureCommand(trackingFile?, logFile?)` / `createStopCommand(trackingFile?)` **factory** from each leaf file; the module's default-parameter `CommandModule` (used by `index.ts`) is just `createEnsureCommand()`/`createStopCommand()` called with no arguments.

- [ ] **Step 1: Write the failing tests for the new opencode/bridge leaves**

Create `packages/cli/src/depot/opencode/ensure.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createEnsureCommand } from "./ensure.ts";

describe("createEnsureCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("reports an error and exits 1 when the underlying process fails to start", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-opencode-ensure-"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createEnsureCommand(
      path.join(tmpDir, "tracking.json"),
      path.join(tmpDir, "server.log")
    );

    // No real "opencode" binary or CHUTES_API_KEY on a test machine — ensureProcess()
    // (via fetchChutesApiKey or the spawn itself) is expected to throw.
    (command.handler as (argv: never) => void)({} as never);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("depot opencode:"));
    expect(process.exitCode).toBe(1);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

Create `packages/cli/src/depot/opencode/stop.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createStopCommand } from "./stop.ts";

describe("createStopCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("reports nothing to stop when no server is tracked", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-opencode-stop-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createStopCommand(path.join(tmpDir, "tracking.json"));

    (command.handler as (argv: never) => void)({} as never);

    expect(logSpy).toHaveBeenCalledWith("depot opencode: nothing to stop");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

Create `packages/cli/src/depot/bridge/lib.test.ts` (the untouched half of the old `bridge.test.ts` — `findDigismithRepoMarker`/`resolveDigismithRepo` coverage, import path updated):

```ts
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { findDigismithRepoMarker, resolveDigismithRepo } from "./lib.ts";

function makeDigismithCheckout(root: string): void {
  const dir = path.join(root, ".claude-plugin");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "plugin.json"), JSON.stringify({ name: "digismith" }));
}

describe("findDigismithRepoMarker", () => {
  let tmpDir: string;
  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds the marker in the starting directory itself", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-"));
    makeDigismithCheckout(tmpDir);
    expect(findDigismithRepoMarker(tmpDir)).toBe(tmpDir);
  });

  it("walks up parent directories to find the marker", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-"));
    makeDigismithCheckout(tmpDir);
    const nested = path.join(tmpDir, "a", "b", "c");
    fs.mkdirSync(nested, { recursive: true });
    expect(findDigismithRepoMarker(nested)).toBe(tmpDir);
  });

  it("returns null when no ancestor has the marker", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-"));
    const nested = path.join(tmpDir, "a", "b");
    fs.mkdirSync(nested, { recursive: true });
    expect(findDigismithRepoMarker(nested)).toBeNull();
  });

  it("ignores a plugin.json whose name isn't digismith", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-"));
    const dir = path.join(tmpDir, ".claude-plugin");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "plugin.json"), JSON.stringify({ name: "something-else" }));
    expect(findDigismithRepoMarker(tmpDir)).toBeNull();
  });
});

describe("resolveDigismithRepo", () => {
  let tmpDir: string;
  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("uses cwd when it's a DigiSmith checkout", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-"));
    makeDigismithCheckout(tmpDir);
    expect(resolveDigismithRepo(undefined, tmpDir)).toBe(tmpDir);
  });

  it("uses an explicit --repo path when valid, regardless of cwd", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-"));
    makeDigismithCheckout(tmpDir);
    const elsewhereCwd = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-elsewhere-"));
    try {
      expect(resolveDigismithRepo(tmpDir, elsewhereCwd)).toBe(tmpDir);
    } finally {
      fs.rmSync(elsewhereCwd, { recursive: true, force: true });
    }
  });

  it("throws when --repo doesn't look like a DigiSmith checkout", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-"));
    expect(() => resolveDigismithRepo(tmpDir, tmpDir)).toThrow(/does not look like a DigiSmith checkout/);
  });

  it("throws when neither cwd nor --repo resolves", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-"));
    expect(() => resolveDigismithRepo(undefined, tmpDir)).toThrow(/not inside a DigiSmith checkout/);
  });
});
```

Create `packages/cli/src/depot/bridge/ensure.test.ts` (the `run(["ensure"], ...)` case from the old `bridge.test.ts`, retargeted at the factory's handler with `argv.repo` replacing the old manual `--repo` parse, and explicit tmp-dir tracking/log paths preserving the original test's file isolation):

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createEnsureCommand } from "./ensure.ts";

describe("createEnsureCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("errors when it can't resolve a DigiSmith repo and no --repo was given", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-ensure-"));
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = createEnsureCommand(
      path.join(tmpDir, "tracking.json"),
      path.join(tmpDir, "server.log")
    );

    (command.handler as (argv: { repo?: string }) => void)({ repo: undefined });

    expect(errorSpy).toHaveBeenCalledWith(
      "depot bridge: not inside a DigiSmith checkout and no --repo <path> given"
    );
    expect(process.exitCode).toBe(1);
    cwdSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

Create `packages/cli/src/depot/bridge/stop.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createStopCommand } from "./stop.ts";

describe("createStopCommand", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("reports nothing to stop when no bridge is tracked", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-stop-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const command = createStopCommand(path.join(tmpDir, "tracking.json"));

    (command.handler as (argv: never) => void)({} as never);

    expect(logSpy).toHaveBeenCalledWith("depot bridge: nothing to stop");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @digismith/cli exec vitest run src/depot/opencode/ src/depot/bridge/`
Expected: FAIL — none of the target modules exist yet.

- [ ] **Step 3: Implement both sub-domains and the depot root bucket**

Delete `packages/cli/src/depot/opencode.test.ts` (fully superseded by the two new files above).

Create `packages/cli/src/depot/opencode/lib.ts` (moved from `depot/opencode.ts`, dropping `run()`):

```ts
import { spawnSync } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";

export const DEFAULT_TRACKING_FILE = path.join(os.homedir(), ".digismith-depot", "opencode-server.json");
export const DEFAULT_LOG_FILE = path.join(os.homedir(), ".digismith-depot", "opencode-server.log");

const CREDENTIALS_SCRIPT = path.join(
  os.homedir(),
  ".claude",
  "skills",
  "chutes-ai",
  "scripts",
  "manage_credentials.py"
);

export function fetchChutesApiKey(): string {
  const result = spawnSync("python3", [CREDENTIALS_SCRIPT, "get", "--field", "api_key"], { encoding: "utf-8" });
  if (result.status !== 0) {
    throw new Error(
      `could not fetch the Chutes API key — ${(result.stderr ?? "").trim() || "manage_credentials.py failed"}`
    );
  }
  return result.stdout.trim();
}
```

Create `packages/cli/src/depot/opencode/ensure.ts`:

```ts
import type { CommandModule } from "yargs";
import { ensureProcess } from "../process-lifecycle.ts";
import { DEFAULT_TRACKING_FILE, DEFAULT_LOG_FILE, fetchChutesApiKey } from "./lib.ts";

export function createEnsureCommand(
  trackingFile: string = DEFAULT_TRACKING_FILE,
  logFile: string = DEFAULT_LOG_FILE
): CommandModule {
  return {
    command: "ensure",
    describe: "start the shared OpenCode server if not already running",
    handler: () => {
      try {
        const { port } = ensureProcess({
          label: "opencode-server",
          trackingFile,
          logFile,
          spawnCommand: () => ({
            command: "opencode",
            args: ["serve", "--port", "0", "--hostname", "127.0.0.1"],
            env: { CHUTES_API_KEY: fetchChutesApiKey() },
          }),
        });
        console.log(`depot opencode: ready on port ${port}`);
      } catch (err) {
        console.error(`depot opencode: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const ensureCommand: CommandModule = createEnsureCommand();
```

Create `packages/cli/src/depot/opencode/stop.ts`:

```ts
import type { CommandModule } from "yargs";
import { stopProcess } from "../process-lifecycle.ts";
import { DEFAULT_TRACKING_FILE } from "./lib.ts";

export function createStopCommand(trackingFile: string = DEFAULT_TRACKING_FILE): CommandModule {
  return {
    command: "stop",
    describe: "stop it",
    handler: () => {
      const result = stopProcess({ label: "opencode-server", trackingFile });
      if (result.error) {
        console.error(`depot opencode: failed to stop — ${result.error}`);
        process.exitCode = 1;
      } else if (result.stopped) {
        console.log("depot opencode: stopped");
      } else {
        console.log("depot opencode: nothing to stop");
      }
    },
  };
}

export const stopCommand: CommandModule = createStopCommand();
```

Create `packages/cli/src/depot/opencode/index.ts`:

```ts
import type { CommandModule } from "yargs";
import { attachHelp } from "../../lib/brand-help.ts";
import { ensureCommand } from "./ensure.ts";
import { stopCommand } from "./stop.ts";

const opencodeCommand: CommandModule = {
  command: "opencode",
  describe: "manage the shared OpenCode server",
  builder: (y) =>
    attachHelp(y.command(ensureCommand).command(stopCommand).demandCommand(1, ""), { root: false }),
  handler: () => {},
};

export default opencodeCommand;
```

Delete `packages/cli/src/depot/opencode.ts` and `packages/cli/src/depot/bridge.test.ts` (fully superseded by the three new bridge test files above).

Create `packages/cli/src/depot/bridge/lib.ts` (moved from `depot/bridge.ts`, dropping `run()`):

```ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const DEFAULT_TRACKING_FILE = path.join(os.homedir(), ".digismith-depot", "agentic-bridge.json");
export const DEFAULT_LOG_FILE = path.join(os.homedir(), ".digismith-depot", "agentic-bridge.log");

function isDigismithCheckout(dir: string): boolean {
  const marker = path.join(dir, ".claude-plugin", "plugin.json");
  if (!fs.existsSync(marker)) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(marker, "utf-8")) as { name?: unknown };
    return parsed.name === "digismith";
  } catch {
    return false;
  }
}

export function findDigismithRepoMarker(startDir: string): string | null {
  let dir = startDir;
  while (true) {
    if (isDigismithCheckout(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function resolveDigismithRepo(explicitRepo: string | undefined, cwd: string = process.cwd()): string {
  if (explicitRepo !== undefined) {
    if (!isDigismithCheckout(explicitRepo)) {
      throw new Error(
        `--repo ${explicitRepo} does not look like a DigiSmith checkout (no .claude-plugin/plugin.json with "name": "digismith")`
      );
    }
    return explicitRepo;
  }
  const found = findDigismithRepoMarker(cwd);
  if (!found) {
    throw new Error("not inside a DigiSmith checkout and no --repo <path> given");
  }
  return found;
}
```

Create `packages/cli/src/depot/bridge/ensure.ts` — this is where the old hand-parsed `--repo` flag becomes a declared yargs option:

```ts
import type { CommandModule } from "yargs";
import * as path from "node:path";
import { ensureProcess } from "../process-lifecycle.ts";
import { DEFAULT_TRACKING_FILE, DEFAULT_LOG_FILE, resolveDigismithRepo } from "./lib.ts";

export function createEnsureCommand(
  trackingFile: string = DEFAULT_TRACKING_FILE,
  logFile: string = DEFAULT_LOG_FILE
): CommandModule {
  return {
    command: "ensure",
    describe: "start the Agentic Bridge proxy if not already running",
    builder: (y) =>
      y.option("repo", {
        type: "string",
        describe: "DigiSmith checkout to run the bridge from (defaults to the current checkout)",
      }),
    handler: (argv) => {
      let repo: string;
      try {
        repo = resolveDigismithRepo(argv.repo as string | undefined);
      } catch (err) {
        console.error(`depot bridge: ${(err as Error).message}`);
        process.exitCode = 1;
        return;
      }
      try {
        const { port } = ensureProcess({
          label: "agentic-bridge",
          trackingFile,
          logFile,
          spawnCommand: () => ({
            command: "node",
            args: [
              "--experimental-strip-types",
              path.join(repo, "scripts", "agentic-bridge", "server.ts"),
              "--port",
              "0",
            ],
          }),
        });
        console.log(`depot bridge: ready on port ${port}`);
      } catch (err) {
        console.error(`depot bridge: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    },
  };
}

export const ensureCommand: CommandModule = createEnsureCommand();
```

Create `packages/cli/src/depot/bridge/stop.ts`:

```ts
import type { CommandModule } from "yargs";
import { stopProcess } from "../process-lifecycle.ts";
import { DEFAULT_TRACKING_FILE } from "./lib.ts";

export function createStopCommand(trackingFile: string = DEFAULT_TRACKING_FILE): CommandModule {
  return {
    command: "stop",
    describe: "stop it",
    handler: () => {
      const result = stopProcess({ label: "agentic-bridge", trackingFile });
      if (result.error) {
        console.error(`depot bridge: failed to stop — ${result.error}`);
        process.exitCode = 1;
      } else if (result.stopped) {
        console.log("depot bridge: stopped");
      } else {
        console.log("depot bridge: nothing to stop");
      }
    },
  };
}

export const stopCommand: CommandModule = createStopCommand();
```

Create `packages/cli/src/depot/bridge/index.ts`:

```ts
import type { CommandModule } from "yargs";
import { attachHelp } from "../../lib/brand-help.ts";
import { ensureCommand } from "./ensure.ts";
import { stopCommand } from "./stop.ts";

const bridgeCommand: CommandModule = {
  command: "bridge",
  describe: "manage the shared Agentic Bridge proxy",
  builder: (y) =>
    attachHelp(y.command(ensureCommand).command(stopCommand).demandCommand(1, ""), { root: false }),
  handler: () => {},
};

export default bridgeCommand;
```

Replace all of `packages/cli/src/depot/index.ts` with:

```ts
import type { CommandModule } from "yargs";
import { attachHelp } from "../lib/brand-help.ts";
import cloneCommand from "./clone/index.ts";
import opencodeCommand from "./opencode/index.ts";
import bridgeCommand from "./bridge/index.ts";

const depotCommand: CommandModule = {
  command: "depot",
  describe: "manage machine-wide shared resources (clone, opencode, bridge)",
  builder: (y) =>
    attachHelp(
      y.command(cloneCommand).command(opencodeCommand).command(bridgeCommand).demandCommand(1, ""),
      { root: false }
    ),
  handler: () => {},
};

export default depotCommand;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @digismith/cli exec vitest run src/depot/`
Expected: PASS — `clone/`, `opencode/`, `bridge/` all green; `process-lifecycle.test.ts` unaffected and still green.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/depot/
git commit -m "feat(cli): migrate depot opencode/bridge sub-domains and the depot root bucket to yargs"
```

---

### Task 5: Root dispatcher migration to yargs

**Files:**
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/index.test.ts`

**Interfaces:**
- Consumes: `vpsCommand` (Task 2), `depotCommand` (Task 4), `attachHelp` (Task 1).
- Produces: `buildCli(argv: string[]): Argv` (exported for tests), `readVersion` (unchanged, kept).

- [ ] **Step 1: Write the failing tests for the new dispatcher**

Replace `packages/cli/src/index.test.ts`'s `resolveGroup`/`usage` describe blocks (lines 10-41 of the current file) with:

```ts
import { buildCli, readVersion } from "./index.ts";

describe("buildCli", () => {
  it("registers both domains", () => {
    const commands = buildCli([]).getCommands();
    expect(commands.some((c) => c.startsWith("vps"))).toBe(true);
    expect(commands.some((c) => c.startsWith("depot"))).toBe(true);
  });
});
```

(Keep the existing `readVersion` describe block at the bottom unchanged — that function doesn't change in this task.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @digismith/cli exec vitest run src/index.test.ts`
Expected: FAIL — `buildCli` is not exported yet.

- [ ] **Step 3: Implement the yargs root dispatcher**

Replace `packages/cli/src/index.ts`'s `GROUPS`/`usage`/`resolveGroup`/`main` section (everything between the imports and `isDirectRun`) with:

```ts
#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import yargs, { type Argv } from "yargs";
import { hideBin } from "yargs/helpers";
import { attachHelp } from "./lib/brand-help.ts";
import vpsCommand from "./vps/index.ts";
import depotCommand from "./depot/index.ts";

const OWN_PACKAGE_JSON = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");

export function readVersion(packageJsonPath: string = OWN_PACKAGE_JSON): string {
  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "unknown";
  } catch {
    return "unknown";
  }
}

export function buildCli(argv: string[]): Argv {
  const cli = yargs(argv)
    .scriptName("digismith")
    .command(vpsCommand)
    .command(depotCommand)
    .demandCommand(1, "")
    .strict()
    .version(readVersion());
  return attachHelp(cli, { root: true });
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
  buildCli(hideBin(process.argv)).parse();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @digismith/cli exec vitest run src/index.test.ts`
Expected: PASS — `buildCli` registers both domains, `readVersion`'s 3 pre-existing cases still green.

Then run the full package suite: `pnpm --filter @digismith/cli test`
Expected: PASS, all files.

Then build and smoke-test manually: `pnpm --filter @digismith/cli build && node packages/cli/dist/index.js --help`
Expected: colorized `digismith — personal SDLC CLI` banner, a `Domains:` section listing `vps`/`depot`, no crash. Also try `node packages/cli/dist/index.js depot clone bogus` — expected: yargs' own strict-mode error (non-zero exit), not a silent no-op.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/index.ts packages/cli/src/index.test.ts
git commit -m "feat(cli): migrate the root dispatcher to yargs"
```

---

### Task 6: Ownership/branding cleanup — package.json description, MEMORY.md, backlog resolution

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `MEMORY.md`
- Delete: `backlog/cli-decouple-from-depot-u.md`

**Interfaces:** None — documentation/metadata only, no code.

- [ ] **Step 1: Reword the package description**

Edit `packages/cli/package.json`:

```json
  "description": "DigiSmith's command line — binaries, dispatcher, and command-group framework",
```

(replacing `"DigiSmith's command line — Depot's distribution surface"`)

- [ ] **Step 2: Verify the build still succeeds**

Run: `pnpm --filter @digismith/cli build`
Expected: PASS (a description-string change cannot affect compilation, this just confirms nothing else broke).

- [ ] **Step 3: Update MEMORY.md's U and V rows**

In `MEMORY.md`, replace the **U** row's current text (`"Not yet built under this letter — no code has moved yet, this is the letter assignment only. See backlog/cli-decouple-from-depot-u.md."`) with:

```
**U.1** (2026-09-19) activates the split for real: `packages/cli/src/index.ts`'s dispatcher
migrated from a hand-rolled `GROUPS` map to a yargs-based domain framework (bucket → leaf
`CommandModule` composition, mirroring HubSpot's `hs` CLI structure), plus a branded `--help`
renderer (`src/lib/brand-help.ts`, reusing the purple accent from every generated `design.html`/
`report.html`). Reverses V.4's original "zero runtime dependencies" decision — adds `yargs` and
`picocolors`. Every command keeps its exact prior argv shape; the one hand-parsed flag,
`depot bridge ensure --repo <path>`, becomes a declared yargs option. `package.json`'s description
no longer frames the package as Depot's. See `.digismith/docs/U/U.1-formatstructure/design.html`/
`plan.md`.
```

In the **V** row, after the existing V.5 sentence, append:

```
`@digismith/cli`'s ownership moved to letter **U** 2026-09-19 (see U's own row) — V.3's `vps` and
V.5's `depot` command groups are now consumers of U's CLI framework rather than the package
belonging to V. This entry and V.4/V.5's own frozen docs are left otherwise unchanged, per the
existing precedent of never editing a shipped `design.html`/`report.html` after the fact.
```

- [ ] **Step 4: Resolve the backlog item**

Run: `git rm backlog/cli-decouple-from-depot-u.md`

- [ ] **Step 5: Commit**

```bash
git add packages/cli/package.json MEMORY.md
git commit -m "docs(cli): close out U.1 — reword package ownership, record the split in MEMORY.md"
```
