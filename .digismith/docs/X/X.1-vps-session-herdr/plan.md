# VPS Session via Herdr (X.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace V.3's tmux/`claude`-based VPS session CLI with a herdr-supervised OpenCode+TokenReply one, in place — same `dg vps status`/`dg vps connect` commands, same config file, rewritten internals.

**Architecture:** `packages/cli/src/vps/` gets its five files (`config.ts`, `checks.ts`, `status.ts`, `connect.ts`, `shared.ts`) rewritten against herdr instead of tmux. A small piece of existing repo-path-resolution logic currently private to `depot/bridge/` gets extracted to a shared location first, since `connect.ts`'s credential/config auto-fix needs it too.

**Tech Stack:** TypeScript (Node ≥24, native type-stripping), Vitest, yargs (`CommandModule`), `node:child_process` (`spawnSync`).

## Global Constraints

- Design source of truth: `.digismith/docs/X/X.1-vps-session-herdr/design.html` — read it in full before starting; this plan implements it, not a paraphrase of it.
- No `tmux_session` field survives — replaced by `workspace_label` + `agent_name`.
- No lingering check/auto-fix survives — removed entirely, not just hidden.
- Default OpenCode model is `tokenreply/kimi-k2.7`, never `kimi-k3` by default (confirmed-flaky tool-calling bug, K.3's own reliability call).
- Never build a remote SSH command by interpolating a secret into a quoted string — write locally, transfer via `scp`, matching the pattern that avoided the nested-quoting trap in both herdr spikes.
- Never auto-install herdr, nvm, node, pnpm, or opencode — report what's missing and point at manual steps, matching V.3's own established stance.
- Every herdr-related remote command must explicitly `export PATH="$HOME/.local/bin:$PATH"` itself — herdr's own Unix installer does not add this to `~/.bashrc` automatically (confirmed live during the VPS spike), and a non-interactive SSH shell doesn't source `~/.bashrc` regardless (same reasoning already applied to the nvm/pnpm toolchain check).
- Follow this repo's own file/test conventions exactly — see `packages/cli/src/vps/*.ts` and `packages/cli/src/depot/bridge/*.ts` for the established shape before writing new code.

---

## Task 1: Extract shared DigiSmith-repo resolution out of `depot/bridge`

**Files:**
- Create: `packages/cli/src/shared/digismith-repo.ts`
- Create: `packages/cli/src/shared/digismith-repo.test.ts`
- Modify: `packages/cli/src/depot/bridge/lib.ts`
- Delete: `packages/cli/src/depot/bridge/lib.test.ts` (its coverage moves to the new shared test file verbatim; nothing bridge-specific was in it)

**Interfaces:**
- Produces: `isDigismithCheckout(dir: string): boolean`, `findDigismithRepoMarker(startDir: string): string | null`, `resolveDigismithRepo(explicitRepo: string | undefined, cwd?: string): string` — all with identical signatures/behavior to their current `depot/bridge/lib.ts` versions. Task 5 imports `resolveDigismithRepo` from here.

This is a pure move — no behavior change. `depot/bridge/ensure.ts`/`stop.ts` must keep working unchanged (they still import `resolveDigismithRepo` from `./lib.ts`, which now re-exports).

- [ ] **Step 1: Create the shared module with the moved logic**

```typescript
// packages/cli/src/shared/digismith-repo.ts
import * as fs from "node:fs";
import * as path from "node:path";

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

- [ ] **Step 2: Move the existing tests to the new location verbatim**

```typescript
// packages/cli/src/shared/digismith-repo.test.ts
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { findDigismithRepoMarker, resolveDigismithRepo } from "./digismith-repo.ts";

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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-repo-"));
    makeDigismithCheckout(tmpDir);
    expect(findDigismithRepoMarker(tmpDir)).toBe(tmpDir);
  });

  it("walks up parent directories to find the marker", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-repo-"));
    makeDigismithCheckout(tmpDir);
    const nested = path.join(tmpDir, "a", "b", "c");
    fs.mkdirSync(nested, { recursive: true });
    expect(findDigismithRepoMarker(nested)).toBe(tmpDir);
  });

  it("returns null when no ancestor has the marker", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-repo-"));
    const nested = path.join(tmpDir, "a", "b");
    fs.mkdirSync(nested, { recursive: true });
    expect(findDigismithRepoMarker(nested)).toBeNull();
  });

  it("ignores a plugin.json whose name isn't digismith", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-repo-"));
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-repo-"));
    makeDigismithCheckout(tmpDir);
    expect(resolveDigismithRepo(undefined, tmpDir)).toBe(tmpDir);
  });

  it("uses an explicit --repo path when valid, regardless of cwd", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-repo-"));
    makeDigismithCheckout(tmpDir);
    const elsewhereCwd = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-repo-elsewhere-"));
    try {
      expect(resolveDigismithRepo(tmpDir, elsewhereCwd)).toBe(tmpDir);
    } finally {
      fs.rmSync(elsewhereCwd, { recursive: true, force: true });
    }
  });

  it("throws when --repo doesn't look like a DigiSmith checkout", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-repo-"));
    expect(() => resolveDigismithRepo(tmpDir, tmpDir)).toThrow(/does not look like a DigiSmith checkout/);
  });

  it("throws when neither cwd nor --repo resolves", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-repo-"));
    expect(() => resolveDigismithRepo(undefined, tmpDir)).toThrow(/not inside a DigiSmith checkout/);
  });
});
```

- [ ] **Step 3: Run the new tests to verify they pass**

Run: `pnpm --filter @digismith/cli test digismith-repo`
Expected: PASS, all 9 tests green.

- [ ] **Step 4: Point `depot/bridge/lib.ts` at the shared module and delete the now-redundant local test file**

```typescript
// packages/cli/src/depot/bridge/lib.ts
import * as os from "node:os";
import * as path from "node:path";

export { findDigismithRepoMarker, resolveDigismithRepo } from "../../shared/digismith-repo.ts";

export const DEFAULT_TRACKING_FILE = path.join(os.homedir(), ".digismith-depot", "agentic-bridge.json");
export const DEFAULT_LOG_FILE = path.join(os.homedir(), ".digismith-depot", "agentic-bridge.log");
```

Delete `packages/cli/src/depot/bridge/lib.test.ts` — its coverage now lives in `shared/digismith-repo.test.ts`.

- [ ] **Step 5: Run the full bridge test suite to confirm no regression**

Run: `pnpm --filter @digismith/cli test bridge`
Expected: PASS — `ensure.test.ts` and `stop.test.ts` unaffected (they only ever imported `resolveDigismithRepo` from `./lib.ts`, whose public surface is unchanged).

- [ ] **Step 6: Run the full CLI package test suite to confirm nothing else broke**

Run: `pnpm --filter @digismith/cli test`
Expected: PASS, no regressions anywhere else in the package.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/shared/digismith-repo.ts packages/cli/src/shared/digismith-repo.test.ts packages/cli/src/depot/bridge/lib.ts
git rm packages/cli/src/depot/bridge/lib.test.ts
git commit -m "refactor(cli): extract DigiSmith-repo resolution to a shared module"
```

---

## Task 2: Rewrite `vps/config.ts` for herdr's identifiers

**Files:**
- Modify: `packages/cli/src/vps/config.ts`
- Modify: `packages/cli/src/vps/config.test.ts`

**Interfaces:**
- Produces: `interface VpsConfig { host: string; user: string; identity_file: string; workspace_label: string; agent_name: string; }`, `loadVpsConfig(filePath?: string): VpsConfig | null` (same signature/behavior as before — null on missing file, throws on invalid JSON or missing required fields, returns the parsed config on success). `DEFAULT_VPS_CONFIG_PATH` unchanged.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests for the new field shape**

```typescript
// packages/cli/src/vps/config.test.ts
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadVpsConfig } from "./config.ts";

function writeTempConfig(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-vps-config-"));
  const filePath = path.join(dir, "vps.json");
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe("loadVpsConfig", () => {
  it("returns null when the file does not exist", () => {
    const missingPath = path.join(os.tmpdir(), "digismith-vps-config-does-not-exist", "vps.json");
    expect(loadVpsConfig(missingPath)).toBeNull();
  });

  it("returns the parsed config when the file is valid", () => {
    const filePath = writeTempConfig(
      JSON.stringify({
        host: "46.225.49.140",
        user: "root",
        identity_file: "~/.ssh/jazurite",
        workspace_label: "digismith-main",
        agent_name: "opencode-main",
      })
    );
    expect(loadVpsConfig(filePath)).toEqual({
      host: "46.225.49.140",
      user: "root",
      identity_file: "~/.ssh/jazurite",
      workspace_label: "digismith-main",
      agent_name: "opencode-main",
    });
  });

  it("throws a clear error when the file is not valid JSON", () => {
    const filePath = writeTempConfig("not json");
    expect(() => loadVpsConfig(filePath)).toThrow("is not valid JSON");
  });

  it("throws a clear error naming the missing field(s)", () => {
    const filePath = writeTempConfig(JSON.stringify({ host: "1.2.3.4", user: "root" }));
    expect(() => loadVpsConfig(filePath)).toThrow("identity_file, workspace_label, agent_name");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @digismith/cli test vps/config`
Expected: FAIL — the "valid config" and "missing field(s)" tests fail against the old `tmux_session`-shaped implementation.

- [ ] **Step 3: Update the implementation**

```typescript
// packages/cli/src/vps/config.ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const DEFAULT_VPS_CONFIG_PATH = path.join(os.homedir(), ".digismith-depot", "vps.json");

export interface VpsConfig {
  host: string;
  user: string;
  identity_file: string;
  workspace_label: string;
  agent_name: string;
}

const REQUIRED_FIELDS: (keyof VpsConfig)[] = ["host", "user", "identity_file", "workspace_label", "agent_name"];

export function loadVpsConfig(filePath: string = DEFAULT_VPS_CONFIG_PATH): VpsConfig | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`vps-session: ${filePath} is not valid JSON (${(err as Error).message})`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`vps-session: ${filePath} must contain a JSON object`);
  }

  const record = parsed as Record<string, unknown>;
  const missing = REQUIRED_FIELDS.filter((field) => typeof record[field] !== "string");
  if (missing.length > 0) {
    throw new Error(`vps-session: ${filePath} is missing required field(s): ${missing.join(", ")}`);
  }

  return parsed as VpsConfig;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @digismith/cli test vps/config`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/vps/config.ts packages/cli/src/vps/config.test.ts
git commit -m "feat(vps): replace tmux_session with workspace_label/agent_name in VpsConfig"
```

---

## Task 3: Rewrite `vps/checks.ts` against herdr

**Files:**
- Modify: `packages/cli/src/vps/checks.ts`
- Modify: `packages/cli/src/vps/checks.test.ts`

**Interfaces:**
- Consumes: `VpsConfig` (Task 2's new shape).
- Produces: `SshCommand` (unchanged shape: `{command: string; args: string[]}`), `buildBaseSshArgs(config)`, `buildReachabilityCommand(config)` (both unchanged), `buildHerdrVersionCommand(config)`, `buildHerdrServerCheckCommand(config)`, `buildToolchainCommand(config)` (now checks `opencode`, not `claude`), `buildAgentGetCommand(config)`, `buildCredentialsCheckCommand(config)` (now checks `~/.config/tokenreply.env`), `HERDR_PATH_PREFIX: string`, `isHerdrInstalled(exitCode: number): boolean`, `isHerdrServerRunning(exitCode: number): boolean`, `parseToolchainOutput(exitCode, stdout): ToolchainCheckResult` (same shape/behavior as before, just different tool name in the missing-piece message text), `parseAgentGetOutput(exitCode: number, stdout: string): { alive: boolean; agentStatus?: string; detail: string }`. Tasks 4 and 5 both import from here.

`buildLingerCommand`/`isLingerEnabled`/`buildTmuxListCommand`/`buildPaneCommandQuery`/`isTmuxSessionAlive`/`isClaudeProcessRunning` are all deleted, not kept.

- [ ] **Step 1: Write the failing tests for the new builders and parsers**

```typescript
// packages/cli/src/vps/checks.test.ts
import { describe, it, expect } from "vitest";
import type { VpsConfig } from "./config.ts";
import {
  buildBaseSshArgs,
  buildReachabilityCommand,
  buildHerdrVersionCommand,
  buildHerdrServerCheckCommand,
  buildToolchainCommand,
  buildAgentGetCommand,
  buildCredentialsCheckCommand,
  HERDR_PATH_PREFIX,
  isHerdrInstalled,
  isHerdrServerRunning,
  parseToolchainOutput,
  parseAgentGetOutput,
} from "./checks.ts";

const CONFIG: VpsConfig = {
  host: "46.225.49.140",
  user: "root",
  identity_file: "~/.ssh/jazurite",
  workspace_label: "digismith-main",
  agent_name: "opencode-main",
};

describe("buildBaseSshArgs", () => {
  it("includes non-interactive flags, identity file, and user@host", () => {
    expect(buildBaseSshArgs(CONFIG)).toEqual([
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=10",
      "-o", "IdentitiesOnly=yes",
      "-i", "~/.ssh/jazurite",
      "root@46.225.49.140",
    ]);
  });
});

describe("buildReachabilityCommand", () => {
  it("runs a bare true over ssh", () => {
    const cmd = buildReachabilityCommand(CONFIG);
    expect(cmd.command).toBe("ssh");
    expect(cmd.args[cmd.args.length - 1]).toBe("true");
  });
});

describe("HERDR_PATH_PREFIX", () => {
  it("puts herdr's install location on PATH explicitly", () => {
    expect(HERDR_PATH_PREFIX).toBe('export PATH="$HOME/.local/bin:$PATH"');
  });
});

describe("buildHerdrVersionCommand", () => {
  it("checks herdr's version after ensuring it's on PATH", () => {
    const cmd = buildHerdrVersionCommand(CONFIG);
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain(HERDR_PATH_PREFIX);
    expect(remote).toContain("herdr --version");
  });
});

describe("buildHerdrServerCheckCommand", () => {
  it("lists herdr agents to confirm the server socket is reachable", () => {
    const cmd = buildHerdrServerCheckCommand(CONFIG);
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain(HERDR_PATH_PREFIX);
    expect(remote).toContain("herdr agent list");
  });
});

describe("buildToolchainCommand", () => {
  it("sources nvm and pnpm before checking opencode", () => {
    const cmd = buildToolchainCommand(CONFIG);
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain('NVM_DIR="$HOME/.nvm"');
    expect(remote).toContain("nvm use default");
    expect(remote).toContain('PNPM_HOME="$HOME/.local/share/pnpm"');
    expect(remote).toContain("opencode --version");
    expect(remote).not.toContain("claude --version");
  });
});

describe("buildAgentGetCommand", () => {
  it("queries herdr for the configured agent's status", () => {
    const cmd = buildAgentGetCommand(CONFIG);
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain(HERDR_PATH_PREFIX);
    expect(remote).toContain("herdr agent get opencode-main");
  });
});

describe("buildCredentialsCheckCommand", () => {
  it("tests for the TokenReply credential file", () => {
    const cmd = buildCredentialsCheckCommand(CONFIG);
    expect(cmd.args[cmd.args.length - 1]).toBe("test -f ~/.config/tokenreply.env");
  });
});

describe("isHerdrInstalled", () => {
  it("is true on a zero exit code", () => {
    expect(isHerdrInstalled(0)).toBe(true);
  });

  it("is false on a non-zero exit code", () => {
    expect(isHerdrInstalled(127)).toBe(false);
  });
});

describe("isHerdrServerRunning", () => {
  it("is true on a zero exit code", () => {
    expect(isHerdrServerRunning(0)).toBe(true);
  });

  it("is false on a non-zero exit code", () => {
    expect(isHerdrServerRunning(1)).toBe(false);
  });
});

describe("parseToolchainOutput", () => {
  it("reports ready with the version on success", () => {
    expect(parseToolchainOutput(0, "1.18.31\n")).toEqual({ ready: true, version: "1.18.31" });
  });

  it("reports which piece is missing on failure", () => {
    expect(parseToolchainOutput(1, "MISSING:pnpm\n")).toEqual({ ready: false, missing: "pnpm" });
  });

  it("falls back to unknown when the failure output doesn't match", () => {
    expect(parseToolchainOutput(1, "some other error\n")).toEqual({ ready: false, missing: "unknown" });
  });

  it("finds the MISSING marker after preceding output", () => {
    expect(parseToolchainOutput(1, "some warning line\nMISSING:opencode\n")).toEqual({ ready: false, missing: "opencode" });
  });
});

describe("parseAgentGetOutput", () => {
  it("reports alive with the parsed agent_status on success", () => {
    const stdout = JSON.stringify({
      id: "cli:agent:get",
      result: { agent: { agent_status: "idle", agent: "opencode", name: "opencode-main" } },
    });
    expect(parseAgentGetOutput(0, stdout)).toEqual({
      alive: true,
      agentStatus: "idle",
      detail: "idle",
    });
  });

  it("reports not alive on a non-zero exit code", () => {
    expect(parseAgentGetOutput(1, "")).toEqual({ alive: false, detail: "" });
  });

  it("reports not alive when stdout isn't parseable JSON despite exit 0", () => {
    expect(parseAgentGetOutput(0, "not json")).toEqual({ alive: false, detail: "not json" });
  });

  it("reports not alive when the expected fields are missing despite exit 0 and valid JSON", () => {
    expect(parseAgentGetOutput(0, JSON.stringify({ id: "cli:agent:get" }))).toEqual({
      alive: false,
      detail: JSON.stringify({ id: "cli:agent:get" }),
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @digismith/cli test vps/checks`
Expected: FAIL — none of the new exports exist yet.

- [ ] **Step 3: Rewrite the implementation**

```typescript
// packages/cli/src/vps/checks.ts
import type { VpsConfig } from "./config.ts";

export interface SshCommand {
  command: string;
  args: string[];
}

const SSH_CONNECT_FLAGS = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "IdentitiesOnly=yes"];

export function buildBaseSshArgs(config: VpsConfig): string[] {
  return [...SSH_CONNECT_FLAGS, "-i", config.identity_file, `${config.user}@${config.host}`];
}

export function buildReachabilityCommand(config: VpsConfig): SshCommand {
  return { command: "ssh", args: [...buildBaseSshArgs(config), "true"] };
}

// herdr's own Unix installer does not add ~/.local/bin to ~/.bashrc, and a
// non-interactive SSH shell doesn't source ~/.bashrc regardless — every
// herdr-related remote command must export this itself.
export const HERDR_PATH_PREFIX = 'export PATH="$HOME/.local/bin:$PATH"';

export function buildHerdrVersionCommand(config: VpsConfig): SshCommand {
  return { command: "ssh", args: [...buildBaseSshArgs(config), `${HERDR_PATH_PREFIX}; herdr --version`] };
}

export function buildHerdrServerCheckCommand(config: VpsConfig): SshCommand {
  return { command: "ssh", args: [...buildBaseSshArgs(config), `${HERDR_PATH_PREFIX}; herdr agent list`] };
}

// A plain `ssh host "opencode --version"` sees no opencode on PATH: a
// non-interactive, non-login shell never sources ~/.bashrc, so nvm/pnpm's
// PATH additions are invisible unless sourced explicitly here.
const TOOLCHAIN_REMOTE_SCRIPT = [
  'export NVM_DIR="$HOME/.nvm"',
  'if [ -s "$NVM_DIR/nvm.sh" ]; then . "$NVM_DIR/nvm.sh"; else echo "MISSING:nvm"; exit 1; fi',
  'nvm use default >/dev/null 2>&1 || { echo "MISSING:node"; exit 1; }',
  'export PNPM_HOME="$HOME/.local/share/pnpm"',
  'export PATH="$PNPM_HOME/bin:$PNPM_HOME:$PATH"',
  'command -v node >/dev/null 2>&1 || { echo "MISSING:node"; exit 1; }',
  'command -v pnpm >/dev/null 2>&1 || { echo "MISSING:pnpm"; exit 1; }',
  'command -v opencode >/dev/null 2>&1 || { echo "MISSING:opencode"; exit 1; }',
  "opencode --version",
].join("; ");

export function buildToolchainCommand(config: VpsConfig): SshCommand {
  return { command: "ssh", args: [...buildBaseSshArgs(config), TOOLCHAIN_REMOTE_SCRIPT] };
}

export function buildAgentGetCommand(config: VpsConfig): SshCommand {
  return {
    command: "ssh",
    args: [...buildBaseSshArgs(config), `${HERDR_PATH_PREFIX}; herdr agent get ${config.agent_name}`],
  };
}

export function buildCredentialsCheckCommand(config: VpsConfig): SshCommand {
  return { command: "ssh", args: [...buildBaseSshArgs(config), "test -f ~/.config/tokenreply.env"] };
}

export function isHerdrInstalled(exitCode: number): boolean {
  return exitCode === 0;
}

export function isHerdrServerRunning(exitCode: number): boolean {
  return exitCode === 0;
}

export interface ToolchainCheckResult {
  ready: boolean;
  missing?: string;
  version?: string;
}

export function parseToolchainOutput(exitCode: number, stdout: string): ToolchainCheckResult {
  const trimmed = stdout.trim();
  if (exitCode !== 0) {
    const match = trimmed.match(/^MISSING:(\w+)/m);
    return { ready: false, missing: match ? match[1] : "unknown" };
  }
  return { ready: true, version: trimmed };
}

export interface AgentGetResult {
  alive: boolean;
  agentStatus?: string;
  detail: string;
}

interface HerdrAgentGetResponse {
  result?: { agent?: { agent_status?: unknown } };
}

export function parseAgentGetOutput(exitCode: number, stdout: string): AgentGetResult {
  const trimmed = stdout.trim();
  if (exitCode !== 0) {
    return { alive: false, detail: trimmed };
  }
  let parsed: HerdrAgentGetResponse;
  try {
    parsed = JSON.parse(trimmed) as HerdrAgentGetResponse;
  } catch {
    return { alive: false, detail: trimmed };
  }
  const status = parsed.result?.agent?.agent_status;
  if (typeof status !== "string") {
    return { alive: false, detail: trimmed };
  }
  return { alive: true, agentStatus: status, detail: status };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @digismith/cli test vps/checks`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/vps/checks.ts packages/cli/src/vps/checks.test.ts
git commit -m "feat(vps): rewrite checks.ts against herdr instead of tmux"
```

---

## Task 4: Rewrite `vps/status.ts`

**Files:**
- Modify: `packages/cli/src/vps/status.ts`
- Modify: `packages/cli/src/vps/status.test.ts`

**Interfaces:**
- Consumes: `VpsConfig` (Task 2), everything from `checks.ts` (Task 3), `runSshCommand` from `run-command.ts` (unchanged).
- Produces: `interface CheckOutcome { ok: boolean; detail: string }` (unchanged), `interface StatusReport { configPath: string; sshReachable: CheckOutcome; herdrInstalled: CheckOutcome; herdrServerRunning: CheckOutcome; toolchainReady: CheckOutcome; agentAlive: CheckOutcome; openCodeRunning: CheckOutcome; credentialsPresent: CheckOutcome; }`, `formatStatusReport(report): string`, `isFullyHealthy(report): boolean`, `runStatusChecks(config, configPath): StatusReport`, `statusCommand: CommandModule`. Task 5 imports `runStatusChecks`.

`lingerEnabled`, `tmuxAlive`, `claudeRunning` are gone from the report shape. `agentAlive`/`openCodeRunning` are both derived from the same `parseAgentGetOutput` call in Task 3 for now — see the design doc's own callout on the herdr-pane-survival assumption; this pairing may need to become genuinely independent once Task 6's live verification confirms what herdr actually reports for a dead agent process versus a torn-down workspace. Don't over-build a distinction that isn't confirmed yet.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/cli/src/vps/status.test.ts
import { describe, it, expect } from "vitest";
import { formatStatusReport, isFullyHealthy, type StatusReport } from "./status.ts";

function healthyReport(): StatusReport {
  return {
    configPath: "/home/jack/.digismith-depot/vps.json",
    sshReachable: { ok: true, detail: "" },
    herdrInstalled: { ok: true, detail: "0.9.1" },
    herdrServerRunning: { ok: true, detail: "" },
    toolchainReady: { ok: true, detail: "1.18.31" },
    agentAlive: { ok: true, detail: "idle" },
    openCodeRunning: { ok: true, detail: "idle" },
    credentialsPresent: { ok: true, detail: "present" },
  };
}

describe("formatStatusReport", () => {
  it("marks every check OK when all are healthy", () => {
    const text = formatStatusReport(healthyReport());
    expect(text).toContain("[OK] SSH reachable");
    expect(text).toContain("[OK] herdr installed — 0.9.1");
    expect(text).toContain("[OK] herdr server running");
    expect(text).toContain("[OK] Toolchain on PATH — 1.18.31");
    expect(text).toContain("[OK] Workspace/agent alive — idle");
    expect(text).toContain("[OK] OpenCode running — idle");
    expect(text).toContain("[OK] Credentials persisted — present");
    expect(text).not.toContain("Lingering");
  });

  it("marks a failing check as FAIL with its detail", () => {
    const report = healthyReport();
    report.agentAlive = { ok: false, detail: "no such agent" };
    const text = formatStatusReport(report);
    expect(text).toContain("[FAIL] Workspace/agent alive — no such agent");
  });

  it("omits the detail separator when a check has no detail", () => {
    const text = formatStatusReport(healthyReport());
    expect(text).toContain("[OK] SSH reachable\n");
    expect(text).not.toContain("[OK] SSH reachable —");
  });
});

describe("isFullyHealthy", () => {
  it("is true when every check passes", () => {
    expect(isFullyHealthy(healthyReport())).toBe(true);
  });

  it("is false when any single check fails", () => {
    const report = healthyReport();
    report.credentialsPresent = { ok: false, detail: "missing" };
    expect(isFullyHealthy(report)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @digismith/cli test vps/status`
Expected: FAIL — the current implementation still has the old `StatusReport` shape.

- [ ] **Step 3: Rewrite the implementation**

```typescript
// packages/cli/src/vps/status.ts
import type { CommandModule } from "yargs";
import { DEFAULT_VPS_CONFIG_PATH, type VpsConfig } from "./config.ts";
import { loadConfigOrExit } from "./shared.ts";
import {
  buildReachabilityCommand,
  buildHerdrVersionCommand,
  buildHerdrServerCheckCommand,
  buildToolchainCommand,
  buildAgentGetCommand,
  buildCredentialsCheckCommand,
  isHerdrInstalled,
  isHerdrServerRunning,
  parseToolchainOutput,
  parseAgentGetOutput,
} from "./checks.ts";
import { runSshCommand } from "./run-command.ts";

export interface CheckOutcome {
  ok: boolean;
  detail: string;
}

export interface StatusReport {
  configPath: string;
  sshReachable: CheckOutcome;
  herdrInstalled: CheckOutcome;
  herdrServerRunning: CheckOutcome;
  toolchainReady: CheckOutcome;
  agentAlive: CheckOutcome;
  openCodeRunning: CheckOutcome;
  credentialsPresent: CheckOutcome;
}

function formatLine(label: string, outcome: CheckOutcome): string {
  const mark = outcome.ok ? "OK" : "FAIL";
  return `[${mark}] ${label}${outcome.detail ? ` — ${outcome.detail}` : ""}`;
}

export function formatStatusReport(report: StatusReport): string {
  return [
    `VPS config: ${report.configPath}`,
    formatLine("SSH reachable", report.sshReachable),
    formatLine("herdr installed", report.herdrInstalled),
    formatLine("herdr server running", report.herdrServerRunning),
    formatLine("Toolchain on PATH", report.toolchainReady),
    formatLine("Workspace/agent alive", report.agentAlive),
    formatLine("OpenCode running", report.openCodeRunning),
    formatLine("Credentials persisted", report.credentialsPresent),
  ].join("\n");
}

export function isFullyHealthy(report: StatusReport): boolean {
  return (
    report.sshReachable.ok &&
    report.herdrInstalled.ok &&
    report.herdrServerRunning.ok &&
    report.toolchainReady.ok &&
    report.agentAlive.ok &&
    report.openCodeRunning.ok &&
    report.credentialsPresent.ok
  );
}

export function runStatusChecks(config: VpsConfig, configPath: string): StatusReport {
  const reach = runSshCommand(buildReachabilityCommand(config));
  if (reach.status !== 0) {
    const skipped: CheckOutcome = { ok: false, detail: "skipped — SSH unreachable" };
    return {
      configPath,
      sshReachable: { ok: false, detail: reach.stderr.trim() || "connection failed" },
      herdrInstalled: skipped,
      herdrServerRunning: skipped,
      toolchainReady: skipped,
      agentAlive: skipped,
      openCodeRunning: skipped,
      credentialsPresent: skipped,
    };
  }

  const herdrVersion = runSshCommand(buildHerdrVersionCommand(config));
  const herdrInstalledOk = isHerdrInstalled(herdrVersion.status);

  const skippedNoHerdr: CheckOutcome = { ok: false, detail: "skipped — herdr not installed" };
  const herdrServerRunning = herdrInstalledOk
    ? (() => {
        const check = runSshCommand(buildHerdrServerCheckCommand(config));
        return { ok: isHerdrServerRunning(check.status), detail: check.status === 0 ? "" : check.stderr.trim() };
      })()
    : skippedNoHerdr;

  const toolchain = runSshCommand(buildToolchainCommand(config));
  const toolchainResult = parseToolchainOutput(toolchain.status, toolchain.stdout);

  let agentAlive: CheckOutcome;
  let openCodeRunning: CheckOutcome;
  if (!herdrServerRunning.ok) {
    agentAlive = { ok: false, detail: "skipped — herdr server not running" };
    openCodeRunning = { ok: false, detail: "skipped — herdr server not running" };
  } else {
    const agentGet = runSshCommand(buildAgentGetCommand(config));
    const parsed = parseAgentGetOutput(agentGet.status, agentGet.stdout);
    agentAlive = { ok: parsed.alive, detail: parsed.detail };
    openCodeRunning = { ok: parsed.alive, detail: parsed.detail };
  }

  const creds = runSshCommand(buildCredentialsCheckCommand(config));

  return {
    configPath,
    sshReachable: { ok: true, detail: "" },
    herdrInstalled: { ok: herdrInstalledOk, detail: herdrInstalledOk ? herdrVersion.stdout.trim() : "not found" },
    herdrServerRunning,
    toolchainReady: {
      ok: toolchainResult.ready,
      detail: toolchainResult.ready ? toolchainResult.version ?? "" : `missing: ${toolchainResult.missing}`,
    },
    agentAlive,
    openCodeRunning,
    credentialsPresent: {
      ok: creds.status === 0,
      detail: creds.status === 0 ? "present" : "missing",
    },
  };
}

export const statusCommand: CommandModule = {
  command: "status",
  describe: "read-only health report of the VPS OpenCode session",
  handler: () => {
    const config = loadConfigOrExit();
    const report = runStatusChecks(config, DEFAULT_VPS_CONFIG_PATH);
    console.log(formatStatusReport(report));
    process.exitCode = isFullyHealthy(report) ? 0 : 1;
  },
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @digismith/cli test vps/status`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/vps/status.ts packages/cli/src/vps/status.test.ts
git commit -m "feat(vps): rewrite status.ts to report herdr/OpenCode health"
```

---

## Task 5: Rewrite `vps/connect.ts` and update Depot's SKILL.md

**Files:**
- Modify: `packages/cli/src/vps/connect.ts`
- Modify: `packages/cli/src/vps/connect.test.ts`
- Modify: `skills/depot/SKILL.md`

**Interfaces:**
- Consumes: `VpsConfig` (Task 2), `runStatusChecks`/`StatusReport` (Task 4), `resolveDigismithRepo` (Task 1 — genuinely used here: `opencode.json` generation shells out to DigiSmith's own `scripts/providers/print-config.ts`, which lives in the source repo, not in the published `@digismith/cli` package), `runSshCommand` (unchanged), `loadConfigOrExit` (unchanged `shared.ts`).
- Produces: `TOOLCHAIN_INSTALL_HINT: string`, `buildInstallHerdrIntegrationCommand(config): SshCommand`, `buildStartHerdrServerCommand(config): SshCommand`, `buildCreateWorkspaceCommand(config): SshCommand`, `buildStartAgentCommand(config): SshCommand`, `buildAttachArgs(config): string[]`, `buildScpArgs(config, localPath, remotePath): string[]`, `buildPrintConfigCommand(repoPath: string): string[]`, `runConnect(config, configPath): never`, `connectCommand: CommandModule`.

This is the biggest task — the full auto-fix sequence. Read the design doc's Connect section again before starting; this task implements it exactly, in order. Per the design's Credential & Provider Config section: `opencode.json` is generated by **reusing** `scripts/providers/print-config.ts tokenreply --role task --runner opencode` as-is ("no new integration code") — never reimplement its provider-block logic here.

- [ ] **Step 1: Write the failing tests for the pure builder functions**

```typescript
// packages/cli/src/vps/connect.test.ts
import { describe, it, expect } from "vitest";
import * as path from "node:path";
import type { VpsConfig } from "./config.ts";
import {
  TOOLCHAIN_INSTALL_HINT,
  buildInstallHerdrIntegrationCommand,
  buildStartHerdrServerCommand,
  buildCreateWorkspaceCommand,
  buildStartAgentCommand,
  buildAttachArgs,
  buildScpArgs,
  buildPrintConfigCommand,
} from "./connect.ts";

const CONFIG: VpsConfig = {
  host: "46.225.49.140",
  user: "root",
  identity_file: "~/.ssh/jazurite",
  workspace_label: "digismith-main",
  agent_name: "opencode-main",
};

describe("TOOLCHAIN_INSTALL_HINT", () => {
  it("names every manual install step the design points at", () => {
    expect(TOOLCHAIN_INSTALL_HINT).toContain("nvm");
    expect(TOOLCHAIN_INSTALL_HINT).toContain("corepack enable");
    expect(TOOLCHAIN_INSTALL_HINT).toContain("pnpm add -g opencode-ai");
    expect(TOOLCHAIN_INSTALL_HINT).toContain("pnpm approve-builds --global opencode-ai");
    expect(TOOLCHAIN_INSTALL_HINT).toContain("herdr.dev");
  });
});

describe("buildInstallHerdrIntegrationCommand", () => {
  it("installs herdr's opencode integration plugin", () => {
    const cmd = buildInstallHerdrIntegrationCommand(CONFIG);
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain("herdr integration install opencode");
  });
});

describe("buildStartHerdrServerCommand", () => {
  it("starts herdr's server detached and backgrounded", () => {
    const cmd = buildStartHerdrServerCommand(CONFIG);
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain("nohup herdr server");
    expect(remote).toContain("&");
  });
});

describe("buildCreateWorkspaceCommand", () => {
  it("creates a herdr workspace with the configured label, unfocused", () => {
    const cmd = buildCreateWorkspaceCommand(CONFIG);
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain("herdr workspace create");
    expect(remote).toContain("--label digismith-main");
    expect(remote).toContain("--no-focus");
  });
});

describe("buildStartAgentCommand", () => {
  it("starts the configured agent name running OpenCode on the default model", () => {
    const cmd = buildStartAgentCommand(CONFIG);
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain("herdr agent start opencode-main --kind opencode");
    expect(remote).toContain("--model tokenreply/kimi-k2.7");
  });
});

describe("buildAttachArgs", () => {
  it("builds an interactive ssh attach command for the configured agent", () => {
    expect(buildAttachArgs(CONFIG)).toEqual([
      "-i", "~/.ssh/jazurite",
      "-o", "IdentitiesOnly=yes",
      "-t", "root@46.225.49.140",
      "herdr agent attach opencode-main",
    ]);
  });
});

describe("buildScpArgs", () => {
  it("builds an scp command copying a local file to the configured remote path", () => {
    expect(buildScpArgs(CONFIG, "/tmp/local-file", "~/.config/tokenreply.env")).toEqual([
      "-i", "~/.ssh/jazurite",
      "-o", "IdentitiesOnly=yes",
      "/tmp/local-file",
      "root@46.225.49.140:~/.config/tokenreply.env",
    ]);
  });
});

describe("buildPrintConfigCommand", () => {
  it("builds the node args to resolve tokenreply's opencode provider block via the source repo's script", () => {
    const args = buildPrintConfigCommand("/home/jack/digismith");
    expect(args).toEqual([
      path.join("/home/jack/digismith", "scripts", "providers", "print-config.ts"),
      "tokenreply",
      "--role", "task",
      "--runner", "opencode",
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @digismith/cli test vps/connect`
Expected: FAIL — none of the new exports exist yet.

- [ ] **Step 3: Rewrite the implementation**

```typescript
// packages/cli/src/vps/connect.ts
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CommandModule } from "yargs";
import { DEFAULT_VPS_CONFIG_PATH, type VpsConfig } from "./config.ts";
import { buildBaseSshArgs, type SshCommand } from "./checks.ts";
import { runSshCommand } from "./run-command.ts";
import { runStatusChecks } from "./status.ts";
import { loadConfigOrExit } from "./shared.ts";
import { resolveDigismithRepo } from "../shared/digismith-repo.ts";

const DEFAULT_MODEL = "tokenreply/kimi-k2.7";

export const TOOLCHAIN_INSTALL_HINT = [
  "Install the missing piece by hand on the VPS, then retry:",
  "  nvm:     curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash && nvm install --lts",
  "  pnpm:    corepack enable",
  "  opencode: pnpm add -g opencode-ai && pnpm approve-builds --global opencode-ai",
  "  herdr:   curl -fsSL https://herdr.dev/install.sh | sh",
].join("\n");

export function buildInstallHerdrIntegrationCommand(config: VpsConfig): SshCommand {
  return {
    command: "ssh",
    args: [...buildBaseSshArgs(config), 'export PATH="$HOME/.local/bin:$PATH"; herdr integration install opencode'],
  };
}

export function buildStartHerdrServerCommand(config: VpsConfig): SshCommand {
  return {
    command: "ssh",
    args: [
      ...buildBaseSshArgs(config),
      'export PATH="$HOME/.local/bin:$PATH"; nohup herdr server > ~/herdr-server.log 2>&1 &',
    ],
  };
}

export function buildCreateWorkspaceCommand(config: VpsConfig): SshCommand {
  const remote = [
    'export PATH="$HOME/.local/bin:$PATH"',
    `herdr workspace create --cwd "$HOME" --label ${config.workspace_label} --no-focus`,
  ].join("; ");
  return { command: "ssh", args: [...buildBaseSshArgs(config), remote] };
}

export function buildStartAgentCommand(config: VpsConfig): SshCommand {
  const remote = [
    'export PATH="$HOME/.local/bin:$PATH"',
    `herdr agent start ${config.agent_name} --kind opencode --pane \${PANE_ID} -- --model ${DEFAULT_MODEL}`,
  ].join("; ");
  return { command: "ssh", args: [...buildBaseSshArgs(config), remote] };
}

export function buildAttachArgs(config: VpsConfig): string[] {
  return [
    "-i", config.identity_file,
    "-o", "IdentitiesOnly=yes",
    "-t", `${config.user}@${config.host}`,
    `herdr agent attach ${config.agent_name}`,
  ];
}

export function buildScpArgs(config: VpsConfig, localPath: string, remotePath: string): string[] {
  return [
    "-i", config.identity_file,
    "-o", "IdentitiesOnly=yes",
    localPath,
    `${config.user}@${config.host}:${remotePath}`,
  ];
}

export function buildPrintConfigCommand(repoPath: string): string[] {
  return [
    path.join(repoPath, "scripts", "providers", "print-config.ts"),
    "tokenreply",
    "--role", "task",
    "--runner", "opencode",
  ];
}

function scpToVps(config: VpsConfig, content: string, remotePath: string, label: string): void {
  const tmpFile = path.join(os.tmpdir(), `digismith-vps-${label}-${Date.now()}`);
  fs.writeFileSync(tmpFile, content);
  try {
    const result = spawnSync("scp", buildScpArgs(config, tmpFile, remotePath), { stdio: "pipe", encoding: "utf-8" });
    if (result.status !== 0) {
      throw new Error(`failed to copy ${label} to the VPS — ${(result.stderr ?? "").trim() || "scp failed"}`);
    }
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

function findLocalTokenReplyKey(): string | null {
  const envPath = path.join(os.homedir(), ".digismith-depot", ".env");
  if (!fs.existsSync(envPath)) return null;
  const line = fs
    .readFileSync(envPath, "utf-8")
    .split("\n")
    .find((l) => l.startsWith("TOKENREPLY_API_KEY="));
  if (!line) return null;
  return line.slice("TOKENREPLY_API_KEY=".length).trim();
}

export function runConnect(config: VpsConfig, configPath: string): never {
  const status = runStatusChecks(config, configPath);

  if (!status.sshReachable.ok) {
    console.error(`vps-session: SSH unreachable — ${status.sshReachable.detail}`);
    process.exit(1);
  }

  if (!status.herdrInstalled.ok) {
    console.error("vps-session: herdr is not installed on the VPS.");
    console.error(TOOLCHAIN_INSTALL_HINT);
    process.exit(1);
  }

  if (!status.toolchainReady.ok) {
    console.error(`vps-session: toolchain not ready on the VPS (${status.toolchainReady.detail}).`);
    console.error(TOOLCHAIN_INSTALL_HINT);
    process.exit(1);
  }

  if (!status.herdrServerRunning.ok) {
    console.log("vps-session: herdr server not running, starting it...");
    const start = runSshCommand(buildStartHerdrServerCommand(config));
    if (start.status !== 0) {
      console.error(`vps-session: failed to start herdr server — ${start.stderr.trim()}`);
      process.exit(1);
    }
  }

  if (!status.credentialsPresent.ok) {
    console.log("vps-session: TokenReply credential missing on the VPS, copying from local machine...");
    const key = findLocalTokenReplyKey();
    if (!key) {
      console.error(
        "vps-session: no TOKENREPLY_API_KEY found in ~/.digismith-depot/.env locally either — nothing to copy."
      );
      process.exit(1);
    }
    try {
      scpToVps(config, `export TOKENREPLY_API_KEY=${key}\n`, "~/.config/tokenreply.env", "tokenreply-env");
    } catch (err) {
      console.error(`vps-session: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  // opencode.json is regenerated unconditionally — status has no way to
  // detect "malformed," and print-config.ts is cheap/pure, so there's no
  // real gain from trying to detect "already correct" first. Reuses
  // DigiSmith's own scripts/providers/print-config.ts as-is, per the
  // design's explicit "no new integration code" call — never reimplement
  // its provider-block logic here.
  let repoPath: string;
  try {
    repoPath = resolveDigismithRepo(undefined);
  } catch (err) {
    console.error(`vps-session: can't generate opencode.json — ${(err as Error).message}`);
    console.error("vps-session: run this from inside a DigiSmith checkout, or pass --repo <path>.");
    process.exit(1);
  }
  const printConfig = spawnSync("node", buildPrintConfigCommand(repoPath), { stdio: "pipe", encoding: "utf-8" });
  if (printConfig.status !== 0) {
    console.error(`vps-session: print-config.ts failed — ${(printConfig.stderr ?? "").trim()}`);
    process.exit(1);
  }
  try {
    scpToVps(config, printConfig.stdout, "~/.config/opencode/opencode.json", "opencode-config");
  } catch (err) {
    console.error(`vps-session: ${(err as Error).message}`);
    process.exit(1);
  }

  if (!status.agentAlive.ok) {
    console.log(`vps-session: workspace/agent "${config.agent_name}" not found, creating it...`);
    const create = runSshCommand(buildCreateWorkspaceCommand(config));
    if (create.status !== 0) {
      console.error(`vps-session: failed to create the herdr workspace — ${create.stderr.trim()}`);
      process.exit(1);
    }
    // Idempotent — writes the plugin file if absent, no-ops otherwise.
    runSshCommand(buildInstallHerdrIntegrationCommand(config));
    let paneId: string | null = null;
    try {
      const parsed = JSON.parse(create.stdout) as { result?: { root_pane?: { pane_id?: string } } };
      paneId = parsed.result?.root_pane?.pane_id ?? null;
    } catch {
      paneId = null;
    }
    if (!paneId) {
      console.error(`vps-session: could not parse a pane_id from workspace creation output:\n${create.stdout}`);
      process.exit(1);
    }
    const startAgentCmd = buildStartAgentCommand(config);
    startAgentCmd.args[startAgentCmd.args.length - 1] = startAgentCmd.args[startAgentCmd.args.length - 1].replace(
      "${PANE_ID}",
      paneId
    );
    const startAgent = runSshCommand(startAgentCmd);
    if (startAgent.status !== 0) {
      console.error(`vps-session: failed to start the OpenCode agent — ${startAgent.stderr.trim()}`);
      process.exit(1);
    }
  }

  console.log("vps-session: attaching...");
  // Node has no exec(2)-style process replacement; inheriting stdio and then
  // exiting with the child's own code is the closest equivalent to the
  // design's `exec ssh -t ...`.
  const attach = spawnSync("ssh", buildAttachArgs(config), { stdio: "inherit" });
  process.exit(attach.status ?? 1);
}

export const connectCommand: CommandModule = {
  command: "connect",
  describe: "fix what's safely fixable, then attach interactively",
  builder: (y) => y,
  handler: () => {
    const config = loadConfigOrExit();
    runConnect(config, DEFAULT_VPS_CONFIG_PATH);
  },
};
```

`resolveDigismithRepo` (Task 1) is a real, load-bearing import here: `@digismith/cli` is meant to work as a standalone global install (V.4's own stated goal), but `opencode.json` generation deliberately shells out to `scripts/providers/print-config.ts`, which only exists in a DigiSmith source checkout — exactly the same constraint `depot bridge` already has, using the exact same resolution function. Running `dg vps connect` therefore requires either being run from inside a DigiSmith checkout or passing `--repo <path>` (not yet wired as a flag on this command — out of scope for X.1; today it only checks `process.cwd()`, matching `loadConfigOrExit`'s own no-flags precedent). If this turns out to be too restrictive in practice, that's a real follow-up, not a silent gap: note it plainly in Task 6's live-verification pass rather than papering over it here.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @digismith/cli test vps/connect`
Expected: PASS, all tests green.

- [ ] **Step 5: Run the full CLI package test suite**

Run: `pnpm --filter @digismith/cli test`
Expected: PASS, no regressions.

- [ ] **Step 6: Update `skills/depot/SKILL.md`'s VPS Session section**

Read the current "VPS Session" resource section in full first (search for "VPS Session" in `skills/depot/SKILL.md`). Update it to say:
- Map item is **X.1**, not V.3 (V.3 is retired/replaced).
- The persistent resource is a herdr-managed OpenCode agent, not a tmux `claude` session.
- Credentials are a TokenReply API key (`~/.config/tokenreply.env` on the VPS), not `claude`'s OAuth login — still can't be fully automated on first-ever setup in the sense that the *value* must come from somewhere, but unlike OAuth this step **is** now automatable by `connect` itself when the local `.digismith-depot/.env` already has it.
- No lingering mention — remove references to `loginctl enable-linger` from this section entirely.
- The attach command is `herdr agent attach <agent_name>`, not `tmux attach`.

Keep the surrounding "Which Operation"/opt-in-only framing exactly as-is — that part of the design didn't change.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/vps/connect.ts packages/cli/src/vps/connect.test.ts skills/depot/SKILL.md
git commit -m "feat(vps): rewrite connect.ts for herdr, update Depot SKILL.md (X.1)"
```

---

## Task 6: Live-verify against the real VPS, including the pane-survival assumption

**Files:** none created or modified — this task is verification only, though it may produce follow-up fixes to Tasks 1-5's files if live behavior differs from what was implemented. Any such fix is a normal edit to the affected file(s), not a new file.

This task cannot be meaningfully unit-tested — matching V.3's own established precedent (its own design doc's Testing section), the actual SSH/herdr orchestration is live-verify-only by design. Do not skip this task or treat it as optional polish — V.3 itself shipped once without ever being live-verified and sat broken/unconfirmed for 8 days before anyone found out; this plan exists specifically to not repeat that.

**Prerequisites before starting:**
- The real VPS (`46.225.49.140`) must be reachable and `~/.ssh/jazurite` must be the working key — confirmed already true as of this plan's own design/spike work.
- `~/.digismith-depot/vps.json` on the machine running this verification must be updated to X.1's new shape (`workspace_label`/`agent_name` instead of `tmux_session`) before running `dg vps status`/`connect` — it currently still holds V.3's old shape. Update it as this task's own first step, don't assume it's already done.
- Build the CLI package first: `pnpm --filter @digismith/cli build`, then run commands via `node packages/cli/dist/index.js vps status` / `... vps connect` (or install it globally per V.4's own publish flow, if preferred).

- [ ] **Step 1: Update the local `vps.json` to X.1's config shape**

```bash
cat > ~/.digismith-depot/vps.json << 'EOF'
{
  "host": "46.225.49.140",
  "user": "root",
  "identity_file": "~/.ssh/jazurite",
  "workspace_label": "digismith-main",
  "agent_name": "opencode-main"
}
EOF
```

- [ ] **Step 2: Build the package and run `status` for the first time against real X.1 code**

Run: `pnpm --filter @digismith/cli build && node packages/cli/dist/index.js vps status`
Expected: some checks FAIL initially (herdr not installed as X.1 expects it yet, no workspace/agent exists, no `tokenreply.env` on the VPS) — this is normal for a first run. Confirm the report's wording and exit code behave as designed; this is not yet the healthy-state check.

- [ ] **Step 3: Run `connect` and observe the full auto-fix sequence for real**

Run: `node packages/cli/dist/index.js vps connect`
Watch each auto-fix step actually execute against the real VPS. Fix any real bug this surfaces (wrong flag, a JSON shape assumption that doesn't match herdr's real output, a quoting issue in a remote command) directly in the relevant Task 1-5 file, then re-run this step from the top until `connect` genuinely reaches the final `herdr agent attach` step and hands over an interactive session.

- [ ] **Step 4: Confirm the resulting session is a real, working OpenCode+TokenReply session**

Inside the attached session, prompt OpenCode with something simple (e.g. "what model are you, and what is 2+2?") and confirm a real TokenReply-backed response comes back — matching the same kind of check already done live in the original spikes. Detach without killing anything (herdr's own detach, not closing the SSH connection mid-command).

- [ ] **Step 5: Run `status` again and confirm it now reports fully healthy**

Run: `node packages/cli/dist/index.js vps status`
Expected: exit code 0, every check `[OK]`.

- [ ] **Step 6: Verify the actual pane-survival assumption the design flagged as unverified**

SSH in directly and kill the OpenCode process inside the herdr pane (find its PID via `ps -ef | grep opencode`, `kill <pid>`), then run `dg vps status` again. Confirm whether the pane/workspace survives (matching the design's assumption — `agentAlive` might stay true, distinct from what happens to be inferred for `openCodeRunning`) or whether the whole workspace disappears. **If the assumption was wrong** (the pane does not survive), this is a real gap: go back to Task 5 and add a fallback-shell equivalent to V.3's own `exec bash` pattern — herdr's `agent start` may need to wrap the `--` command in a small script (mirroring `~/start-claude.sh`'s shape) that keeps the pane's shell alive after OpenCode exits, rather than running `opencode` as the pane's direct foreground command. Do not leave this unresolved either way — the outcome (survives / needed a fix / needed a fix and now confirmed working) must be recorded in this task's own commit message or the plan's follow-up report.

- [ ] **Step 7: Confirm a real SSH-disconnect survival check, one more time, on the actual shipped code path**

This was already proven true for herdr generically during the original spikes (Task 6 of this plan is not re-deriving that from scratch) — but run it once against the actual shipped `dg vps connect` output specifically, since Step 6 may have changed how the agent is launched: disconnect (let the SSH connection close), reconnect fresh, run `dg vps status` again, confirm still healthy.

- [ ] **Step 8: Clean up V.3's retired tmux session, per the design doc's Migration section**

```bash
ssh -i ~/.ssh/jazurite root@46.225.49.140 '
tmux kill-session -t claude-main 2>/dev/null
rm -f ~/start-claude.sh
rm -f ~/.claude/.credentials.json
'
```

This is a manual, one-time step per the design — not something this plan's code automates.

- [ ] **Step 9: Commit the final verified state**

If Step 6 required a fix, that fix is already committed as part of amending Task 5's own commit or a small follow-up commit — do not leave uncommitted changes at the end of this task. If no fix was needed, there is nothing new to commit here; note in the plan's own tracking (or a `report-implementation` pass, if this plan goes through one) that live verification passed clean on the first real run.

---

## Self-Review Notes

- **Spec coverage:** every design.html section has a task — Overview/Architecture → Tasks 1-5, Config → Task 2, Credential & Provider Config → Task 5, status → Task 4, connect → Task 5, Migration → Task 6 Step 8, Error Handling → distributed across Tasks 3-5's implementations, Testing → the TDD structure of Tasks 1-4 plus Task 6's explicit live-verify-only stance for orchestration, Out of Scope → nothing in this plan touches the excluded items (classifier question, other Depot resources, `claude` support).
- **Placeholder scan:** no TBD/TODO; every step has real, complete code. The one open unknown (pane survival) is handled as an explicit, concrete verification-and-fix step in Task 6, not hand-waved.
- **Type consistency:** `VpsConfig`'s five fields are used identically across Tasks 2-5. `SshCommand` stays `{command, args}` throughout, unchanged from V.3. `StatusReport`'s field names (`herdrInstalled`, `herdrServerRunning`, `toolchainReady`, `agentAlive`, `openCodeRunning`, `credentialsPresent`) are used identically in Task 4's implementation and Task 5's `runConnect` checks.
- **Scope check:** appropriately sized for one plan — 6 tasks, each independently testable/reviewable, matching V.3's own original task count (6) for a comparable-scope rewrite.
