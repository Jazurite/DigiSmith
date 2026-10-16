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
  base?: string;
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

export function cleanup({ repo, branch, worktree, base = "main", dryRun = false }: CleanupOptions): CleanupResult {
  const steps: string[] = [];
  const stop = (message: string): CleanupResult => ({ ok: false, steps, message });
  const act = (label: string, run: () => void) => {
    steps.push(dryRun ? `would ${label}` : label);
    if (!dryRun) run();
  };

  const pinRefs = ["base", "head"].map((pin) => `refs/digismith/post-finish/${branch}/${pin}`);
  const branchExists = git(repo, "branch", "--list", branch) !== "";
  if (!branchExists && !existsSync(worktree) && pinRefs.every((r) => !git(repo, "for-each-ref", r))) {
    return { ok: true, steps, message: `already cleaned: no branch, worktree or pins left for ${branch}` };
  }
  const merged = git(repo, "branch", "--merged", base, "--format=%(refname:short)").split("\n");
  if (!merged.includes(branch)) return stop(`branch ${branch} is not merged into ${base}; nothing was changed`);

  for (const ref of pinRefs) {
    if (git(repo, "for-each-ref", ref)) act(`delete pin ${ref}`, () => git(repo, "update-ref", "-d", ref));
  }

  if (existsSync(worktree)) {
    // -z: paths come raw (no quoting, no octal escapes); a rename entry carries its source path as an extra token.
    const tokens = gitRaw(worktree, "status", "--porcelain", "-z", "--untracked-files=all").split("\0").filter(Boolean);
    const dirty: { code: string; path: string }[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const code = tokens[i].slice(0, 2);
      dirty.push({ code, path: tokens[i].slice(3) });
      if (code[0] === "R" || code[0] === "C") i++;
    }
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
  const base = args.get("base") ?? "main";
  const branch = args.get("branch");
  const worktree = args.get("worktree");
  if (!branch || !worktree) {
    console.error("usage: post-merge-cleanup.ts --branch <name> --worktree <path> [--base <branch>] [--dry-run]");
    return 2;
  }
  try {
    const repo = git(process.cwd(), "rev-parse", "--path-format=absolute", "--git-common-dir").replace(/\/\.git$/, "");
    const wt = resolve(worktree);
    const here = resolve(process.cwd());
    if (here === wt || here.startsWith(`${wt}/`)) {
      console.error("post-merge-cleanup: run it from the main checkout, not from inside the worktree");
      return 2;
    }
    const r = cleanup({ repo, branch, worktree: wt, base, dryRun });
    for (const s of r.steps) console.log(s);
    (r.ok ? console.log : console.error)(r.message);
    return r.ok ? 0 : 1;
  } catch (e) {
    console.error(`post-merge-cleanup: failed (${(e as Error).message.split("\n")[0]})`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
