import type { Git } from "./gitx.ts";

/** The scope of a conventional subject, split on "," and "/", lower-case. Only this part can name a key. */
export const scopeOf = (subject: string): string[] => {
  const m = /^\w+\(([^)]*)\)!?:/.exec(subject);
  return m ? m[1].split(/[,/]/).map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
};

/** Local `<KEY>__*`, `origin/<KEY>__*`, and rescue branches `rescue/<KEY>` and `rescue/<KEY>-*` (dated), local and origin. */
function branchesFor(git: Git, repo: string, key: string): string[] {
  const out = git(repo, ["branch", "-a", "--list", `${key}__*`, `origin/${key}__*`, `origin/rescue/${key}`, `origin/rescue/${key}-*`, `rescue/${key}`, `rescue/${key}-*`, "--format=%(refname:short)"]);
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

const isAncestor = (git: Git, repo: string, ref: string): boolean => {
  try { git(repo, ["merge-base", "--is-ancestor", ref, "origin/main"]); return true; } catch { return false; }
};

/** The origin/main log as (short sha, subject, changed files) rows. Read once per scan and passed in. */
export type MainLog = { sha: string; subject: string; files: string[] }[];

/** Parse `--name-only --format=%x01<sha>\t<subject>` output: a line that starts with \x01 opens a row, other non-empty lines are its files. */
const parseLog = (out: string, withSha: boolean): MainLog => {
  const rows: MainLog = [];
  for (const line of out.split("\n")) {
    if (line.startsWith("\x01")) {
      const rest = line.slice(1);
      const tab = withSha ? rest.indexOf("\t") : -1;
      rows.push(tab >= 0 ? { sha: rest.slice(0, tab), subject: rest.slice(tab + 1), files: [] } : { sha: "", subject: rest, files: [] });
    } else if (line !== "" && rows.length > 0) rows[rows.length - 1].files.push(line);
  }
  return rows;
};

export function readMainLog(git: Git, repo: string): MainLog {
  return parseLog(git(repo, ["-c", "core.quotepath=off", "log", "origin/main", "--no-renames", "--name-only", "--format=%x01%h%x09%s"]), true);
}

const namesKey = (subject: string, want: string): boolean => scopeOf(subject).includes(want);

/** Refinement docs: files exist and every one lies in the key's own board folder (`.digismith/board/<KEY>—`). Merge and empty commits have no files and so count. */
export const isBoardDocs = (key: string, files: string[]): boolean => {
  const prefix = `.digismith/board/${key.toUpperCase()}—`;
  return files.length > 0 && files.every((f) => f.startsWith(prefix));
};

const counts = (row: { subject: string; files: string[] }, want: string): boolean => namesKey(row.subject, want) && !isBoardDocs(want, row.files);

/**
 * A short sha or reason when the key's work is on origin/main, else null.
 * A commit whose files all lie in the key's own board folder is refinement docs and never counts.
 * (a) a main commit whose subject scope names the key.
 * (b) a `<KEY>__*` branch that is an ancestor of origin/main AND carries a commit of its own (within 200) whose scope names the key.
 *     Note: an ancestor branch's log holds only commits already on main, so rule (b) is in effect subsumed by rule (a). It stays because it
 *     never claims less than rule (a) and adds no new skip. A stricter, reliable variant needs reflog evidence and is out of scope (Maestro to decide).
 *     A branch with no such commit, for example one sitting at the main tip, is never counted: unsure means not merged.
 */
export function mergedOnMain(git: Git, repo: string, key: string, log?: MainLog): string | null {
  const want = key.toLowerCase();
  for (const row of log ?? readMainLog(git, repo)) if (counts(row, want)) return row.sha;
  for (const b of branchesFor(git, repo, key).filter((x) => !x.includes("rescue/"))) {
    if (!isAncestor(git, repo, b)) continue;
    const rows = parseLog(git(repo, ["-c", "core.quotepath=off", "log", b, "--max-count=200", "--no-renames", "--name-only", "--format=%x01%s"]), false);
    if (rows.some((x) => counts(x, want))) return `branch ${b}`;
  }
  return null;
}

/**
 * null = the blocker passes. Checks in this order:
 * (1) a key-scoped commit on origin/main (rule a): merged, passes even when a rescue branch exists (merged, then salvaged).
 * (2) else an unmerged rescue branch (`rescue/<KEY>` or `rescue/<KEY>-<UTC>`, local or origin; not an ancestor of origin/main) blocks.
 * (3) else a branch of the key that is an ancestor of origin/main passes on pure ancestry.
 * (4) else no branch at all passes (ClickUp done); a `<KEY>__*` branch not on main blocks.
 */
export function blockerProblem(git: Git, repo: string, blockerKey: string, log?: MainLog): string | null {
  const blocked = `blocker-not-on-main: ${blockerKey}`;
  const want = blockerKey.toLowerCase();
  if ((log ?? readMainLog(git, repo)).some((row) => counts(row, want))) return null;
  const branches = branchesFor(git, repo, blockerKey);
  if (branches.length === 0) return null;
  if (branches.some((b) => b.includes("rescue/") && !isAncestor(git, repo, b))) return blocked;
  return branches.some((b) => isAncestor(git, repo, b)) ? null : blocked;
}
