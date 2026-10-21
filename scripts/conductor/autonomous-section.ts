import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";

const DAY_MS = 24 * 3600_000;

// Same env rules as autonomousDir() in packages/cli/src/autonomous/state.ts (kept local: scripts/ does not import packages/cli).
export function autonomousDirFor(env: NodeJS.ProcessEnv): string {
  if (env.AUTONOMOUS_DIR) return env.AUTONOMOUS_DIR;
  return path.join(env.DIGISMITH_DEPOT_DIR || path.join(homedir(), ".digismith-depot"), "autonomous");
}

const stem = (n: string): string => n.replace(/\.md$/, "");

// The newest Autonomous Operation report (under 24 h old) for the catch-up; "" on any problem.
export function autonomousSection(dir: string, now: Date): string {
  try {
    const reports = path.join(dir, "reports");
    let best: { name: string; mtime: number } | null = null;
    for (const name of fs.readdirSync(reports)) {
      const mtime = fs.statSync(path.join(reports, name)).mtimeMs;
      if (!best || mtime > best.mtime || (mtime === best.mtime && stem(name) > stem(best.name))) best = { name, mtime };
    }
    if (!best || now.getTime() - best.mtime > DAY_MS) return "";
    const text = fs.readFileSync(path.join(reports, best.name), "utf-8");
    const nl = text.indexOf("\n");
    const body = text.startsWith("# ") ? (nl < 0 ? "" : text.slice(nl + 1)) : text;
    return `\n## Autonomous Operation, last report\n${body}`;
  } catch {
    return "";
  }
}
