# Depot CLI Command Group Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `depot` command group to `@digismith/cli` (`dg depot clone|opencode|bridge ...`) covering the three Depot resources that already have a documented "invoke directly" use case, and rewrite `skills/depot/SKILL.md` to delegate to it instead of embedding raw bash.

**Architecture:** A new `packages/cli/src/depot/` module: `clone.ts` (git commands, no process tracking), `process-lifecycle.ts` (shared ensure/stop helper for daemon-style resources), `opencode.ts` and `bridge.ts` (each wired to the shared helper), and `index.ts` as the resource dispatcher registered in the top-level `GROUPS` map alongside `vps`.

**Tech Stack:** TypeScript (Node ≥24, native type-stripping via the existing `tsc` build), Vitest, zero new runtime dependencies — same as the rest of `@digismith/cli`.

## Global Constraints

- Node ≥24, ESM (`"type": "module"`), relative imports use explicit `.ts` extensions (`rewriteRelativeImportExtensions`) — match the existing style in `packages/cli/src/vps/*.ts` exactly (e.g. `import type { VpsConfig } from "./config.ts";`).
- No new runtime dependencies. Only `node:child_process`, `node:fs`, `node:os`, `node:path`.
- Windows is the real target platform. Never use `ps`/`awk` — they are MSYS-only and not guaranteed on PATH outside Git Bash. Use only `tasklist`, `taskkill`, `netstat` (`System32` binaries, always present). Flags are single-slash (`/FI`, `/PID`, `/T`, `/F`) since these are `spawnSync`/`spawn` calls with no shell involved — no MSYS re-interpretation of a leading `/`.
- Every command sets `process.exitCode` (never `process.exit`) — none of `depot`'s commands take over the terminal interactively, unlike `vps connect`.
- Message prefix convention: `depot <resource>: <message>` on stdout/stderr, matching the existing `vps-session: ...` style.
- Test command for a single file from repo root: `npx vitest run packages/cli/src/depot/<file>.test.ts` (plain `vitest run` from the repo root also picks up sibling worktrees under `.claude/worktrees/` — irrelevant here since these are new files, but don't be surprised by an inflated total count if you ever run the whole suite unscoped).
- No tsconfig changes needed anywhere: `packages/cli/tsconfig.build.json`'s `include: ["src/**/*.ts"]` and the root `tsconfig.json`'s `include: [..., "packages/cli/src/**/*.ts"]` both already cover a new `src/depot/` folder.

---

### Task 1: `depot` command-group dispatcher + `clone` resource

**Files:**
- Create: `packages/cli/src/depot/clone.ts`
- Test: `packages/cli/src/depot/clone.test.ts`
- Create: `packages/cli/src/depot/index.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/index.test.ts`

**Interfaces:**
- Produces: `DEFAULT_DEPOT_REPO_PATH: string`, `DEFAULT_DEPOT_REMOTE: string`, `interface CommandResult { status: number; stdout: string; stderr: string }`, `cloneExists(repoPath?: string): boolean`, `ensureClone(repoPath?: string, remote?: string): CommandResult`, `refreshClone(repoPath?: string, remote?: string): CommandResult`, `run(argv: string[]): void` (all from `clone.ts`); `run(argv: string[]): void` from `depot/index.ts` (the depot dispatcher, registered as `GROUPS.depot` in the top-level `index.ts`).
- Consumes: nothing from other tasks (this task has no dependency on Task 2's `process-lifecycle.ts`).

- [ ] **Step 1: Write the failing tests for `clone.ts`**

Create `packages/cli/src/depot/clone.test.ts`:

```typescript
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { cloneExists, ensureClone, refreshClone } from "./clone.ts";

function git(args: string[], cwd: string): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${result.stderr}`);
  }
}

function makeBareRemoteWithPackagesFile(dir: string, fileContent: string): { remote: string; workPath: string } {
  const barePath = path.join(dir, "remote.git");
  const workPath = path.join(dir, "work");
  fs.mkdirSync(barePath, { recursive: true });
  fs.mkdirSync(workPath, { recursive: true });
  git(["init", "--bare", "-b", "main", barePath], dir);
  git(["init", "-b", "main", workPath], dir);
  git(["config", "user.email", "test@example.com"], workPath);
  git(["config", "user.name", "Test"], workPath);
  fs.mkdirSync(path.join(workPath, "packages"), { recursive: true });
  fs.writeFileSync(path.join(workPath, "packages", "marker.txt"), fileContent);
  fs.writeFileSync(path.join(workPath, "root-only.txt"), "not in sparse scope");
  git(["add", "."], workPath);
  git(["commit", "-m", "initial"], workPath);
  git(["remote", "add", "origin", barePath], workPath);
  git(["push", "origin", "main"], workPath);
  return { remote: barePath, workPath };
}

describe("clone", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("clones a fresh sparse checkout of packages/ only", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-clone-"));
    const { remote } = makeBareRemoteWithPackagesFile(tmpDir, "v1");
    const target = path.join(tmpDir, "repo");

    expect(cloneExists(target)).toBe(false);
    const result = ensureClone(target, remote);

    expect(result.status).toBe(0);
    expect(cloneExists(target)).toBe(true);
    expect(fs.readFileSync(path.join(target, "packages", "marker.txt"), "utf-8")).toBe("v1");
    expect(fs.existsSync(path.join(target, "root-only.txt"))).toBe(false);
  });

  it("is a no-op when the clone already exists", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-clone-"));
    const { remote } = makeBareRemoteWithPackagesFile(tmpDir, "v1");
    const target = path.join(tmpDir, "repo");
    ensureClone(target, remote);

    fs.writeFileSync(path.join(target, "packages", "marker.txt"), "locally-modified");
    const result = ensureClone(target, remote);

    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(target, "packages", "marker.txt"), "utf-8")).toBe("locally-modified");
  });

  it("refresh pulls new commits and discards local modifications", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-clone-"));
    const { remote, workPath } = makeBareRemoteWithPackagesFile(tmpDir, "v1");
    const target = path.join(tmpDir, "repo");
    ensureClone(target, remote);

    fs.writeFileSync(path.join(target, "packages", "marker.txt"), "locally-modified");

    fs.writeFileSync(path.join(workPath, "packages", "marker.txt"), "v2");
    git(["add", "."], workPath);
    git(["commit", "-m", "update"], workPath);
    git(["push", "origin", "main"], workPath);

    const result = refreshClone(target, remote);

    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(target, "packages", "marker.txt"), "utf-8")).toBe("v2");
  });

  it("refresh runs ensure's sequence when the clone doesn't exist yet", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-clone-"));
    const { remote } = makeBareRemoteWithPackagesFile(tmpDir, "v1");
    const target = path.join(tmpDir, "repo");

    const result = refreshClone(target, remote);

    expect(result.status).toBe(0);
    expect(cloneExists(target)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/cli/src/depot/clone.test.ts`
Expected: FAIL — `clone.ts` does not exist yet (module not found).

- [ ] **Step 3: Implement `clone.ts`**

```typescript
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const DEFAULT_DEPOT_REPO_PATH = path.join(os.homedir(), ".digismith-depot", "repo");
export const DEFAULT_DEPOT_REMOTE = "git@github.com:Jazurite/DigiSmith.git";

export interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runGit(args: string[], cwd?: string): CommandResult {
  const result = spawnSync("git", args, { encoding: "utf-8", cwd });
  const stderr = result.stderr ?? (result.error ? result.error.message : "");
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr };
}

export function cloneExists(repoPath: string = DEFAULT_DEPOT_REPO_PATH): boolean {
  return fs.existsSync(path.join(repoPath, ".git"));
}

export function ensureClone(
  repoPath: string = DEFAULT_DEPOT_REPO_PATH,
  remote: string = DEFAULT_DEPOT_REMOTE
): CommandResult {
  if (cloneExists(repoPath)) {
    return { status: 0, stdout: "already present", stderr: "" };
  }
  fs.mkdirSync(path.dirname(repoPath), { recursive: true });
  const clone = runGit(["clone", "--filter=blob:none", "--no-checkout", "--sparse", remote, repoPath]);
  if (clone.status !== 0) return clone;
  const sparse = runGit(["sparse-checkout", "set", "packages"], repoPath);
  if (sparse.status !== 0) return sparse;
  return runGit(["checkout", "main"], repoPath);
}

export function refreshClone(
  repoPath: string = DEFAULT_DEPOT_REPO_PATH,
  remote: string = DEFAULT_DEPOT_REMOTE
): CommandResult {
  if (!cloneExists(repoPath)) {
    return ensureClone(repoPath, remote);
  }
  const fetch = runGit(["fetch", "--all", "--prune", "--tags", "-q"], repoPath);
  if (fetch.status !== 0) return fetch;
  const checkout = runGit(["checkout", "main"], repoPath);
  if (checkout.status !== 0) return checkout;
  return runGit(["reset", "--hard", "origin/main"], repoPath);
}

export function run(argv: string[]): void {
  const verb = argv[0];
  if (verb !== "ensure" && verb !== "refresh") {
    console.error("usage: digismith depot clone <ensure|refresh>");
    process.exitCode = 1;
    return;
  }
  const result = verb === "ensure" ? ensureClone() : refreshClone();
  if (result.status !== 0) {
    console.error(`depot clone: ${result.stderr.trim() || "git command failed"}`);
    process.exitCode = 1;
    return;
  }
  console.log(`depot clone: ${verb} — ${result.stdout.trim() || "ok"}`);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/cli/src/depot/clone.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Create the `depot` dispatcher and wire it into the top-level CLI**

Create `packages/cli/src/depot/index.ts`:

```typescript
import { run as runClone } from "./clone.ts";

export function run(argv: string[]): void {
  const [resource, ...rest] = argv;
  if (resource === "clone") {
    runClone(rest);
    return;
  }
  console.error("usage: digismith depot <clone> ...");
  process.exitCode = 1;
}
```

Modify `packages/cli/src/index.ts` — add the import and register the group:

```typescript
import { run as runVps } from "./vps/index.ts";
import { run as runDepot } from "./depot/index.ts";
```

```typescript
export const GROUPS: Record<string, GroupRunner> = {
  vps: runVps,
  depot: runDepot,
};
```

Modify `packages/cli/src/index.test.ts` — add one test inside the existing `describe("resolveGroup", ...)` block:

```typescript
  it("returns the depot runner for 'depot'", () => {
    expect(resolveGroup("depot")).toBe(GROUPS.depot);
  });
```

- [ ] **Step 6: Run the full package test suite to verify nothing broke**

Run: `npx vitest run packages/cli/src`
Expected: PASS — all existing `vps` tests plus the new `clone` tests and the new `resolveGroup("depot")` test.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/depot/clone.ts packages/cli/src/depot/clone.test.ts packages/cli/src/depot/index.ts packages/cli/src/index.ts packages/cli/src/index.test.ts
git commit -m "feat(cli): add depot command group with clone resource"
```

---

### Task 2: Shared process-lifecycle helper

**Files:**
- Create: `packages/cli/src/depot/process-lifecycle.ts`
- Test: `packages/cli/src/depot/process-lifecycle.test.ts`

**Interfaces:**
- Produces: `interface Tracking { pid: string; port: number }`, `interface TrackingTarget { label: string; trackingFile: string }`, `interface EnsureConfig extends TrackingTarget { logFile: string; spawnCommand: () => { command: string; args: string[]; env?: NodeJS.ProcessEnv } }`, `parseListeningPort(logContent: string): number | null`, `parseNetstatPidForPort(netstatOutput: string, port: number): string | null`, `isPidListed(tasklistOutput: string, pid: string): boolean`, `readTracking(filePath: string): Tracking | null`, `writeTracking(filePath: string, tracking: Tracking): void`, `ensureProcess(config: EnsureConfig): { port: number }` (throws `Error` on failure — never returns an error value), `stopProcess(config: TrackingTarget): { stopped: boolean }`.
- Consumes: nothing from other tasks.

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/src/depot/process-lifecycle.test.ts`:

```typescript
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  parseListeningPort,
  parseNetstatPidForPort,
  isPidListed,
  readTracking,
  writeTracking,
  ensureProcess,
  stopProcess,
} from "./process-lifecycle.ts";

describe("parseListeningPort", () => {
  it("extracts the port from a listening line", () => {
    expect(parseListeningPort("some preamble\nopencode server listening on http://127.0.0.1:54321\n")).toBe(54321);
  });

  it("works regardless of the prefix text before 'listening on'", () => {
    expect(parseListeningPort("agentic-bridge listening on http://127.0.0.1:9999")).toBe(9999);
  });

  it("returns null when there is no listening line", () => {
    expect(parseListeningPort("starting up...\n")).toBeNull();
  });
});

describe("parseNetstatPidForPort", () => {
  it("finds the pid bound to the given port's LISTENING line", () => {
    const output = [
      "  Proto  Local Address          Foreign Address        State           PID",
      "  TCP    127.0.0.1:54321        0.0.0.0:0              LISTENING       6789",
    ].join("\r\n");
    expect(parseNetstatPidForPort(output, 54321)).toBe("6789");
  });

  it("returns null when no LISTENING line matches the port", () => {
    const output = "  TCP    127.0.0.1:1111        0.0.0.0:0              LISTENING       6789";
    expect(parseNetstatPidForPort(output, 54321)).toBeNull();
  });

  it("ignores non-LISTENING lines for the same port", () => {
    const output = "  TCP    127.0.0.1:54321       10.0.0.5:1234          ESTABLISHED     1111";
    expect(parseNetstatPidForPort(output, 54321)).toBeNull();
  });
});

describe("isPidListed", () => {
  it("finds the pid in tasklist output", () => {
    const output = '"node.exe","12345","Console","1","20,000 K"';
    expect(isPidListed(output, "12345")).toBe(true);
  });

  it("returns false when the pid is absent", () => {
    const output = '"node.exe","99999","Console","1","20,000 K"';
    expect(isPidListed(output, "12345")).toBe(false);
  });
});

describe("tracking file read/write", () => {
  let tmpDir: string;
  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("round-trips a tracking record, creating parent directories as needed", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-lifecycle-"));
    const file = path.join(tmpDir, "sub", "tracking.json");
    writeTracking(file, { pid: "123", port: 456 });
    expect(readTracking(file)).toEqual({ pid: "123", port: 456 });
  });

  it("returns null when the file is absent", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-lifecycle-"));
    expect(readTracking(path.join(tmpDir, "missing.json"))).toBeNull();
  });

  it("returns null when the file has the wrong shape", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-lifecycle-"));
    const file = path.join(tmpDir, "tracking.json");
    fs.writeFileSync(file, JSON.stringify({ pid: 123 }));
    expect(readTracking(file)).toBeNull();
  });

  it("returns null when the file is not valid JSON", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-lifecycle-"));
    const file = path.join(tmpDir, "tracking.json");
    fs.writeFileSync(file, "not json");
    expect(readTracking(file)).toBeNull();
  });
});

describe("ensureProcess / stopProcess against a real child process", () => {
  let tmpDir: string;
  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("starts a real process, tracks its confirmed PID and port, reuses it, then stops it", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-lifecycle-"));
    const trackingFile = path.join(tmpDir, "tracking.json");
    const logFile = path.join(tmpDir, "server.log");
    const dummyServerScript =
      'const s=require("node:net").createServer();' +
      's.listen(0,"127.0.0.1",()=>{console.log("dummy listening on http://127.0.0.1:"+s.address().port);});' +
      "setInterval(()=>{},1000);";

    const { port } = ensureProcess({
      label: "dummy",
      trackingFile,
      logFile,
      spawnCommand: () => ({ command: process.execPath, args: ["-e", dummyServerScript] }),
    });

    expect(port).toBeGreaterThan(0);
    const tracked = readTracking(trackingFile);
    expect(tracked).not.toBeNull();
    expect(tracked?.port).toBe(port);

    const second = ensureProcess({
      label: "dummy",
      trackingFile,
      logFile,
      spawnCommand: () => {
        throw new Error("should not spawn again — the tracked process is still alive");
      },
    });
    expect(second.port).toBe(port);

    const stopResult = stopProcess({ label: "dummy", trackingFile });
    expect(stopResult.stopped).toBe(true);
    expect(readTracking(trackingFile)).toBeNull();

    const stopAgain = stopProcess({ label: "dummy", trackingFile });
    expect(stopAgain.stopped).toBe(false);
  }, 15000);

  it("throws with the log content when the process never logs a listening line", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-lifecycle-"));
    const trackingFile = path.join(tmpDir, "tracking.json");
    const logFile = path.join(tmpDir, "server.log");

    expect(() =>
      ensureProcess({
        label: "dummy",
        trackingFile,
        logFile,
        spawnCommand: () => ({ command: process.execPath, args: ["-e", 'console.log("no listening line here")'] }),
      })
    ).toThrow(/failed to start/);
  }, 10000);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/cli/src/depot/process-lifecycle.test.ts`
Expected: FAIL — `process-lifecycle.ts` does not exist yet.

- [ ] **Step 3: Implement `process-lifecycle.ts`**

```typescript
import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export interface Tracking {
  pid: string;
  port: number;
}

export interface TrackingTarget {
  label: string;
  trackingFile: string;
}

export interface EnsureConfig extends TrackingTarget {
  logFile: string;
  spawnCommand: () => { command: string; args: string[]; env?: NodeJS.ProcessEnv };
}

const LISTENING_LINE = /listening on http:\/\/127\.0\.0\.1:(\d+)/;

export function parseListeningPort(logContent: string): number | null {
  const match = logContent.match(LISTENING_LINE);
  return match ? Number(match[1]) : null;
}

export function parseNetstatPidForPort(netstatOutput: string, port: number): string | null {
  const suffix = `:${port}`;
  for (const rawLine of netstatOutput.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("TCP")) continue;
    if (!/LISTENING/.test(line)) continue;
    const parts = line.split(/\s+/);
    const localAddress = parts[1] ?? "";
    if (localAddress.endsWith(suffix)) {
      return parts[parts.length - 1] ?? null;
    }
  }
  return null;
}

export function isPidListed(tasklistOutput: string, pid: string): boolean {
  return tasklistOutput.split("\n").some((line) => line.includes(pid));
}

export function readTracking(filePath: string): Tracking | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<Tracking>;
    if (typeof parsed.pid === "string" && typeof parsed.port === "number") {
      return { pid: parsed.pid, port: parsed.port };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeTracking(filePath: string, tracking: Tracking): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(tracking));
}

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function ensureProcess(config: EnsureConfig): { port: number } {
  const tracking = readTracking(config.trackingFile);
  if (tracking) {
    const check = spawnSync("tasklist", ["/FI", `PID eq ${tracking.pid}`], { encoding: "utf-8" });
    if (isPidListed(check.stdout ?? "", tracking.pid)) {
      return { port: tracking.port };
    }
  }

  const { command, args, env } = config.spawnCommand();
  fs.mkdirSync(path.dirname(config.logFile), { recursive: true });
  const logFd = fs.openSync(config.logFile, "w");
  const child = spawn(command, args, {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: env ? { ...process.env, ...env } : process.env,
  });
  child.unref();
  fs.closeSync(logFd);

  const deadline = Date.now() + 5000;
  let port: number | null = null;
  while (Date.now() < deadline && port === null) {
    sleepMs(200);
    const content = fs.existsSync(config.logFile) ? fs.readFileSync(config.logFile, "utf-8") : "";
    port = parseListeningPort(content);
  }
  if (port === null) {
    const content = fs.existsSync(config.logFile) ? fs.readFileSync(config.logFile, "utf-8") : "";
    throw new Error(`${config.label}: failed to start — no "listening on" line in ${config.logFile} within 5s\n${content}`);
  }

  const netstat = spawnSync("netstat", ["-ano"], { encoding: "utf-8" });
  const confirmedPid = parseNetstatPidForPort(netstat.stdout ?? "", port);
  if (!confirmedPid) {
    throw new Error(`${config.label}: could not confirm a PID listening on port ${port} via netstat`);
  }

  writeTracking(config.trackingFile, { pid: confirmedPid, port });
  return { port };
}

export function stopProcess(config: TrackingTarget): { stopped: boolean } {
  const tracking = readTracking(config.trackingFile);
  if (!tracking) return { stopped: false };
  spawnSync("taskkill", ["/PID", tracking.pid, "/T", "/F"], { encoding: "utf-8" });
  fs.rmSync(config.trackingFile, { force: true });
  return { stopped: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/cli/src/depot/process-lifecycle.test.ts`
Expected: PASS (all tests, including the real-child-process ones).

**Known, accepted simplification:** if `config.spawnCommand()` names a binary that isn't on
PATH at all (e.g. `opencode` not installed), `spawn()` emits its `ENOENT` error asynchronously —
but `ensureProcess`'s polling loop blocks the event loop synchronously via `Atomics.wait`
between reads, so that error is never observed directly. The failure still surfaces correctly
(the log file stays empty, `parseListeningPort` never matches, the 5-second deadline trips, and
`ensureProcess` throws its normal "failed to start" error with the empty log attached) — just
with a generic message rather than a specific "command not found" one. Exit code and behavior
are both still correct; only the diagnostic wording is less specific than the design's error
table implies. Not worth an async rewrite of this synchronous, `spawnSync`-style CLI for a
personal single-user tool — the empty log is enough to diagnose by hand.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/depot/process-lifecycle.ts packages/cli/src/depot/process-lifecycle.test.ts
git commit -m "feat(cli): add shared process-lifecycle helper for depot daemons"
```

---

### Task 3: `opencode` resource

**Files:**
- Create: `packages/cli/src/depot/opencode.ts`
- Test: `packages/cli/src/depot/opencode.test.ts`
- Modify: `packages/cli/src/depot/index.ts`

**Interfaces:**
- Consumes (from Task 2, `./process-lifecycle.ts`): `ensureProcess(config: EnsureConfig): { port: number }`, `stopProcess(config: TrackingTarget): { stopped: boolean }`.
- Produces: `DEFAULT_TRACKING_FILE: string`, `DEFAULT_LOG_FILE: string`, `fetchChutesApiKey(): string`, `run(argv: string[], trackingFile?: string, logFile?: string): void`.

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/src/depot/opencode.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { run } from "./opencode.ts";

describe("run", () => {
  afterEach(() => {
    process.exitCode = 0;
  });

  it("prints usage and sets exit 1 for an unknown verb", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    run(["bogus"]);
    expect(errorSpy).toHaveBeenCalledWith("usage: digismith depot opencode <ensure|stop>");
    expect(process.exitCode).toBe(1);
    errorSpy.mockRestore();
  });

  it("prints usage and sets exit 1 when no verb is given", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    run([]);
    expect(errorSpy).toHaveBeenCalledWith("usage: digismith depot opencode <ensure|stop>");
    expect(process.exitCode).toBe(1);
    errorSpy.mockRestore();
  });

  it("reports nothing to stop when no server is tracked", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-opencode-run-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    run(["stop"], path.join(tmpDir, "tracking.json"), path.join(tmpDir, "server.log"));
    expect(logSpy).toHaveBeenCalledWith("depot opencode: nothing to stop");
    expect(process.exitCode).toBe(0);
    logSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

Note: `ensure`'s happy path spawns the real, globally-installed `opencode` binary and fetches a
real Chutes credential — genuine external dependencies not guaranteed present in a test/CI
environment. Per the design's testing note, that full path is live-verify-only; this task's
automated tests cover the deterministic parts (`run`'s verb validation and its `stop` branch,
which are pure argument handling plus `process-lifecycle.ts`'s already-tested `stopProcess`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/cli/src/depot/opencode.test.ts`
Expected: FAIL — `opencode.ts` does not exist yet.

- [ ] **Step 3: Implement `opencode.ts`**

```typescript
import { spawnSync } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import { ensureProcess, stopProcess } from "./process-lifecycle.ts";

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
      `depot opencode: could not fetch the Chutes API key — ${(result.stderr ?? "").trim() || "manage_credentials.py failed"}`
    );
  }
  return result.stdout.trim();
}

export function run(
  argv: string[],
  trackingFile: string = DEFAULT_TRACKING_FILE,
  logFile: string = DEFAULT_LOG_FILE
): void {
  const verb = argv[0];
  if (verb !== "ensure" && verb !== "stop") {
    console.error("usage: digismith depot opencode <ensure|stop>");
    process.exitCode = 1;
    return;
  }

  if (verb === "stop") {
    const result = stopProcess({ label: "opencode-server", trackingFile });
    console.log(result.stopped ? "depot opencode: stopped" : "depot opencode: nothing to stop");
    return;
  }

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
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/cli/src/depot/opencode.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire `opencode` into the depot dispatcher**

Modify `packages/cli/src/depot/index.ts`:

```typescript
import { run as runClone } from "./clone.ts";
import { run as runOpencode } from "./opencode.ts";

export function run(argv: string[]): void {
  const [resource, ...rest] = argv;
  if (resource === "clone") {
    runClone(rest);
    return;
  }
  if (resource === "opencode") {
    runOpencode(rest);
    return;
  }
  console.error("usage: digismith depot <clone|opencode> ...");
  process.exitCode = 1;
}
```

- [ ] **Step 6: Run the full package test suite to verify nothing broke**

Run: `npx vitest run packages/cli/src`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/depot/opencode.ts packages/cli/src/depot/opencode.test.ts packages/cli/src/depot/index.ts
git commit -m "feat(cli): add depot opencode resource"
```

---

### Task 4: `bridge` resource

**Files:**
- Create: `packages/cli/src/depot/bridge.ts`
- Test: `packages/cli/src/depot/bridge.test.ts`
- Modify: `packages/cli/src/depot/index.ts`

**Interfaces:**
- Consumes (from Task 2, `./process-lifecycle.ts`): `ensureProcess(config: EnsureConfig): { port: number }`, `stopProcess(config: TrackingTarget): { stopped: boolean }`.
- Produces: `DEFAULT_TRACKING_FILE: string`, `DEFAULT_LOG_FILE: string`, `findDigismithRepoMarker(startDir: string): string | null`, `resolveDigismithRepo(explicitRepo: string | undefined, cwd?: string): string` (throws `Error` when neither resolves), `run(argv: string[], trackingFile?: string, logFile?: string): void`.

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/src/depot/bridge.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { findDigismithRepoMarker, resolveDigismithRepo, run } from "./bridge.ts";

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

describe("run", () => {
  afterEach(() => {
    process.exitCode = 0;
  });

  it("prints usage and sets exit 1 for an unknown verb", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    run(["bogus"]);
    expect(errorSpy).toHaveBeenCalledWith("usage: digismith depot bridge <ensure|stop> [--repo <path>]");
    expect(process.exitCode).toBe(1);
    errorSpy.mockRestore();
  });

  it("reports nothing to stop when no bridge is tracked", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-run-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    run(["stop"], path.join(tmpDir, "tracking.json"), path.join(tmpDir, "server.log"));
    expect(logSpy).toHaveBeenCalledWith("depot bridge: nothing to stop");
    expect(process.exitCode).toBe(0);
    logSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("errors when ensure can't resolve a DigiSmith repo", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-bridge-run-"));
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    run(["ensure"], path.join(tmpDir, "tracking.json"), path.join(tmpDir, "server.log"));
    expect(errorSpy).toHaveBeenCalledWith("depot bridge: not inside a DigiSmith checkout and no --repo <path> given");
    expect(process.exitCode).toBe(1);
    cwdSpy.mockRestore();
    errorSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

Note: same live-verify-only carve-out as Task 3 — `ensure`'s happy path spawns the real
`scripts/agentic-bridge/server.ts` from a real DigiSmith checkout, exercised manually during
this task's acceptance step, not by an automated test.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/cli/src/depot/bridge.test.ts`
Expected: FAIL — `bridge.ts` does not exist yet.

- [ ] **Step 3: Implement `bridge.ts`**

```typescript
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ensureProcess, stopProcess } from "./process-lifecycle.ts";

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
        `depot bridge: --repo ${explicitRepo} does not look like a DigiSmith checkout (no .claude-plugin/plugin.json with "name": "digismith")`
      );
    }
    return explicitRepo;
  }
  const found = findDigismithRepoMarker(cwd);
  if (!found) {
    throw new Error("depot bridge: not inside a DigiSmith checkout and no --repo <path> given");
  }
  return found;
}

export function run(
  argv: string[],
  trackingFile: string = DEFAULT_TRACKING_FILE,
  logFile: string = DEFAULT_LOG_FILE
): void {
  const verb = argv[0];
  if (verb !== "ensure" && verb !== "stop") {
    console.error("usage: digismith depot bridge <ensure|stop> [--repo <path>]");
    process.exitCode = 1;
    return;
  }

  if (verb === "stop") {
    const result = stopProcess({ label: "agentic-bridge", trackingFile });
    console.log(result.stopped ? "depot bridge: stopped" : "depot bridge: nothing to stop");
    return;
  }

  const repoFlagIndex = argv.indexOf("--repo");
  const explicitRepo = repoFlagIndex !== -1 ? argv[repoFlagIndex + 1] : undefined;

  let repo: string;
  try {
    repo = resolveDigismithRepo(explicitRepo);
  } catch (err) {
    console.error((err as Error).message);
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
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/cli/src/depot/bridge.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Wire `bridge` into the depot dispatcher**

Modify `packages/cli/src/depot/index.ts`:

```typescript
import { run as runClone } from "./clone.ts";
import { run as runOpencode } from "./opencode.ts";
import { run as runBridge } from "./bridge.ts";

export function run(argv: string[]): void {
  const [resource, ...rest] = argv;
  if (resource === "clone") {
    runClone(rest);
    return;
  }
  if (resource === "opencode") {
    runOpencode(rest);
    return;
  }
  if (resource === "bridge") {
    runBridge(rest);
    return;
  }
  console.error("usage: digismith depot <clone|opencode|bridge> ...");
  process.exitCode = 1;
}
```

- [ ] **Step 6: Run the full package test suite to verify nothing broke**

Run: `npx vitest run packages/cli/src`
Expected: PASS.

- [ ] **Step 7: Manual acceptance check from a checkout (live-verify, not automated)**

From the DigiSmith repo root:

```bash
node packages/cli/src/index.ts depot bridge ensure
```

Expected: prints `depot bridge: ready on port <N>`; `~/.digismith-depot/agentic-bridge.json` and
`agentic-bridge.log` exist; the log contains a real `agentic-bridge listening on
http://127.0.0.1:<N>` line.

```bash
node packages/cli/src/index.ts depot bridge stop
```

Expected: prints `depot bridge: stopped`; the tracking file is gone; the process is no longer
running (confirm via `tasklist` or Task Manager if in doubt).

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/depot/bridge.ts packages/cli/src/depot/bridge.test.ts packages/cli/src/depot/index.ts
git commit -m "feat(cli): add depot bridge resource"
```

---

### Task 5: Skill delegation, README, and MEMORY.md

**Files:**
- Modify: `skills/depot/SKILL.md`
- Modify: `packages/cli/README.md`
- Modify: `MEMORY.md`

**Interfaces:** none — this task is documentation-only, no new code.

- [ ] **Step 1: Rewrite the packages/ Clone section of `skills/depot/SKILL.md`**

Replace the `### Operation: \`ensure\` — idempotent, clone-if-missing` code block (the `if [ ! -d ~/.digismith-depot/repo/.git ]; then ... fi` bash) with:

```bash
node <digismith-repo>/packages/cli/src/index.ts depot clone ensure
```

Idempotent: a no-op if `~/.digismith-depot/repo/.git` already exists.

Replace the `### Operation: \`refresh\` — explicit, on demand` code block (the `git -C ~/.digismith-depot/repo fetch ...` bash) with:

```bash
node <digismith-repo>/packages/cli/src/index.ts depot clone refresh
```

Keep the existing prose about running `ensure`'s sequence first when the clone doesn't exist,
and about the sparse-checkout pattern persisting across `reset --hard` — both still true, now
handled inside `clone.ts` rather than inline bash.

- [ ] **Step 2: Rewrite the OpenCode Server section**

Replace the `### Operation: \`ensure-opencode-server\` — start if not alive` block — including
its `mkdir -p ~/.digismith-depot \n CHUTES_API_KEY=$(...) opencode serve ...` snippet and the
entire "**Windows Git Bash only:**" WINPID-resolution paragraph below it — with:

```bash
node <digismith-repo>/packages/cli/src/index.ts depot opencode ensure
```

Checks the tracked server first (`~/.digismith-depot/opencode-server.json`) and returns its
port if still alive; otherwise starts a fresh `opencode serve` process (fetching the Chutes API
key the same way as before), confirms the real PID of whatever is listening via `netstat` (not
`ps -W`/`awk` — see `packages/cli/src/depot/process-lifecycle.ts`, which now owns all PID
resolution and works from any Windows shell, not just Git Bash), and persists the tracking file.

Replace the `### Operation: \`stop-opencode-server\` — explicit only` block with:

```bash
node <digismith-repo>/packages/cli/src/index.ts depot opencode stop
```

Reports "nothing to stop" plainly if no server is tracked; otherwise tree-kills the tracked
process and deletes the tracking file.

- [ ] **Step 3: Rewrite the Agentic Bridge Proxy section**

Replace the `### Operation: \`ensure-agentic-bridge\` — start if not alive` block — including its
`mkdir -p ~/.digismith-depot \n node --experimental-strip-types ... server.ts` snippet and the
"**Windows Git Bash only:**" WINPID paragraph — with:

```bash
node <digismith-repo>/packages/cli/src/index.ts depot bridge ensure
```

`<digismith-repo>` is the same path this skill already resolves for its own invocation; the CLI
also resolves it itself from `cwd` when run from inside a checkout, or accepts an explicit
override: `node <digismith-repo>/packages/cli/src/index.ts depot bridge ensure --repo
<digismith-repo>`. Otherwise behaves the same as before: checks the tracked proxy first,
otherwise starts `scripts/agentic-bridge/server.ts` fresh, confirms the real PID via `netstat`,
and persists the tracking file.

Replace the `### Operation: \`stop-agentic-bridge\` — explicit only` block with:

```bash
node <digismith-repo>/packages/cli/src/index.ts depot bridge stop
```

Reports "nothing to stop" plainly if no proxy is tracked.

- [ ] **Step 4: Update the Quick Reference table, the Error Handling table, and the shared-shape Out of Scope bullet**

In the Quick Reference table, update the three affected rows' "Effect" wording to say they run
via the `dg depot <resource> <verb>` CLI (e.g. "Runs `depot clone ensure` — clone if missing,
else no-op") instead of describing raw bash steps.

In the Error Handling table, replace the row:

```
| WINPID unresolvable (both `ps -W` and the `netstat -ano` fallback come back empty) | Never persist an empty pid — report the failure plainly rather than writing an unusable tracking file. |
```

with:

```
| `netstat -ano` can't confirm a PID listening on the expected port | Never persist an unconfirmed pid — `depot opencode ensure`/`depot bridge ensure` exit 1 and report the failure plainly rather than writing an unusable tracking file. |
```

(There is no more `ps -W`/`awk`/WINPID concept anywhere in this skill — `packages/cli/src/depot/process-lifecycle.ts` resolves and confirms the real PID itself, and works from any Windows shell, not just Git Bash.)

In the Out of Scope section, replace the bullet that reads (in full or in part) "Two of them
(OpenCode server, Agentic Bridge proxy) share the identical ensure/stop + PID/port-tracking
lifecycle shape, but duplicating this well-understood ~80-line pattern twice is still cheaper
and clearer than a premature abstraction — reconsider only if a third resource needs the same
shape." with:

> **A generalized multi-resource interface** — five concrete resources (one of them stateless,
> one a remote tmux session), five concrete operation sets. OpenCode server and Agentic Bridge
> share the identical ensure/stop + PID/port-tracking lifecycle shape; now that both are real,
> tested TypeScript (`packages/cli/src/depot/process-lifecycle.ts`, map item **V.5**) rather than
> duplicated skill prose, that shape is consolidated into one shared helper instead of being
> copy-pasted twice.

- [ ] **Step 5: Update `packages/cli/README.md`**

Add a `depot` block to the Commands section, after the existing `vps`/`--version` lines:

```
digismith depot clone ensure     # clone ~/.digismith-depot/repo if missing, else no-op
digismith depot clone refresh    # fetch + hard-reset the clone to origin/main
digismith depot opencode ensure  # start the shared OpenCode server if not already running
digismith depot opencode stop    # stop it
digismith depot bridge ensure    # start the Agentic Bridge proxy if not already running
digismith depot bridge stop      # stop it
```

Add one short paragraph below the existing `vps` config paragraph:

> `depot bridge ensure` needs to run from inside a DigiSmith checkout (or pass `--repo <path>`)
> — it launches that checkout's own `scripts/agentic-bridge/server.ts`, which isn't published in
> this package.

- [ ] **Step 6: Update `MEMORY.md`**

Add a new `· **V.5**` sentence to the end of map item **V**'s row (same row Task 3/docs of V.4
already extends), summarizing: date shipped, that it adds a `depot` command group to
`@digismith/cli` covering clone/opencode/bridge, that `skills/depot/SKILL.md` now delegates to
it instead of embedding bash, and the PID-resolution correction (child.pid + netstat, no
ps/awk, tree-kill via `taskkill /T`) found and fixed during this feature's own plan-writing.
Point at `.digismith/docs/depot-cli-command-group/design.html`/`plan.md`/`report.html`.

Do not hand-edit `.digismith/history.html` — the `03-history-update.md` post-finish hook
(**Y.1.3**) now does this automatically from `report.html` once this branch merges.

- [ ] **Step 7: Verify no stale bash remains**

Run: `grep -n "digismith-depot/repo/.git\|sparse-checkout set packages\|CHUTES_API_KEY=\$(python3\|WINPID" skills/depot/SKILL.md`
Expected: no output — confirms none of the replaced bash blocks or WINPID paragraphs were left behind.

- [ ] **Step 8: Commit**

```bash
git add skills/depot/SKILL.md packages/cli/README.md MEMORY.md
git commit -m "docs(depot): delegate SKILL.md to the new depot CLI command group"
```
