import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface DirEntry {
  path: string;
  mtimeMs: number;
}

export function pickMostRecentDir(dirs: DirEntry[]): string {
  if (dirs.length === 0) {
    throw new Error("no directories found");
  }
  let best = dirs[0];
  for (const d of dirs.slice(1)) {
    if (d.mtimeMs > best.mtimeMs) {
      best = d;
    }
  }
  return best.path;
}

export function resolveUpstreamSkillsDir(baseDir: string = os.homedir()): string {
  const cacheRoot = path.join(
    baseDir,
    ".claude",
    "plugins",
    "cache",
    "claude-plugins-official",
    "superpowers"
  );
  if (!fs.existsSync(cacheRoot)) {
    throw new Error(`Superpowers plugin cache not found at ${cacheRoot}`);
  }
  const entries = fs
    .readdirSync(cacheRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e): DirEntry => {
      const fullPath = path.join(cacheRoot, e.name);
      return { path: fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    });
  const chosen = pickMostRecentDir(entries);
  return path.join(chosen, "skills");
}
