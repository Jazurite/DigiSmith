import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

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

export function readGitBlob(sha: string, relPath: string): string | null {
  const result = spawnSync("git", ["show", `${sha}:${relPath}`], { encoding: "utf8" });
  if (result.status === 0) {
    return result.stdout;
  }
  if (result.status === 128 && result.stderr.includes("does not exist in")) {
    return null;
  }
  throw new Error(`git show failed for ${sha}:${relPath}: ${result.stderr}`);
}

export function readFileIfExists(absPath: string): string | null {
  if (!fs.existsSync(absPath)) {
    return null;
  }
  return fs.readFileSync(absPath, "utf8");
}

export function listBaselineFiles(sha: string, skillRelDir: string): string[] {
  const result = spawnSync("git", ["ls-tree", "-r", "--name-only", sha, "--", skillRelDir], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git ls-tree failed for ${sha} ${skillRelDir}: ${result.stderr}`);
  }
  const prefix = `${skillRelDir}/`;
  return result.stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line));
}

export function diffContent(contentA: string, contentB: string): string {
  if (contentA === contentB) {
    return "";
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digismith-vendor-diff-"));
  const fileA = path.join(tmpDir, "a");
  const fileB = path.join(tmpDir, "b");
  try {
    fs.writeFileSync(fileA, contentA);
    fs.writeFileSync(fileB, contentB);
    const result = spawnSync("git", ["diff", "--no-color", "--no-index", "--", fileA, fileB], {
      encoding: "utf8",
    });
    if (result.status !== 0 && result.status !== 1) {
      throw new Error(`git diff --no-index failed: ${result.stderr}`);
    }
    return result.stdout;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
