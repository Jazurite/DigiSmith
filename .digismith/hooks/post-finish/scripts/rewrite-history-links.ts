import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { isPublished } from "./update-history.ts";
import { parseArgs, requireArgs } from "../../../../scripts/cli-args.ts";

// One-time migration helper (DGS-389): rewrites the relative links of the old repo-bound
// history page into permalinks pinned to one commit, so the page works outside the repo.

export interface RewriteOptions {
  blobBase: string; // https://github.com/<owner>/<repo>/blob/<sha>
  cwd: string; // checkout that holds the commit
  sha: string; // commit the links are checked against
  renames: [string, string][]; // [old path prefix, new path prefix], relative to .digismith/
}

export interface RewriteResult {
  html: string;
  fixed: { old: string; new: string }[];
  dead: string[];
}

function existsAt(sha: string, repoPath: string, cwd: string): boolean {
  return spawnSync("git", ["cat-file", "-e", `${sha}:${repoPath}`], { cwd }).status === 0;
}

function toRepoPath(href: string): string {
  return href.startsWith("../") ? href.slice(3) : `.digismith/${href}`;
}

function encodePath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/");
}

export function rewriteHistoryLinks(html: string, opts: RewriteOptions): RewriteResult {
  const fixed: RewriteResult["fixed"] = [];
  const dead: string[] = [];
  const out = html.replace(/href="([^"]*)"/g, (whole, href: string) => {
    if (href.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(href)) return whole;
    const hashAt = href.indexOf("#");
    const rawPath = hashAt === -1 ? href : href.slice(0, hashAt);
    const anchor = hashAt === -1 ? "" : href.slice(hashAt);
    const relPath = decodeURIComponent(rawPath);

    let candidate = relPath;
    let renamed = false;
    if (!existsAt(opts.sha, toRepoPath(candidate), opts.cwd)) {
      for (const [from, to] of opts.renames) {
        if (relPath.startsWith(from)) {
          candidate = to + relPath.slice(from.length);
          renamed = true;
          break;
        }
      }
      if (!renamed || !existsAt(opts.sha, toRepoPath(candidate), opts.cwd)) {
        dead.push(relPath);
        return whole;
      }
    }
    const next = `${opts.blobBase}/${encodePath(toRepoPath(candidate))}${anchor}`;
    if (renamed) fixed.push({ old: relPath, new: next });
    return `href="${next}"`;
  });
  return { html: out, fixed, dead };
}

// The clan A renumbering (DGS-186 era) moved these folders; each old entry points at the new home.
export const CLAN_A_RENAMES: [string, string][] = [
  ["docs/A/A.0/lineage-handoff/", "docs/A/A.1/lineage-handoff/"],
  ["docs/A/A.2/centralized-digismith-config-file/", "docs/A/A.4/centralized-digismith-config-file/"],
  ["docs/A/A.2/migrate-own-repo-config-yml/", "docs/A/A.4/migrate-own-repo-config-yml/"],
];

function realPathOfFile(file: string): string {
  return path.join(fs.realpathSync(path.dirname(path.resolve(file))), path.basename(file));
}

// The page is rewritten in place, so refuse the frozen repo page, and refuse a sha GitHub cannot
// resolve yet (every link would stay dead).
export function checkRewriteGuards(page: string, sha: string, cwd: string): void {
  const top = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  if (top.status === 0) {
    const root = fs.realpathSync(top.stdout.trim());
    const rel = path.relative(root, realPathOfFile(page));
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
      throw new Error(`--page ${page} is inside the git worktree ${root}; copy the page out first`);
    }
  }
  if (!isPublished(sha, cwd)) {
    throw new Error(`--sha ${sha} is not pushed to origin, so the permalinks would not resolve`);
  }
}

export function main(): void {
  const args = parseArgs(process.argv.slice(2));
  try {
    requireArgs(args, ["page", "sha", "blob-base"]);
    const cwd = process.cwd();
    checkRewriteGuards(args.page, args.sha, cwd);
    const html = fs.readFileSync(args.page, "utf8");
    const result = rewriteHistoryLinks(html, {
      blobBase: args["blob-base"],
      cwd,
      sha: args.sha,
      renames: CLAN_A_RENAMES,
    });
    fs.writeFileSync(args.page, result.html);
    for (const f of result.fixed) console.log(`FIXED ${f.old} -> ${f.new}`);
    for (const d of result.dead) console.log(`DEAD ${d}`);
    console.log(`REWRITTEN fixed=${result.fixed.length} dead=${result.dead.length}`);
    if (result.dead.length > 0) {
      console.error(`${result.dead.length} link(s) stay relative: their file is missing at ${args.sha}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`Cannot rewrite links: ${(err as Error).message}`);
    process.exit(1);
  }
}

if (import.meta.filename === process.argv[1]) {
  main();
}
