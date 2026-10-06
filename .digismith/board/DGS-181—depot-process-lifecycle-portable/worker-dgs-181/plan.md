# DGS-181 Portable depot process lifecycle: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:executing-plans (inline, 3 small tasks in 1 file pair) to implement this plan task-by-task.

**Goal:** `ensureProcess` and `stopProcess` work on macOS and Linux, and Windows keeps working.

**Architecture:** One file changes (`packages/cli/src/depot/process-lifecycle.ts`) plus its test. A pure `listenerCommand(platform, port)` picks the lookup tool. Pure parsers read `lsof`, `ss -ltnp` and `netstat -ano` output. Liveness uses `process.kill(pid, 0)`. POSIX stop kills the process group, then the PID. Windows stop stays on `taskkill`.

**Tech Stack:** TypeScript, Node 24 (`--experimental-strip-types`), vitest.

## Global Constraints

- macOS and Linux work, Windows keeps working (Jack, 2026-10-05). Acceptance runs on the Mac. Linux and Windows are fixtures only.
- Minimal diff. Do not touch `index.e2e`. Do not touch `bridge/` or `opencode/`.
- Parsers stay pure. Existing Windows tests must not regress.
- A spawn `ENOENT` is an error, never "stopped".
- SIGTERM, wait about 2 s, then SIGKILL (approved at checkpoint 1).
- DGS-180 leak fix stays: the `ensureProcess` catch still SIGKILLs the child it spawned.
- Worktree: `.worktrees/dgs-181`, branch `dgs-181-depot-portable`. Title-only conventional commits, no attribution lines.

## File Structure

- Modify `packages/cli/src/depot/process-lifecycle.ts`: add `parseLsofPid`, `parseSsPidForPort`, `listenerCommand`, `lookupListenerPid`, `isProcessAlive`, `isZombie`; edit `ensureProcess`, `stopProcess`.
- Modify `packages/cli/src/depot/process-lifecycle.test.ts`: fixtures and new tests.

Note on zombies: a child killed by the same Node process stays a zombie until the event loop runs. `kill(pid, 0)` still succeeds on a zombie. So the stop wait loop treats a process as gone when `ps -o stat= -p <pid>` starts with `Z` (POSIX only). The CLI itself does not need this (ensure and stop are separate processes), but the real-child test does.

### Task 1: Parsers and tool choice

**Files:** modify both files above.

**Interfaces:**
- Produces: `parseLsofPid(output: string): string | null`; `parseSsPidForPort(output: string, port: number): string | null`; `listenerCommand(platform: NodeJS.Platform, port: number): { command: string; args: string[]; parse: (stdout: string) => string | null }`.

- [ ] **Step 1: failing tests** (add to the test file, import the three names)

```ts
describe("parseLsofPid", () => {
  it("returns the first pid line", () => {
    expect(parseLsofPid("48211\n48212\n")).toBe("48211");
  });
  it("returns null for empty output", () => {
    expect(parseLsofPid("")).toBeNull();
  });
  it("ignores non-numeric lines", () => {
    expect(parseLsofPid("lsof: WARNING: can't stat() fuse\n48211\n")).toBe("48211");
  });
});

describe("parseSsPidForPort", () => {
  const header = "State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process";
  it("finds the pid for an IPv4 listener", () => {
    const out = [header, 'LISTEN 0      511    127.0.0.1:54321    0.0.0.0:*    users:(("node",pid=1234,fd=18))'].join("\n");
    expect(parseSsPidForPort(out, 54321)).toBe("1234");
  });
  it("finds the pid for an IPv6 and a wildcard listener", () => {
    const v6 = 'LISTEN 0      511    [::1]:54321    [::]:*    users:(("node",pid=77,fd=9))';
    const star = 'LISTEN 0      511    *:54321    *:*    users:(("node",pid=88,fd=9))';
    expect(parseSsPidForPort(v6, 54321)).toBe("77");
    expect(parseSsPidForPort(star, 54321)).toBe("88");
  });
  it("does not match a longer port that ends the same way", () => {
    const out = 'LISTEN 0 511 127.0.0.1:154321 0.0.0.0:* users:(("node",pid=5,fd=9))';
    expect(parseSsPidForPort(out, 54321)).toBeNull();
  });
  it("returns null when there is no process column", () => {
    expect(parseSsPidForPort("LISTEN 0 511 127.0.0.1:54321 0.0.0.0:*", 54321)).toBeNull();
  });
});

describe("listenerCommand", () => {
  it("uses lsof on darwin", () => {
    const c = listenerCommand("darwin", 4000);
    expect([c.command, ...c.args]).toEqual(["lsof", "-nP", "-iTCP:4000", "-sTCP:LISTEN", "-t"]);
  });
  it("uses ss on linux", () => {
    const c = listenerCommand("linux", 4000);
    expect([c.command, ...c.args]).toEqual(["ss", "-ltnp"]);
  });
  it("uses netstat on win32", () => {
    const c = listenerCommand("win32", 4000);
    expect([c.command, ...c.args]).toEqual(["netstat", "-ano"]);
    const out = "  TCP    127.0.0.1:4000        0.0.0.0:0              LISTENING       6789";
    expect(c.parse(out)).toBe("6789");
  });
  it("treats other platforms like linux", () => {
    expect(listenerCommand("freebsd", 4000).command).toBe("ss");
  });
});
```

- [ ] **Step 2:** `cd packages/cli && pnpm vitest run src/depot/process-lifecycle.test.ts`. Expected: FAIL, names not exported.

- [ ] **Step 3: implement** (after `parseNetstatPidForPort`)

```ts
export function parseLsofPid(lsofOutput: string): string | null {
  for (const rawLine of lsofOutput.split("\n")) {
    const line = rawLine.trim();
    if (/^\d+$/.test(line)) return line;
  }
  return null;
}

export function parseSsPidForPort(ssOutput: string, port: number): string | null {
  const suffix = `:${port}`;
  for (const rawLine of ssOutput.split("\n")) {
    const parts = rawLine.trim().split(/\s+/);
    if (parts[0] !== "LISTEN") continue;
    if (!(parts[3] ?? "").endsWith(suffix)) continue;
    const pid = rawLine.match(/pid=(\d+)/);
    if (pid) return pid[1];
  }
  return null;
}

export function listenerCommand(
  platform: NodeJS.Platform,
  port: number
): { command: string; args: string[]; parse: (stdout: string) => string | null } {
  if (platform === "win32") {
    return { command: "netstat", args: ["-ano"], parse: (out) => parseNetstatPidForPort(out, port) };
  }
  if (platform === "darwin") {
    return {
      command: "lsof",
      args: ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
      parse: parseLsofPid,
    };
  }
  return { command: "ss", args: ["-ltnp"], parse: (out) => parseSsPidForPort(out, port) };
}
```

- [ ] **Step 4:** rerun. Expected: PASS (Windows tests too).
- [ ] **Step 5:** `git commit -m "feat(cli): add lsof and ss listener parsers for depot"`

### Task 2: ensureProcess uses the portable lookup and liveness

**Interfaces:**
- Consumes: `listenerCommand`.
- Produces: `isProcessAlive(pid: string): boolean`; `lookupListenerPid(port: number, platform?: NodeJS.Platform): string | null` (throws `could not run "<tool>" — <message>` when the spawn fails).

- [ ] **Step 1: failing test** (test file; import `isProcessAlive`)

```ts
describe("isProcessAlive", () => {
  it("is true for this process and false for an unused pid", () => {
    expect(isProcessAlive(String(process.pid))).toBe(true);
    expect(isProcessAlive("2147483646")).toBe(false);
  });
});
```
The existing real-child test "starts a real process, tracks ..." is the failing check for the lookup: it fails today on macOS with "could not confirm a PID listening on port N via netstat".

- [ ] **Step 2:** run. Expected: FAIL (`isProcessAlive` missing; real-child test fails as before).

- [ ] **Step 3: implement.** Add:

```ts
export function isProcessAlive(pid: string): boolean {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function lookupListenerPid(port: number, platform: NodeJS.Platform = process.platform): string | null {
  const { command, args, parse } = listenerCommand(platform, port);
  const result = spawnSync(command, args, { encoding: "utf-8" });
  if (result.error) {
    throw new Error(`could not run "${command}" — ${result.error.message}`);
  }
  return parse(result.stdout ?? "");
}
```
In `ensureProcess`: replace the `tasklist` reuse check with `if (tracking && isProcessAlive(tracking.pid)) return { port: tracking.port };`. Replace the netstat block with `const confirmedPid = lookupListenerPid(port);` and the error text with `could not confirm a PID listening on port ${port}`. The existing test regex `/could not confirm a PID/` still matches. Export `lookupListenerPid` only if a test needs it.

- [ ] **Step 4:** run. Expected: the first two real-child steps pass up to `stopProcess` (stop is Task 3, so the first real-child test may still fail at stop; the "kills the process it spawned" test must pass).
- [ ] **Step 5:** `git commit -m "feat(cli): confirm depot listener with lsof, ss or netstat per platform"`

### Task 3: stopProcess portable, ENOENT is an error

**Interfaces:**
- Consumes: `isProcessAlive`.
- Produces: `stopProcess(config: TrackingTarget, platform?: NodeJS.Platform): { stopped: boolean; error?: string }`.

- [ ] **Step 1: failing tests** (test file; `os`, `path`, `fs` already imported)

```ts
describe("stopProcess errors", () => {
  it("returns an error, keeps the tracking file, when taskkill does not exist (spawn ENOENT)", () => {
    // win32 path on a host without taskkill (macOS, Linux): the spawn fails with ENOENT.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-lifecycle-"));
    try {
      const trackingFile = path.join(tmpDir, "tracking.json");
      writeTracking(trackingFile, { pid: "2147483646", port: 1 });
      const result = stopProcess({ label: "dummy", trackingFile }, "win32");
      expect(result.stopped).toBe(false);
      expect(result.error).toMatch(/taskkill/);
      expect(readTracking(trackingFile)).not.toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("reports stopped when the tracked pid is already gone (posix)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-lifecycle-"));
    try {
      const trackingFile = path.join(tmpDir, "tracking.json");
      writeTracking(trackingFile, { pid: "2147483646", port: 1 });
      expect(stopProcess({ label: "dummy", trackingFile }, "linux").stopped).toBe(true);
      expect(readTracking(trackingFile)).toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
```
The test "taskkill ENOENT" is skipped on a host that has `taskkill` (Windows): guard with `it.skipIf(process.platform === "win32")`.

- [ ] **Step 2:** run. Expected: FAIL (second parameter ignored, today's code returns `stopped: true` on ENOENT; this is bug 2).

- [ ] **Step 3: implement.** Replace `stopProcess`:

```ts
function isZombie(pid: string): boolean {
  const ps = spawnSync("ps", ["-o", "stat=", "-p", pid], { encoding: "utf-8" });
  return (ps.stdout ?? "").trim().startsWith("Z");
}

function waitUntilGone(pid: string, timeoutMs: number): boolean {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid) || isZombie(pid)) return true;
    sleepMs(50);
  }
  return !isProcessAlive(pid) || isZombie(pid);
}

function signalGroupOrPid(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
    return;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ESRCH" && code !== "EPERM") throw err;
  }
  try {
    process.kill(pid, signal);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ESRCH") throw err;
  }
}

function stopWindows(pid: string): { error?: string } {
  const result = spawnSync("taskkill", ["/PID", pid, "/T", "/F"], { encoding: "utf-8" });
  if (result.error) return { error: `could not run "taskkill" — ${result.error.message}` };
  if (result.status !== 0) {
    const check = spawnSync("tasklist", ["/FI", `PID eq ${pid}`], { encoding: "utf-8" });
    if (check.error) return { error: `could not run "tasklist" — ${check.error.message}` };
    if (isPidListed(check.stdout ?? "", pid)) {
      return { error: (result.stderr ?? "").trim() || "taskkill failed" };
    }
    // taskkill returned non-zero but the process is already gone: a normal outcome.
  }
  return {};
}

function stopPosix(pid: string): { error?: string } {
  try {
    signalGroupOrPid(Number(pid), "SIGTERM");
    if (!waitUntilGone(pid, 2000)) {
      signalGroupOrPid(Number(pid), "SIGKILL");
      if (!waitUntilGone(pid, 2000)) return { error: `process ${pid} did not exit after SIGKILL` };
    }
  } catch (err) {
    return { error: (err as Error).message };
  }
  return {};
}

export function stopProcess(
  config: TrackingTarget,
  platform: NodeJS.Platform = process.platform
): { stopped: boolean; error?: string } {
  const tracking = readTracking(config.trackingFile);
  if (!tracking) return { stopped: false };
  const outcome = platform === "win32" ? stopWindows(tracking.pid) : stopPosix(tracking.pid);
  if (outcome.error) return { stopped: false, error: outcome.error };
  fs.rmSync(config.trackingFile, { force: true });
  return { stopped: true };
}
```
Note: `isZombie` is only reached on POSIX, so `ps` is not a Windows dependency. If `ps` is missing, `ps.stdout` is empty and a zombie reads as alive: acceptable, the escalation then reports an error rather than a false "stopped".

- [ ] **Step 4:** `pnpm vitest run src/depot/process-lifecycle.test.ts`. Expected: all pass, including both real-child tests. Then count children: `ps -axo pid,command | grep -c "depot-lifecycle"` before and after the run must match (DGS-180: no leak).
- [ ] **Step 5:** `git commit -m "fix(cli): stop depot processes without taskkill and fail on spawn ENOENT"`

### Task 4: Full suite and acceptance on the Mac

- [ ] **Step 1:** full suite in `packages/cli`: `pnpm test`. Expected: only `index.e2e` (--help colour) fails, same as `FORCE_COLOR=1` passing. Record counts before (on `main` in the worktree, before Task 1) and after.
- [ ] **Step 2:** typecheck/build check: `pnpm build` in `packages/cli` (or `tsc -p tsconfig.build.json --noEmit`). Expected: clean.
- [ ] **Step 3 (acceptance, throwaway setup, never the real config).** Make a scratch HOME in the scratchpad dir: `$S/home`. Put a stub `$S/home/.claude/skills/chutes-ai/scripts/manage_credentials.py` that prints `throwaway-key` (no real credentials read). Run with `HOME=$S/home PATH=$HOME_REAL/.local/bin:$PATH`, so OpenCode config, tracking file (`$S/home/.digismith-depot/opencode-server.json`) and log all land in the scratch HOME. OpenCode picks its own free port (`--port 0`), which is the throwaway port.
  1. Before: `ps -axo pid,command | grep -E "opencode serve" | grep -v grep` (count) and `lsof -nP -iTCP -sTCP:LISTEN | grep opencode` (count).
  2. `node --experimental-strip-types packages/cli/src/index.ts depot opencode ensure` (or the built `dg`, whichever the repo's bin uses). Expect `ready on port N`.
  3. Show `lsof -nP -iTCP:N -sTCP:LISTEN`, the tracking-file PID, and `ps -p <pid> -o pid,pgid,command`. The PID must equal the listener PID and, if it is the group leader, the PGID.
  4. Run `ensure` again: expect the same port (reuse, no second process).
  5. `... depot opencode stop`. Expect `stopped`. Then show nothing listens on N, the PID is gone, the tracking file is gone, and the process count equals the count from step 1.
  6. If any step leaves a process, kill only that PID by number, and report it.
- [ ] **Step 4:** write `worker-dgs-181/report.html` after checkpoint 3 approval of the diff.

## Test list (summary)

1. `parseLsofPid`: first pid; empty; noise line.
2. `parseSsPidForPort`: IPv4, IPv6, wildcard; longer-port non-match; no process column.
3. `listenerCommand`: darwin, linux, win32 (with parse), other.
4. `isProcessAlive`: self true, unused pid false.
5. `stopProcess`: win32 on a host without `taskkill` returns an error and keeps the tracking file (ENOENT); posix already-gone returns stopped.
6. Existing real-child tests: start, track, reuse, stop; kill-on-unconfirmed-pid; no-listening-line; missing binary. All must pass on macOS, no leftover child.
7. Existing Windows parser and `isPidListed` tests unchanged.

## Self-review

- Spec coverage: item 1 (Tasks 2, 3), item 2 (Task 3 test), item 3 (Task 1), item 4 (Task 4), item 5 (Tasks 2, 3). No gap.
- Names match across tasks: `listenerCommand`, `lookupListenerPid`, `isProcessAlive`, `stopProcess(config, platform)`.
- Execution: inline `digismith:executing-plans` (one file pair, three small tasks), starts only after "approved: checkpoint 2".
