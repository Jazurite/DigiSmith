import type { Git } from "./gitx.ts";

/** The scope of a conventional subject, split on "," and "/", lower-case. Only this part can name a key. */
export const scopeOf = (subject: string): string[] => {
  const m = /^\w+\(([^)]*)\)!?:/.exec(subject);
  return m ? m[1].split(/[,/]/).map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
};

/** Local `<KEY>__*`, `origin/<KEY>__*` and `origin/rescue/<KEY>` branches. */
function branchesFor(git: Git, repo: string, key: string): string[] {
  const out = git(repo, ["branch", "-a", "--list", `${key}__*`, `origin/${key}__*`, `origin/rescue/${key}`, "--format=%(refname:short)"]);
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

const isAncestor = (git: Git, repo: string, ref: string): boolean => {
  try { git(repo, ["merge-base", "--is-ancestor", ref, "origin/main"]); return true; } catch { return false; }
};

/** The origin/main log as (short sha, subject) rows. Read once per scan and passed in. */
export type MainLog = { sha: string; subject: string }[];

export function readMainLog(git: Git, repo: string): MainLog {
  const rows: MainLog = [];
  for (const line of git(repo, ["log", "origin/main", "--format=%h%x09%s"]).split("\n")) {
    const tab = line.indexOf("\t");
    if (tab >= 0) rows.push({ sha: line.slice(0, tab), subject: line.slice(tab + 1) });
  }
  return rows;
}

const namesKey = (subject: string, want: string): boolean => scopeOf(subject).includes(want);

/**
 * A short sha or reason when the key's work is on origin/main, else null.
 * (a) a main commit whose subject scope names the key.
 * (b) a `<KEY>__*` branch that is an ancestor of origin/main AND carries a commit of its own (within 200) whose scope names the key.
 *     A branch with no such commit, for example one sitting at the main tip, is never counted: unsure means not merged.
 */
export function mergedOnMain(git: Git, repo: string, key: string, log?: MainLog): string | null {
  const want = key.toLowerCase();
  for (const row of log ?? readMainLog(git, repo)) if (namesKey(row.subject, want)) return row.sha;
  for (const b of branchesFor(git, repo, key).filter((x) => !x.includes("rescue/"))) {
    if (!isAncestor(git, repo, b)) continue;
    const subjects = git(repo, ["log", b, "--max-count=200", "--format=%s"]).split("\n");
    if (subjects.some((x) => namesKey(x, want))) return `branch ${b}`;
  }
  return null;
}

/** null = the blocker passes. A blocker with any branch must be on main; a rescue branch alone blocks. */
export function blockerProblem(git: Git, repo: string, blockerKey: string, log?: MainLog): string | null {
  if (branchesFor(git, repo, blockerKey).length === 0) return null;
  return mergedOnMain(git, repo, blockerKey, log) === null ? `blocker-not-on-main: ${blockerKey}` : null;
}
