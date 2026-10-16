import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Untracked paths under these prefixes are tool caches: safe to drop with the worktree.
export const KNOWN_CACHES = [".impeccable/"];

export interface CleanupOptions {
  repo: string;
  branch: string;
  worktree: string;
  dryRun?: boolean;
}

export interface CleanupResult {
  ok: boolean;
  steps: string[];
  message: string;
}

const gitRaw = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const git = (cwd: string, ...args: string[]): string => gitRaw(cwd, ...args).trim();

export function cleanup({ repo, branch, worktree, dryRun = false }: CleanupOptions): CleanupResult {
  const steps: string[] = [];
  const stop = (message: string): CleanupResult => ({ ok: false, steps, message });
  const act = (label: string, run: () => void) => {
    steps.push(dryRun ? `would ${label}` : label);
    if (!dryRun) run();
  };

  const merged = git(repo, "branch", "--merged", "main", "--format=%(refname:short)").split("\n");
  if (!merged.includes(branch)) return stop(`branch ${branch} is not merged into main; nothing was changed`);

  for (const pin of ["base", "head"]) {
    const ref = `refs/digismith/post-finish/${branch}/${pin}`;
    if (git(repo, "for-each-ref", ref)) act(`delete pin ${ref}`, () => git(repo, "update-ref", "-d", ref));
  }

  if (existsSync(worktree)) {
    const dirty = gitRaw(worktree, "status", "--porcelain", "--untracked-files=all")
      .split("\n")
      .filter(Boolean)
      .map((line) => ({ code: line.slice(0, 2), path: line.slice(3) }));
    const tracked = dirty.filter((f) => f.code !== "??");
    const untracked = dirty.filter((f) => f.code === "??");
    const other = untracked.filter((f) => !KNOWN_CACHES.some((c) => f.path.startsWith(c)));
    if (tracked.length > 0 || other.length > 0) {
      const list = [...tracked, ...other].map((f) => `  ${f.code.trim()} ${f.path}`).join("\n");
      return stop(`worktree ${worktree} holds changes that are not known caches; branch and worktree kept:\n${list}`);
    }
    const force = untracked.length > 0;
    act(`remove worktree ${worktree}${force ? " (--force, caches only)" : ""}`, () =>
      git(repo, "worktree", "remove", ...(force ? ["--force"] : []), worktree),
    );
  } else {
    steps.push(`worktree ${worktree} already gone`);
  }

  act("prune worktrees", () => git(repo, "worktree", "prune"));
  act(`delete branch ${branch}`, () => git(repo, "branch", "-d", branch));
  return { ok: true, steps, message: `${dryRun ? "dry run: " : ""}cleanup done for ${branch}` };
}

function main(argv: string[]): number {
  const args = new Map<string, string>();
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") dryRun = true;
    else if (argv[i].startsWith("--")) args.set(argv[i].slice(2), argv[++i]);
  }
  const branch = args.get("branch");
  const worktree = args.get("worktree");
  if (!branch || !worktree) {
    console.error("usage: post-merge-cleanup.ts --branch <name> --worktree <path> [--dry-run]");
    return 2;
  }
  try {
    const repo = git(process.cwd(), "rev-parse", "--path-format=absolute", "--git-common-dir").replace(/\/\.git$/, "");
    const r = cleanup({ repo, branch, worktree: resolve(worktree), dryRun });
    for (const s of r.steps) console.log(s);
    (r.ok ? console.log : console.error)(r.message);
    return r.ok ? 0 : 1;
  } catch (e) {
    console.error(`post-merge-cleanup: failed (${(e as Error).message.split("\n")[0]})`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
