import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function claudeProjectsDir(): string {
  return process.env.DIGISMITH_CLAUDE_PROJECTS_DIR ?? join(homedir(), ".claude", "projects");
}

function projectDirs(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .map((n) => join(root, n))
    .filter((p) => statSync(p).isDirectory());
}

export function findTranscript(sessionId: string, root: string = claudeProjectsDir()): string | null {
  for (const dir of projectDirs(root)) {
    const file = join(dir, `${sessionId}.jsonl`);
    if (existsSync(file)) return file;
  }
  return null;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// In a title: the key as a whole token, any case.
function titleRegex(ticket: string): RegExp {
  return new RegExp(`(^|[^A-Za-z0-9])${escapeRegex(ticket)}(?![A-Za-z0-9])`, "i");
}

// In a branch name or a path segment: the key at the start, then "__", "-" or the end.
function nameRegex(ticket: string): RegExp {
  return new RegExp(`^${escapeRegex(ticket)}(__|-|$)`, "i");
}

function readHead(file: string, maxLines: number): string[] {
  return readFileSync(file, "utf-8").split("\n", maxLines);
}

export function inferSessionsForTicket(ticket: string, root: string = claudeProjectsDir()): string[] {
  const titleRe = titleRegex(ticket);
  const nameRe = nameRegex(ticket);
  const found: string[] = [];
  for (const dir of projectDirs(root)) {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".jsonl")) continue;
      const sid = name.slice(0, -".jsonl".length);
      let hit = false;
      const titleFile = join(dir, sid, "custom-title.json");
      if (existsSync(titleFile)) {
        try {
          const title = (JSON.parse(readFileSync(titleFile, "utf-8")) as { customTitle?: string }).customTitle ?? "";
          hit = titleRe.test(title);
        } catch {
          // unreadable title: fall through to branch and cwd
        }
      }
      if (!hit) {
        // Only the first line carrying gitBranch and the first line carrying cwd decide.
        let branchSeen = false;
        let cwdSeen = false;
        for (const raw of readHead(join(dir, name), 200)) {
          if (!raw || (branchSeen && cwdSeen)) continue;
          try {
            const o = JSON.parse(raw) as { gitBranch?: string; cwd?: string };
            if (!branchSeen && o.gitBranch) {
              branchSeen = true;
              if (nameRe.test(o.gitBranch)) hit = true;
            }
            if (!cwdSeen && o.cwd) {
              cwdSeen = true;
              if (o.cwd.split("/").some((seg) => nameRe.test(seg))) hit = true;
            }
          } catch {
            continue;
          }
          if (hit || (branchSeen && cwdSeen)) break;
        }
      }
      if (hit) found.push(sid);
    }
  }
  return found;
}
