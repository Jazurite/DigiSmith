# VPS Session CLI (V.3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `scripts/vps-session/cli.ts`, a standalone `status`/`connect` CLI that reconnects to an already-provisioned Hetzner VPS's persistent `claude` tmux session over SSH, and document it as Depot's fourth managed resource.

**Architecture:** A small set of pure, unit-tested modules (config loading, SSH command construction, output parsing, status aggregation/formatting) wired together by two thin orchestration functions (`runStatusChecks`, `runConnect`) that do the actual `spawnSync`-based SSH/tmux work. The orchestration functions and the final interactive attach are live-verified against the real VPS, not unit tested — mocking SSH would only test the mock.

**Tech Stack:** TypeScript run via `node --experimental-strip-types` (no build step, matching `scripts/agentic-bridge/server.ts`), Vitest for unit tests, `node:child_process.spawnSync` for all SSH/process invocation.

## Global Constraints

- Node >=24, ES2022/NodeNext module resolution, `strict: true` — per `tsconfig.json`.
- No new npm dependencies — everything here is achievable with `node:fs`, `node:os`, `node:path`, `node:child_process`, `node:url`.
- Commit style: one-line `type(scope): summary`, no body, no AI attribution of any kind — per `standards/global/commit-style.md`.
- Code comments: default to none; only a WHY-comment for a genuinely non-obvious constraint — per `standards/global/code-comments.md`.
- Every SSH invocation is a single non-interactive `ssh -o BatchMode=yes -o ConnectTimeout=10 -i <identity_file> <user>@<host> "<remote-command>"` (or, for the final `connect` attach only, an interactive `ssh -t`) — never invoked through a shell string, always as an argv array, per `.digismith/docs/vps-session/design.html`.
- Config file: `~/.digismith-depot/vps.json` (`{"host", "user", "identity_file", "tmux_session"}`), no creation/edit tooling — written by hand, per the design.
- Absent config file → both commands stop immediately with a plain message; neither guesses a host.
- Missing credentials file is a warning, never a blocker, for `connect`.
- `connect`'s recreated remote start script must end in `exec bash`, never `exec claude` — so a `claude` crash doesn't kill the whole tmux session.

---

### Task 1: VPS config loader

**Files:**
- Create: `scripts/vps-session/config.ts`
- Test: `scripts/vps-session/config.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `export interface VpsConfig { host: string; user: string; identity_file: string; tmux_session: string }`, `export const DEFAULT_VPS_CONFIG_PATH: string`, `export function loadVpsConfig(filePath?: string): VpsConfig | null` (returns `null` when the file doesn't exist; throws `Error` with a `vps-session: ...` prefixed message when it exists but is malformed or missing a required field)

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/vps-session/config.test.ts
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
        tmux_session: "claude-main",
      })
    );
    expect(loadVpsConfig(filePath)).toEqual({
      host: "46.225.49.140",
      user: "root",
      identity_file: "~/.ssh/jazurite",
      tmux_session: "claude-main",
    });
  });

  it("throws a clear error when the file is not valid JSON", () => {
    const filePath = writeTempConfig("not json");
    expect(() => loadVpsConfig(filePath)).toThrow("is not valid JSON");
  });

  it("throws a clear error naming the missing field(s)", () => {
    const filePath = writeTempConfig(JSON.stringify({ host: "1.2.3.4", user: "root" }));
    expect(() => loadVpsConfig(filePath)).toThrow("identity_file, tmux_session");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/vps-session/config.test.ts`
Expected: FAIL — `Cannot find module './config.ts'` (or equivalent), since `config.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```typescript
// scripts/vps-session/config.ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const DEFAULT_VPS_CONFIG_PATH = path.join(os.homedir(), ".digismith-depot", "vps.json");

export interface VpsConfig {
  host: string;
  user: string;
  identity_file: string;
  tmux_session: string;
}

const REQUIRED_FIELDS: (keyof VpsConfig)[] = ["host", "user", "identity_file", "tmux_session"];

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/vps-session/config.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/vps-session/config.ts scripts/vps-session/config.test.ts
git commit -m "feat(vps-session): add VPS config loader"
```

---

### Task 2: SSH command builders and output parsers

**Files:**
- Create: `scripts/vps-session/checks.ts`
- Test: `scripts/vps-session/checks.test.ts`

**Interfaces:**
- Consumes: `VpsConfig` from Task 1 (`./config.ts`)
- Produces: `export interface SshCommand { command: string; args: string[] }`, `export function buildBaseSshArgs(config: VpsConfig): string[]`, `export function buildReachabilityCommand(config): SshCommand`, `export function buildLingerCommand(config): SshCommand`, `export function buildToolchainCommand(config): SshCommand`, `export function buildTmuxListCommand(config): SshCommand`, `export function buildCredentialsCheckCommand(config): SshCommand`, `export function buildPaneCommandQuery(config): SshCommand`, `export function isLingerEnabled(stdout: string): boolean`, `export interface ToolchainCheckResult { ready: boolean; missing?: string; version?: string }`, `export function parseToolchainOutput(exitCode: number, stdout: string): ToolchainCheckResult`, `export function isTmuxSessionAlive(stdout: string, sessionName: string): boolean`, `export function isClaudeProcessRunning(paneCommandOutput: string): boolean`

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/vps-session/checks.test.ts
import { describe, it, expect } from "vitest";
import type { VpsConfig } from "./config.ts";
import {
  buildBaseSshArgs,
  buildReachabilityCommand,
  buildLingerCommand,
  buildToolchainCommand,
  buildTmuxListCommand,
  buildCredentialsCheckCommand,
  buildPaneCommandQuery,
  isLingerEnabled,
  parseToolchainOutput,
  isTmuxSessionAlive,
  isClaudeProcessRunning,
} from "./checks.ts";

const CONFIG: VpsConfig = {
  host: "46.225.49.140",
  user: "root",
  identity_file: "~/.ssh/jazurite",
  tmux_session: "claude-main",
};

describe("buildBaseSshArgs", () => {
  it("includes non-interactive flags, identity file, and user@host", () => {
    expect(buildBaseSshArgs(CONFIG)).toEqual([
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=10",
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

describe("buildLingerCommand", () => {
  it("queries loginctl for the configured user", () => {
    const cmd = buildLingerCommand(CONFIG);
    expect(cmd.args[cmd.args.length - 1]).toBe("loginctl show-user root -p Linger");
  });
});

describe("buildToolchainCommand", () => {
  it("sources nvm and pnpm before checking claude", () => {
    const cmd = buildToolchainCommand(CONFIG);
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain('NVM_DIR="$HOME/.nvm"');
    expect(remote).toContain('PNPM_HOME="$HOME/.local/share/pnpm"');
    expect(remote).toContain("claude --version");
  });
});

describe("buildTmuxListCommand", () => {
  it("lists tmux sessions", () => {
    const cmd = buildTmuxListCommand(CONFIG);
    expect(cmd.args[cmd.args.length - 1]).toBe("tmux list-sessions");
  });
});

describe("buildCredentialsCheckCommand", () => {
  it("tests for the credentials file", () => {
    const cmd = buildCredentialsCheckCommand(CONFIG);
    expect(cmd.args[cmd.args.length - 1]).toBe("test -f ~/.claude/.credentials.json");
  });
});

describe("buildPaneCommandQuery", () => {
  it("queries the configured tmux session's current pane command", () => {
    const cmd = buildPaneCommandQuery(CONFIG);
    expect(cmd.args[cmd.args.length - 1]).toBe(
      'tmux list-panes -t claude-main -F "#{pane_current_command}"'
    );
  });
});

describe("isLingerEnabled", () => {
  it("is true only for an exact Linger=yes", () => {
    expect(isLingerEnabled("Linger=yes\n")).toBe(true);
    expect(isLingerEnabled("Linger=no\n")).toBe(false);
    expect(isLingerEnabled("")).toBe(false);
  });
});

describe("parseToolchainOutput", () => {
  it("reports ready with the version on success", () => {
    expect(parseToolchainOutput(0, "2.1.0 (Claude Code)\n")).toEqual({
      ready: true,
      version: "2.1.0 (Claude Code)",
    });
  });

  it("reports which piece is missing on failure", () => {
    expect(parseToolchainOutput(1, "MISSING:pnpm\n")).toEqual({ ready: false, missing: "pnpm" });
  });

  it("falls back to unknown when the failure output doesn't match", () => {
    expect(parseToolchainOutput(1, "some other error\n")).toEqual({ ready: false, missing: "unknown" });
  });
});

describe("isTmuxSessionAlive", () => {
  it("finds an exact session name among multiple listed sessions", () => {
    const stdout = "other-session: 1 windows\nclaude-main: 2 windows (created ...)\n";
    expect(isTmuxSessionAlive(stdout, "claude-main")).toBe(true);
  });

  it("returns false when the session isn't listed", () => {
    expect(isTmuxSessionAlive("other-session: 1 windows\n", "claude-main")).toBe(false);
  });
});

describe("isClaudeProcessRunning", () => {
  it("is true when the pane's current command is claude", () => {
    expect(isClaudeProcessRunning("claude\n")).toBe(true);
  });

  it("is false when the pane fell back to a shell", () => {
    expect(isClaudeProcessRunning("bash\n")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/vps-session/checks.test.ts`
Expected: FAIL — `Cannot find module './checks.ts'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// scripts/vps-session/checks.ts
import type { VpsConfig } from "./config.ts";

export interface SshCommand {
  command: string;
  args: string[];
}

const SSH_CONNECT_FLAGS = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10"];

export function buildBaseSshArgs(config: VpsConfig): string[] {
  return [...SSH_CONNECT_FLAGS, "-i", config.identity_file, `${config.user}@${config.host}`];
}

export function buildReachabilityCommand(config: VpsConfig): SshCommand {
  return { command: "ssh", args: [...buildBaseSshArgs(config), "true"] };
}

export function buildLingerCommand(config: VpsConfig): SshCommand {
  return { command: "ssh", args: [...buildBaseSshArgs(config), `loginctl show-user ${config.user} -p Linger`] };
}

// A plain `ssh host "claude --version"` sees no claude on PATH: a
// non-interactive, non-login shell never sources ~/.bashrc, so nvm/pnpm's
// PATH additions are invisible unless sourced explicitly here.
const TOOLCHAIN_REMOTE_SCRIPT = [
  'export NVM_DIR="$HOME/.nvm"',
  'if [ -s "$NVM_DIR/nvm.sh" ]; then . "$NVM_DIR/nvm.sh"; else echo "MISSING:nvm"; exit 1; fi',
  'export PNPM_HOME="$HOME/.local/share/pnpm"',
  'export PATH="$PNPM_HOME/bin:$PNPM_HOME:$PATH"',
  'command -v node >/dev/null 2>&1 || { echo "MISSING:node"; exit 1; }',
  'command -v pnpm >/dev/null 2>&1 || { echo "MISSING:pnpm"; exit 1; }',
  'command -v claude >/dev/null 2>&1 || { echo "MISSING:claude"; exit 1; }',
  "claude --version",
].join("; ");

export function buildToolchainCommand(config: VpsConfig): SshCommand {
  return { command: "ssh", args: [...buildBaseSshArgs(config), TOOLCHAIN_REMOTE_SCRIPT] };
}

export function buildTmuxListCommand(config: VpsConfig): SshCommand {
  return { command: "ssh", args: [...buildBaseSshArgs(config), "tmux list-sessions"] };
}

export function buildCredentialsCheckCommand(config: VpsConfig): SshCommand {
  return { command: "ssh", args: [...buildBaseSshArgs(config), "test -f ~/.claude/.credentials.json"] };
}

export function buildPaneCommandQuery(config: VpsConfig): SshCommand {
  return {
    command: "ssh",
    args: [
      ...buildBaseSshArgs(config),
      `tmux list-panes -t ${config.tmux_session} -F "#{pane_current_command}"`,
    ],
  };
}

export function isLingerEnabled(stdout: string): boolean {
  return stdout.trim() === "Linger=yes";
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

export function isTmuxSessionAlive(stdout: string, sessionName: string): boolean {
  return stdout.split("\n").some((line) => line.trim().startsWith(`${sessionName}:`));
}

export function isClaudeProcessRunning(paneCommandOutput: string): boolean {
  return paneCommandOutput
    .trim()
    .split("\n")
    .some((line) => line.trim() === "claude");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/vps-session/checks.test.ts`
Expected: PASS (15 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/vps-session/checks.ts scripts/vps-session/checks.test.ts
git commit -m "feat(vps-session): add SSH check command builders and parsers"
```

---

### Task 3: Status aggregation, formatting, and orchestration

**Files:**
- Create: `scripts/vps-session/run-command.ts`
- Create: `scripts/vps-session/status.ts`
- Test: `scripts/vps-session/status.test.ts`

**Interfaces:**
- Consumes: `VpsConfig` from Task 1; `SshCommand`, all `build*Command`/`buildPaneCommandQuery` builders, `isLingerEnabled`, `parseToolchainOutput`, `isTmuxSessionAlive`, `isClaudeProcessRunning` from Task 2 (`./checks.ts`)
- Produces: `export interface CommandResult { status: number; stdout: string; stderr: string }`, `export function runSshCommand(cmd: SshCommand): CommandResult` (from `run-command.ts`); `export interface CheckOutcome { ok: boolean; detail: string }`, `export interface StatusReport { configPath: string; sshReachable: CheckOutcome; lingerEnabled: CheckOutcome; toolchainReady: CheckOutcome; tmuxAlive: CheckOutcome; claudeRunning: CheckOutcome; credentialsPresent: CheckOutcome }`, `export function formatStatusReport(report: StatusReport): string`, `export function isFullyHealthy(report: StatusReport): boolean`, `export function runStatusChecks(config: VpsConfig, configPath: string): StatusReport` (from `status.ts`)

`claudeRunning` is deliberately separate from `tmuxAlive`: the design requires "tmux alive, but no live claude process" to read as a distinct, non-healthy state — but `connect` must still treat an alive-but-shell-only session as *existing* (so it attaches rather than trying to recreate a session that's already there and hitting tmux's "duplicate session" error). Keeping them as two outcomes gives both consumers what they need.

**Note on testing scope:** `runSshCommand` and `runStatusChecks` call the real `ssh`/`tmux` binaries via `spawnSync` — per the design's own Testing section, that interaction is live-verified against the real VPS during implementation, not unit tested (mocking `spawnSync` would only test the mock). Only `formatStatusReport` and `isFullyHealthy` are unit tested here.

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/vps-session/status.test.ts
import { describe, it, expect } from "vitest";
import { formatStatusReport, isFullyHealthy, type StatusReport } from "./status.ts";

function healthyReport(): StatusReport {
  return {
    configPath: "/home/jack/.digismith-depot/vps.json",
    sshReachable: { ok: true, detail: "" },
    lingerEnabled: { ok: true, detail: "Linger=yes" },
    toolchainReady: { ok: true, detail: "2.1.0 (Claude Code)" },
    tmuxAlive: { ok: true, detail: "session found" },
    claudeRunning: { ok: true, detail: "claude" },
    credentialsPresent: { ok: true, detail: "present" },
  };
}

describe("formatStatusReport", () => {
  it("marks every check OK when all are healthy", () => {
    const text = formatStatusReport(healthyReport());
    expect(text).toContain("[OK] SSH reachable");
    expect(text).toContain("[OK] Lingering enabled — Linger=yes");
    expect(text).toContain("[OK] Toolchain on PATH — 2.1.0 (Claude Code)");
    expect(text).toContain("[OK] tmux session alive — session found");
    expect(text).toContain("[OK] Claude process running — claude");
    expect(text).toContain("[OK] Credentials persisted — present");
  });

  it("marks a failing check as FAIL with its detail", () => {
    const report = healthyReport();
    report.tmuxAlive = { ok: false, detail: "no session named claude-main" };
    const text = formatStatusReport(report);
    expect(text).toContain("[FAIL] tmux session alive — no session named claude-main");
  });

  it("reports an alive session whose claude process has died as a distinct state", () => {
    const report = healthyReport();
    report.claudeRunning = { ok: false, detail: "pane is running bash (claude exited)" };
    const text = formatStatusReport(report);
    expect(text).toContain("[OK] tmux session alive — session found");
    expect(text).toContain("[FAIL] Claude process running — pane is running bash (claude exited)");
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

  it("is false when tmux is alive but claude itself is not running", () => {
    const report = healthyReport();
    report.claudeRunning = { ok: false, detail: "pane is running bash (claude exited)" };
    expect(isFullyHealthy(report)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/vps-session/status.test.ts`
Expected: FAIL — `Cannot find module './status.ts'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// scripts/vps-session/run-command.ts
import { spawnSync } from "node:child_process";
import type { SshCommand } from "./checks.ts";

export interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

export function runSshCommand(cmd: SshCommand): CommandResult {
  const result = spawnSync(cmd.command, cmd.args, { encoding: "utf-8" });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}
```

```typescript
// scripts/vps-session/status.ts
import type { VpsConfig } from "./config.ts";
import {
  buildReachabilityCommand,
  buildLingerCommand,
  buildToolchainCommand,
  buildTmuxListCommand,
  buildCredentialsCheckCommand,
  buildPaneCommandQuery,
  isLingerEnabled,
  parseToolchainOutput,
  isTmuxSessionAlive,
  isClaudeProcessRunning,
} from "./checks.ts";
import { runSshCommand } from "./run-command.ts";

export interface CheckOutcome {
  ok: boolean;
  detail: string;
}

export interface StatusReport {
  configPath: string;
  sshReachable: CheckOutcome;
  lingerEnabled: CheckOutcome;
  toolchainReady: CheckOutcome;
  tmuxAlive: CheckOutcome;
  claudeRunning: CheckOutcome;
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
    formatLine("Lingering enabled", report.lingerEnabled),
    formatLine("Toolchain on PATH", report.toolchainReady),
    formatLine("tmux session alive", report.tmuxAlive),
    formatLine("Claude process running", report.claudeRunning),
    formatLine("Credentials persisted", report.credentialsPresent),
  ].join("\n");
}

export function isFullyHealthy(report: StatusReport): boolean {
  return (
    report.sshReachable.ok &&
    report.lingerEnabled.ok &&
    report.toolchainReady.ok &&
    report.tmuxAlive.ok &&
    report.claudeRunning.ok &&
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
      lingerEnabled: skipped,
      toolchainReady: skipped,
      tmuxAlive: skipped,
      claudeRunning: skipped,
      credentialsPresent: skipped,
    };
  }

  const linger = runSshCommand(buildLingerCommand(config));
  const lingerOk = isLingerEnabled(linger.stdout);

  const toolchain = runSshCommand(buildToolchainCommand(config));
  const toolchainResult = parseToolchainOutput(toolchain.status, toolchain.stdout);

  const tmuxList = runSshCommand(buildTmuxListCommand(config));
  const tmuxOk = isTmuxSessionAlive(tmuxList.stdout, config.tmux_session);

  let claudeRunning: CheckOutcome;
  if (!tmuxOk) {
    claudeRunning = { ok: false, detail: "skipped — no tmux session" };
  } else {
    const pane = runSshCommand(buildPaneCommandQuery(config));
    const running = pane.status === 0 && isClaudeProcessRunning(pane.stdout);
    claudeRunning = running
      ? { ok: true, detail: "claude" }
      : { ok: false, detail: `pane is running ${pane.stdout.trim() || "unknown"} (claude exited)` };
  }

  const creds = runSshCommand(buildCredentialsCheckCommand(config));

  return {
    configPath,
    sshReachable: { ok: true, detail: "" },
    lingerEnabled: { ok: lingerOk, detail: linger.stdout.trim() },
    toolchainReady: {
      ok: toolchainResult.ready,
      detail: toolchainResult.ready ? toolchainResult.version ?? "" : `missing: ${toolchainResult.missing}`,
    },
    tmuxAlive: { ok: tmuxOk, detail: tmuxOk ? "session found" : `no session named ${config.tmux_session}` },
    claudeRunning,
    credentialsPresent: {
      ok: creds.status === 0,
      detail: creds.status === 0 ? "present" : "missing — one-time interactive login required",
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/vps-session/status.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/vps-session/run-command.ts scripts/vps-session/status.ts scripts/vps-session/status.test.ts
git commit -m "feat(vps-session): add status aggregation and orchestration"
```

---

### Task 4: Connect auto-fix builders and orchestration

**Files:**
- Create: `scripts/vps-session/connect.ts`
- Test: `scripts/vps-session/connect.test.ts`

**Interfaces:**
- Consumes: `VpsConfig` from Task 1; `SshCommand`, `buildBaseSshArgs`, `buildLingerCommand`, `isLingerEnabled` from Task 2 (`./checks.ts`); `runSshCommand` from Task 3 (`./run-command.ts`); `runStatusChecks` from Task 3 (`./status.ts`)
- Produces: `export const START_CLAUDE_SCRIPT: string`, `export const TOOLCHAIN_INSTALL_HINT: string`, `export function buildEnableLingerCommand(config): SshCommand`, `export function buildWriteStartScriptCommand(config): SshCommand`, `export function buildStartTmuxSessionCommand(config): SshCommand`, `export function buildAttachArgs(config): string[]`, `export function runConnect(config: VpsConfig, configPath: string): never`

**Note on testing scope:** same as Task 3 — `runConnect` calls real `spawnSync` (including the final interactive attach, which replaces this process's stdio and never returns) and is live-verified, not unit tested. Only the pure command/script builders are unit tested here.

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/vps-session/connect.test.ts
import { describe, it, expect } from "vitest";
import type { VpsConfig } from "./config.ts";
import {
  START_CLAUDE_SCRIPT,
  TOOLCHAIN_INSTALL_HINT,
  buildEnableLingerCommand,
  buildWriteStartScriptCommand,
  buildStartTmuxSessionCommand,
  buildAttachArgs,
} from "./connect.ts";

const CONFIG: VpsConfig = {
  host: "46.225.49.140",
  user: "root",
  identity_file: "~/.ssh/jazurite",
  tmux_session: "claude-main",
};

describe("START_CLAUDE_SCRIPT", () => {
  it("ends in exec bash, never exec claude, so a claude crash doesn't kill the session", () => {
    const lines = START_CLAUDE_SCRIPT.trim().split("\n");
    expect(lines[lines.length - 1].trim()).toBe("exec bash");
    expect(START_CLAUDE_SCRIPT).not.toContain("exec claude");
    expect(START_CLAUDE_SCRIPT).toContain("claude");
  });
});

describe("buildEnableLingerCommand", () => {
  it("enables lingering for the configured user", () => {
    const cmd = buildEnableLingerCommand(CONFIG);
    expect(cmd.args[cmd.args.length - 1]).toBe("loginctl enable-linger root");
  });
});

describe("buildWriteStartScriptCommand", () => {
  it("writes the start script via a quoted heredoc and makes it executable", () => {
    const cmd = buildWriteStartScriptCommand(CONFIG);
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain("cat > ~/start-claude.sh <<'DIGISMITH_EOF'");
    expect(remote).toContain("DIGISMITH_EOF");
    expect(remote).toContain("chmod +x ~/start-claude.sh");
    expect(remote).toContain("exec bash");
  });
});

describe("buildStartTmuxSessionCommand", () => {
  it("creates the configured tmux session and pipes its output to a log", () => {
    const cmd = buildStartTmuxSessionCommand(CONFIG);
    const remote = cmd.args[cmd.args.length - 1];
    expect(remote).toContain('tmux new-session -d -s claude-main "$HOME/start-claude.sh"');
    expect(remote).toContain('tmux pipe-pane -o -t claude-main "cat >> $HOME/claude-session.log"');
  });
});

describe("TOOLCHAIN_INSTALL_HINT", () => {
  it("names every manual install step the design points at", () => {
    expect(TOOLCHAIN_INSTALL_HINT).toContain("nvm");
    expect(TOOLCHAIN_INSTALL_HINT).toContain("corepack enable");
    expect(TOOLCHAIN_INSTALL_HINT).toContain("pnpm add -g @anthropic-ai/claude-code");
    expect(TOOLCHAIN_INSTALL_HINT).toContain("pnpm approve-builds --global @anthropic-ai/claude-code");
  });
});

describe("buildAttachArgs", () => {
  it("builds an interactive ssh attach command for the configured session", () => {
    expect(buildAttachArgs(CONFIG)).toEqual([
      "-i", "~/.ssh/jazurite",
      "-o", "IdentitiesOnly=yes",
      "-t", "root@46.225.49.140",
      "tmux attach -t claude-main",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/vps-session/connect.test.ts`
Expected: FAIL — `Cannot find module './connect.ts'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// scripts/vps-session/connect.ts
import { spawnSync } from "node:child_process";
import type { VpsConfig } from "./config.ts";
import { buildBaseSshArgs, buildLingerCommand, isLingerEnabled, type SshCommand } from "./checks.ts";
import { runSshCommand } from "./run-command.ts";
import { runStatusChecks } from "./status.ts";

// Deliberately not `exec claude` as the last line: if claude exits for any
// reason, `exec bash` keeps the pane (and therefore the tmux session, and
// therefore the whole persistent session) alive instead of vanishing.
export const START_CLAUDE_SCRIPT = `#!/bin/bash
source ~/.config/claude-code.env 2>/dev/null
cd ~
claude
echo "=== claude exited with code $? ==="
exec bash
`;

export const TOOLCHAIN_INSTALL_HINT = [
  "Install the missing piece by hand on the VPS, then retry:",
  "  nvm:    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash && nvm install --lts",
  "  pnpm:   corepack enable",
  "  claude: pnpm add -g @anthropic-ai/claude-code && pnpm approve-builds --global @anthropic-ai/claude-code",
].join("\n");

export function buildEnableLingerCommand(config: VpsConfig): SshCommand {
  return { command: "ssh", args: [...buildBaseSshArgs(config), `loginctl enable-linger ${config.user}`] };
}

export function buildWriteStartScriptCommand(config: VpsConfig): SshCommand {
  const remote = [
    "cat > ~/start-claude.sh <<'DIGISMITH_EOF'",
    START_CLAUDE_SCRIPT.trimEnd(),
    "DIGISMITH_EOF",
    "chmod +x ~/start-claude.sh",
  ].join("\n");
  return { command: "ssh", args: [...buildBaseSshArgs(config), remote] };
}

// `$HOME` rather than `~` inside the double quotes: bash never tilde-expands
// inside double quotes, so a quoted `~/...` would reach tmux literally.
export function buildStartTmuxSessionCommand(config: VpsConfig): SshCommand {
  const remote = [
    `tmux new-session -d -s ${config.tmux_session} "$HOME/start-claude.sh"`,
    `tmux pipe-pane -o -t ${config.tmux_session} "cat >> $HOME/claude-session.log"`,
  ].join(" && ");
  return { command: "ssh", args: [...buildBaseSshArgs(config), remote] };
}

export function buildAttachArgs(config: VpsConfig): string[] {
  return [
    "-i", config.identity_file,
    "-o", "IdentitiesOnly=yes",
    "-t", `${config.user}@${config.host}`,
    `tmux attach -t ${config.tmux_session}`,
  ];
}

export function runConnect(config: VpsConfig, configPath: string): never {
  const status = runStatusChecks(config, configPath);

  if (!status.sshReachable.ok) {
    console.error(`vps-session: SSH unreachable — ${status.sshReachable.detail}`);
    process.exit(1);
  }

  if (!status.lingerEnabled.ok) {
    console.log("vps-session: lingering not enabled, enabling now...");
    const fix = runSshCommand(buildEnableLingerCommand(config));
    if (fix.status !== 0) {
      console.error(`vps-session: could not enable lingering — ${fix.stderr.trim()}`);
      process.exit(1);
    }
    const recheck = runSshCommand(buildLingerCommand(config));
    if (!isLingerEnabled(recheck.stdout)) {
      console.error(
        `vps-session: enable-linger reported success but Linger is still not "yes" (got: ${recheck.stdout.trim() || "no output"})`
      );
      process.exit(1);
    }
  }

  if (!status.toolchainReady.ok) {
    console.error(`vps-session: toolchain not ready on the VPS (${status.toolchainReady.detail}).`);
    console.error(TOOLCHAIN_INSTALL_HINT);
    process.exit(1);
  }

  if (!status.tmuxAlive.ok) {
    console.log(`vps-session: tmux session "${config.tmux_session}" not found, creating it...`);
    const writeResult = runSshCommand(buildWriteStartScriptCommand(config));
    if (writeResult.status !== 0) {
      console.error(`vps-session: failed to write start-claude.sh — ${writeResult.stderr.trim()}`);
      process.exit(1);
    }
    const startResult = runSshCommand(buildStartTmuxSessionCommand(config));
    if (startResult.status !== 0) {
      console.error(`vps-session: failed to start the tmux session — ${startResult.stderr.trim()}`);
      process.exit(1);
    }
  }

  if (!status.credentialsPresent.ok) {
    console.log(
      "vps-session: warning — no ~/.claude/.credentials.json on the VPS yet; complete the interactive login once attached."
    );
  }

  console.log("vps-session: attaching...");
  // Node has no exec(2)-style process replacement; inheriting stdio and then
  // exiting with the child's own code is the closest equivalent to the
  // design's `exec ssh -t ...`.
  const attach = spawnSync("ssh", buildAttachArgs(config), { stdio: "inherit" });
  process.exit(attach.status ?? 1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/vps-session/connect.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/vps-session/connect.ts scripts/vps-session/connect.test.ts
git commit -m "feat(vps-session): add connect auto-fix and orchestration"
```

---

### Task 5: CLI entry point

**Files:**
- Create: `scripts/vps-session/cli.ts`

**Interfaces:**
- Consumes: `loadVpsConfig`, `DEFAULT_VPS_CONFIG_PATH` from Task 1 (`./config.ts`); `runStatusChecks`, `formatStatusReport`, `isFullyHealthy` from Task 3 (`./status.ts`); `runConnect` from Task 4 (`./connect.ts`)
- Produces: a runnable CLI at `node --experimental-strip-types scripts/vps-session/cli.ts <status|connect>`. No new exports consumed by later tasks — this is the top of the dependency graph.

This task has no automated test of its own: it is a thin argv-dispatch wrapper over already-tested modules, and its actual behavior (real SSH/tmux against the real VPS) is exactly the kind of interaction the design says to live-verify rather than mock.

- [ ] **Step 1: Write the CLI entry point**

```typescript
// scripts/vps-session/cli.ts
import { pathToFileURL } from "node:url";
import { loadVpsConfig, DEFAULT_VPS_CONFIG_PATH, type VpsConfig } from "./config.ts";
import { runStatusChecks, formatStatusReport, isFullyHealthy } from "./status.ts";
import { runConnect } from "./connect.ts";

export function main(): void {
  const subcommand = process.argv[2];
  if (subcommand !== "status" && subcommand !== "connect") {
    console.error("usage: node --experimental-strip-types scripts/vps-session/cli.ts <status|connect>");
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

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
```

- [ ] **Step 2: Verify it runs and reports "no VPS configured" without a config file present**

Run: `node --experimental-strip-types scripts/vps-session/cli.ts status`
Expected: exits 1, prints `vps-session: no VPS configured — create <home>/.digismith-depot/vps.json` (no `~/.digismith-depot/vps.json` should exist on a machine that hasn't set one up yet; if one already exists on this machine, temporarily rename it for this check and rename it back after).

- [ ] **Step 3: If a real VPS is reachable from this machine, live-verify against it**

Create `~/.digismith-depot/vps.json` by hand with the real host/user/identity_file/tmux_session, then run:

```bash
node --experimental-strip-types scripts/vps-session/cli.ts status
```

Expected: prints all six lines (the design's five checks plus "Claude process running") with `[OK]`/`[FAIL]` and a plain-language detail for each, matching what's actually true of the VPS. If no VPS is reachable from this environment, skip this step — the unit-tested modules already cover every pure branch; this step alone is deliberately live-only and non-blocking for finishing the task.

- [ ] **Step 4: Commit**

```bash
git add scripts/vps-session/cli.ts
git commit -m "feat(vps-session): add CLI entry point"
```

---

### Task 6: Depot documentation

**Files:**
- Modify: `skills/depot/SKILL.md`

**Interfaces:**
- Consumes: nothing (documentation only)
- Produces: nothing consumed by other tasks — this is the last task

- [ ] **Step 1: Extend the frontmatter `description` and the Overview's resource list**

In `skills/depot/SKILL.md`'s frontmatter, the `description:` field enumerates every resource Depot manages — it's what routes a user's request to this skill. Append one more clause to the end of that single-line value, before its closing period:

```
, and a VPS Session CLI reconnecting to an already-provisioned persistent claude tmux session on a Hetzner VPS over SSH (invoked directly by the user only — e.g. "connect me to my VPS", "check my VPS status" — never auto-invoked by bootstrap/adopt)
```

Then change the Overview section's intro sentence and bullet list from "four independent" (three resources plus the stateless check) to five, adding a new bullet immediately after "Claude Code readiness":

```markdown
- **VPS Session** — reconnects to an already-provisioned, persistent `claude`
  tmux session on a Hetzner VPS over SSH (`scripts/vps-session/cli.ts`,
  map item **V.3**). Unlike the other three, there is nothing for Depot to
  spawn or own the lifecycle of — the resource being "ensured" is a remote,
  already-running `tmux` session, not a local process tracked by PID.
```

Update the section's opening line from "Manages four independent, machine-wide runtime resources" to "Manages five independent, machine-wide runtime resources".

- [ ] **Step 2: Add a new "Resource: VPS Session" section**

Insert a new section after "## Resource: Claude Code Readiness" and before "## Error Handling":

```markdown
## Resource: VPS Session

A standalone CLI (`scripts/vps-session/cli.ts`, map item **V.3**) that reconnects to an
already-provisioned, persistent `claude` tmux session on a Hetzner VPS over SSH. See
`.digismith/docs/vps-session/design.html`. Config lives at `~/.digismith-depot/vps.json`
(`{"host", "user", "identity_file", "tmux_session"}`), sibling to Depot's other state files —
written by hand, no creation/edit tooling.

Unlike the OpenCode server and Agentic Bridge proxy, there is nothing for this skill to spawn
or track by PID: the resource being "ensured" is a remote, already-running `tmux` session, not
a local process.

### Which Operation

- **Invoked directly by the user, by name or by asking a Claude Code session** ("connect me to
  my VPS", "check my VPS status") → `status` (a pure read, never modifies anything) or
  `connect` (auto-fixes what's safely fixable, then attaches) depending on intent.
- **Never auto-invoked by `digismith:bootstrap`/`digismith:adopt`** — unlike the packages/
  clone, this is not a per-ticket dependency most tickets need.

### Operation: `status`

```bash
node --experimental-strip-types scripts/vps-session/cli.ts status
```

Reports each check plainly: SSH reachability, systemd lingering, toolchain-on-PATH, tmux
session liveness, whether `claude` itself is running inside that session (an alive session
whose `claude` has exited to the fallback shell is reported as its own distinct, non-healthy
state), and whether the one-time interactive login has been completed. Never modifies anything
on the VPS.

### Operation: `connect`

```bash
node --experimental-strip-types scripts/vps-session/cli.ts connect
```

Runs the same checks as `status`, auto-fixing what's safely fixable (enabling lingering,
recreating the tmux session), then attaches interactively. Missing credentials is a warning,
not a blocker — the user completes the one-time browser OAuth login themselves once attached.
Never auto-installs a missing toolchain piece (nvm/node/pnpm/claude) — same disposition Depot
already takes for a missing local `opencode`/`claude`.
```

- [ ] **Step 3: Add a row to the Quick Reference table**

Add one row to the end of the Quick Reference table at the bottom of `skills/depot/SKILL.md`:

```markdown
| VPS Session | `status` | User asks directly, any time | Read-only report of every check above |
| VPS Session | `connect` | User asks directly, any time | Auto-fixes what's safely fixable, then attaches interactively |
```

- [ ] **Step 4: Commit**

```bash
git add skills/depot/SKILL.md
git commit -m "docs(depot): document VPS Session as a fourth managed resource"
```
