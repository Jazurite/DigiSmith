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
    return { command: "lsof", args: ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], parse: parseLsofPid };
  }
  return { command: "ss", args: ["-ltnp"], parse: (out) => parseSsPidForPort(out, port) };
}

export function isProcessAlive(pid: string): boolean {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
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

function lookupListenerPid(port: number, platform: NodeJS.Platform = process.platform): string | null {
  const { command, args, parse } = listenerCommand(platform, port);
  const result = spawnSync(command, args, { encoding: "utf-8" });
  if (result.error) {
    throw new Error(`could not run "${command}" — ${result.error.message}`);
  }
  return parse(result.stdout ?? "");
}

export function ensureProcess(config: EnsureConfig): { port: number } {
  const tracking = readTracking(config.trackingFile);
  if (tracking && isProcessAlive(tracking.pid)) {
    return { port: tracking.port };
  }

  const { command, args, env } = config.spawnCommand();
  fs.mkdirSync(path.dirname(config.logFile), { recursive: true });
  const logFd = fs.openSync(config.logFile, "w");
  const child = spawn(command, args, {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: env ? { ...process.env, ...env } : process.env,
  });
  fs.closeSync(logFd);
  if (child.pid === undefined) {
    // A failed spawn (e.g. ENOENT) still emits an async 'error' event later; swallow it here
    // since we've already synchronously detected and reported the failure below.
    child.on("error", () => {});
    throw new Error(`could not start "${command}" — not found on PATH`);
  }
  const pid = child.pid;
  child.unref();

  try {
    const deadline = Date.now() + 5000;
    let port: number | null = null;
    while (Date.now() < deadline && port === null) {
      sleepMs(200);
      const content = fs.existsSync(config.logFile) ? fs.readFileSync(config.logFile, "utf-8") : "";
      port = parseListeningPort(content);
    }
    if (port === null) {
      const content = fs.existsSync(config.logFile) ? fs.readFileSync(config.logFile, "utf-8") : "";
      throw new Error(`failed to start — no "listening on" line in ${config.logFile} within 5s\n${content}`);
    }

    const confirmedPid = lookupListenerPid(port);
    if (!confirmedPid) {
      throw new Error(`could not confirm a PID listening on port ${port}`);
    }

    writeTracking(config.trackingFile, { pid: confirmedPid, port });
    return { port };
  } catch (err) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
    throw err;
  }
}

// A child killed by this same Node process stays a zombie until the event loop runs, and
// kill(pid, 0) still succeeds on a zombie, so a zombie counts as gone.
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

// The tracked process leads its own group when ensureProcess spawned it (detached); fall back
// to the PID alone when it does not.
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
    // taskkill returned non-zero but the process is already gone (e.g. it exited on its own) —
    // this is a normal outcome, not a failure.
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
