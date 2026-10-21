import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const SAFE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isSafe(name: string): boolean {
  return SAFE_RE.test(name);
}

export function depotDir(env: NodeJS.ProcessEnv = process.env): string {
  const o = env.DIGISMITH_DEPOT_DIR;
  return o !== undefined && o !== "" ? o : path.join(os.homedir(), ".digismith-depot");
}

export function runsDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(depotDir(env), "runs");
}

// The run directory of an id, found by scanning runs/*/<id>. Null when the id is unsafe or has no run.json.
export function findRunDir(runId: string, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!isSafe(runId)) return null;
  const root = runsDir(env);
  let keys: string[];
  try {
    keys = fs.readdirSync(root);
  } catch {
    return null;
  }
  for (const key of keys) {
    const dir = path.join(root, key, runId);
    if (fs.existsSync(path.join(dir, "run.json"))) return dir;
  }
  return null;
}
