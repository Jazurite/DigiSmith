import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Git } from "../autonomous/gitx.ts";
import { notSalvagedMessage, secretHits } from "./secrets.ts";

export interface SalvageDeps { git: Git; repo: string; depotDir: string; now: () => Date; statSize: (path: string) => number }
export type SalvageResult = { ok: true; steps: string[]; bundle: string | null } | { ok: false; steps: string[]; message: string };

const utcStamp = (d: Date): string => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e)).split("\n")[0];

export function salvage(d: SalvageDeps, a: { ticket: string; worktree?: string; dryRun?: boolean }): SalvageResult {
  const steps: string[] = [];
  const fail = (message: string): SalvageResult => ({ ok: false, steps, message });
  const act = (label: string, run: () => void): void => {
    steps.push(a.dryRun ? `would ${label}` : label);
    if (!a.dryRun) run();
  };
  try {
    // 1. the worktree and the branch
    const listing = d.git(d.repo, ["worktree", "list", "--porcelain"]).split("\n\n").map((b) => {
      const path = /^worktree (.+)$/m.exec(b)?.[1];
      const branch = /^branch refs\/heads\/(.+)$/m.exec(b)?.[1];
      return path && branch ? { path, branch } : null;
    }).filter((x): x is { path: string; branch: string } => x !== null);
    const prefix = `${a.ticket}__`;
    const found = a.worktree === undefined ? listing.filter((w) => w.branch.startsWith(prefix)) : listing.filter((w) => w.path === a.worktree);
    if (found.length !== 1) return fail(`expected one worktree for ${a.ticket}, found ${found.length}`);
    const { path: wt, branch } = found[0];

    // 2. is salvage needed
    const status = d.git(wt, ["status", "--porcelain", "-z", "--untracked-files=all"]);
    const dirty = status.split("\0").filter(Boolean).length > 0;
    const merged = d.git(d.repo, ["branch", "--merged", "main", "--format=%(refname:short)"]).split("\n").includes(branch);
    if (!dirty && merged) return { ok: true, steps: ["nothing to salvage"], bundle: null };

    // 3a. the push sends every commit on the branch: check the files those commits add or change
    const toks = d.git(wt, ["diff", "--name-status", "--diff-filter=ACMR", "-z", `main...${branch}`]).split("\0").filter(Boolean);
    const committed: string[] = [];
    for (let i = 0; i < toks.length;) {
      const copyOrRename = /^[RC]/.test(toks[i]);
      committed.push(toks[i + (copyOrRename ? 2 : 1)]);
      i += copyOrRename ? 3 : 2;
    }
    const sizeOf = (p: string): number => {
      const f = join(wt, p);
      return existsSync(f) ? d.statSize(f) : Number(d.git(wt, ["cat-file", "-s", `${branch}:${p}`]).trim());
    };
    const committedHits = secretHits([...new Set(committed)].map((p) => ({ path: p, size: sizeOf(p) })));
    if (committedHits.length > 0) return fail(notSalvagedMessage(committedHits));

    // 3b. secret check before any commit
    if (dirty) {
      const untracked = d.git(wt, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
      const changed = d.git(wt, ["diff", "--name-only", "--diff-filter=ACMR", "-z", "HEAD"]).split("\0").filter(Boolean);
      const names = [...new Set([...untracked, ...changed])];
      const hits = secretHits(names.map((p) => ({ path: p, size: d.statSize(join(wt, p)) })));
      if (hits.length > 0) return fail(notSalvagedMessage(hits));
      // 4. WIP commit
      act("make the WIP commit", () => {
        d.git(wt, ["add", "-A"]);
        d.git(wt, ["commit", "--no-verify", "-m", `wip(${a.ticket.toLowerCase()}): salvage before teardown`]);
      });
    }

    // 5. bundle, then verify
    const dir = join(d.depotDir, "salvage");
    const bundle = join(dir, `${a.ticket}-${utcStamp(d.now())}.bundle`);
    act(`write ${bundle}`, () => {
      mkdirSync(dir, { recursive: true });
      d.git(wt, ["bundle", "create", bundle, branch]);
      d.git(wt, ["bundle", "verify", bundle]);
    });

    // 6. push
    act(`push ${branch} to rescue/${a.ticket}`, () => {
      d.git(wt, ["push", "origin", `${branch}:refs/heads/rescue/${a.ticket}`]);
    });
    return { ok: true, steps, bundle };
  } catch (e) {
    return fail(`salvage failed (${steps[steps.length - 1] ?? "start"}): ${msg(e)}`);
  }
}

/** The main checkout: the parent of a `.git` common dir; for a separate git dir or a bare repo, the top level. */
export function resolveRepo(git: Git, cwd: string): string {
  const common = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim();
  if (basename(common) === ".git") return dirname(common);
  return git(cwd, ["rev-parse", "--show-toplevel"]).trim();
}
