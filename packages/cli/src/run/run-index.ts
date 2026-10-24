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
