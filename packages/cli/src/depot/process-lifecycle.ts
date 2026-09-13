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
