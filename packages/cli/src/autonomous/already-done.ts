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

/** A short sha or reason when the key's work is on origin/main (scope rule or merged `<KEY>__*` branch), else null. */
export function mergedOnMain(git: Git, repo: string, key: string): string | null {
  const want = key.toLowerCase();
  for (const line of git(repo, ["log", "origin/main", "--format=%h%x09%s"]).split("\n")) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    if (scopeOf(line.slice(tab + 1)).includes(want)) return line.slice(0, tab);
  }
  for (const b of branchesFor(git, repo, key).filter((x) => !x.includes("rescue/"))) {
    if (isAncestor(git, repo, b)) return `branch ${b}`;
  }
  return null;
}

/** null = the blocker passes. A blocker with any branch must be on main; a rescue branch alone blocks. */
export function blockerProblem(git: Git, repo: string, blockerKey: string): string | null {
  if (branchesFor(git, repo, blockerKey).length === 0) return null;
  return mergedOnMain(git, repo, blockerKey) === null ? `blocker-not-on-main: ${blockerKey}` : null;
}
