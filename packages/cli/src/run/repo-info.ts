// packages/cli/src/run/repo-info.ts
// Project, root, branch and worktree of a cwd, read from the .git files. No git process: the hook must stay fast.
import * as fs from "node:fs";
import * as path from "node:path";

export type RepoInfo = { project: string; root: string | null; branch: string | null; worktree: string | null };

export function safeName(s: string): string {
  const t = s.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[^A-Za-z0-9]+/, "");
  return t === "" ? "unknown" : t;
}

function headBranch(gitDir: string): string | null {
  try {
    const m = /^ref: refs\/heads\/(.+?)\s*$/.exec(fs.readFileSync(path.join(gitDir, "HEAD"), "utf8"));
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export function repoInfo(cwd: unknown): RepoInfo {
  if (typeof cwd !== "string" || !path.isAbsolute(cwd)) return { project: "unknown", root: null, branch: null, worktree: null };
  let dir = path.resolve(cwd);
  for (;;) {
    const dotGit = path.join(dir, ".git");
    let st: fs.Stats | null = null;
    try { st = fs.statSync(dotGit); } catch { /* not here */ }
    if (st?.isDirectory()) return { project: safeName(path.basename(dir)), root: dir, branch: headBranch(dotGit), worktree: null };
    if (st?.isFile()) {
      try {
        const m = /^gitdir:\s*(.+?)\s*$/m.exec(fs.readFileSync(dotGit, "utf8"));
        if (m) {
          const gitDir = path.resolve(dir, m[1]);
          const wm = /^(.*)[\\/]\.git[\\/]worktrees[\\/][^\\/]+$/.exec(gitDir);
          const root = wm ? wm[1] : dir;
          return { project: safeName(path.basename(root)), root, branch: headBranch(gitDir), worktree: dir };
        }
      } catch { /* unreadable .git file: treat as no repo */ }
      return { project: safeName(path.basename(dir)), root: dir, branch: null, worktree: null };
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return { project: safeName(path.basename(path.resolve(cwd))), root: null, branch: null, worktree: null };
}

export function ticketOfBranch(branch: string | null): string | null {
  const m = branch === null ? null : /^([A-Z]+-\d+)__/.exec(branch);
  return m ? m[1] : null;
}
