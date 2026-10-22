import { mkdirSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Git } from "../autonomous/gitx.ts";
import { TICKET_KEY } from "../ticket-key.ts";
import { notSalvagedMessage, secretHits, type SecretHit } from "./secrets.ts";

export interface SalvageDeps { git: Git; repo: string; depotDir: string; now: () => Date; statSize: (path: string) => number }
export type SalvageResult = { ok: true; steps: string[]; bundle: string | null; pushed: string | null } | { ok: false; steps: string[]; message: string };

const utcStamp = (d: Date): string => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
// Untracked paths under these prefixes are tool caches. Same list as KNOWN_CACHES in skills/finishing-a-development-branch/scripts/post-merge-cleanup.ts (cannot be imported from here).
const KNOWN_CACHES = [".impeccable/"];
const skipCaches = KNOWN_CACHES.map((c) => `:(exclude)${c}`);
const real = (p: string): string => { try { return realpathSync(p); } catch { return p; } };
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e)).split("\n")[0];

export function salvage(d: SalvageDeps, a: { ticket: string; worktree?: string; dryRun?: boolean }): SalvageResult {
  const steps: string[] = [];
  const stamp = utcStamp(d.now()); // one stamp for the bundle and a dated rescue name
  const fail = (message: string): SalvageResult => ({ ok: false, steps, message });
  const act = (label: string, run: () => void): void => {
    steps.push(a.dryRun ? `would ${label}` : label);
    if (!a.dryRun) run();
  };
  try {
    if (!TICKET_KEY.test(a.ticket)) return fail(`"${a.ticket}" is not a ticket key`);
    // 1. the worktree and the branch
    const listing = d.git(d.repo, ["worktree", "list", "--porcelain"]).split("\n\n").map((b) => {
      const path = /^worktree (.+)$/m.exec(b)?.[1];
      const branch = /^branch refs\/heads\/(.+)$/m.exec(b)?.[1];
      return path && branch ? { path, branch } : null;
    }).filter((x): x is { path: string; branch: string } => x !== null);
    const prefix = `${a.ticket}__`;
    const found = a.worktree === undefined ? listing.filter((w) => w.branch.startsWith(prefix)) : listing.filter((w) => real(w.path) === real(a.worktree as string));
    if (found.length !== 1) return fail(`expected one worktree for ${a.ticket}, found ${found.length}`);
    const { path: wt, branch } = found[0];

    // 2. is salvage needed
    const status = d.git(wt, ["status", "--porcelain", "-z", "--untracked-files=all", "--", ".", ...skipCaches]);
    const dirty = status.split("\0").filter(Boolean).length > 0;
    const merged = d.git(d.repo, ["branch", "--merged", "main", "--format=%(refname:short)"]).split("\n").includes(branch);
    if (!dirty && merged) return { ok: true, steps: ["nothing to salvage"], bundle: null, pushed: null };

    const cacheFiles = d.git(wt, ["ls-files", "--others", "--exclude-standard", "-z", "--", ...KNOWN_CACHES]).split("\0").filter(Boolean);
    const skippedCaches = KNOWN_CACHES.filter((c) => cacheFiles.some((f) => f.startsWith(c)));

    // 3a. the push sends every commit in main..branch: check each commit, not the net diff
    const committedHits: SecretHit[] = [];
    const seenHit = new Set<string>();
    for (const sha of d.git(wt, ["rev-list", `main..${branch}`]).split("\n").filter(Boolean)) {
      // added, copied, modified, renamed only: deletes never reach cat-file
      const toks = d.git(wt, ["diff-tree", "--root", "-r", "-c", "--no-commit-id", "--name-status", "--diff-filter=ACMR", "-z", sha]).split("\0").filter(Boolean);
      const paths: string[] = [];
      for (let i = 0; i + 1 < toks.length; i += 2) paths.push(toks[i + 1]);
      for (const p of paths) {
        let size: number;
        try { size = Number(d.git(wt, ["cat-file", "-s", `${sha}:${p}`]).trim()); } catch { return fail(`not salvaged: cannot check ${p}`); }
        if (!Number.isFinite(size)) return fail(`not salvaged: cannot check ${p}`);
        for (const h of secretHits([{ path: p, size }])) {
          if (!seenHit.has(h.path)) { seenHit.add(h.path); committedHits.push(h); }
        }
      }
    }
    if (committedHits.length > 0) return fail(notSalvagedMessage(committedHits));

    // 3b. secret check before any commit
    if (dirty) {
      const untracked = d.git(wt, ["ls-files", "--others", "--exclude-standard", "-z", "--", ".", ...skipCaches]).split("\0").filter(Boolean);
      const changed = d.git(wt, ["diff", "--name-only", "--diff-filter=ACMR", "-z", "HEAD"]).split("\0").filter(Boolean);
      const names = [...new Set([...untracked, ...changed])];
      const hits = secretHits(names.map((p) => ({ path: p, size: d.statSize(join(wt, p)) })));
      if (hits.length > 0) return fail(notSalvagedMessage(hits));
      // 4. WIP commit
      if (skippedCaches.length > 0) steps.push(`skip known caches: ${skippedCaches.join(", ")}`);
      act("make the WIP commit", () => {
        d.git(wt, ["add", "-A", "--", ".", ...skipCaches]);
        d.git(wt, ["commit", "--no-verify", "-m", `wip(${a.ticket.toLowerCase()}): salvage before teardown`]);
      });
    }

    // 5. bundle, then verify
    const dir = join(d.depotDir, "salvage");
    const bundle = join(dir, `${a.ticket}-${stamp}.bundle`);
    act(`write ${bundle}`, () => {
      mkdirSync(dir, { recursive: true });
      d.git(wt, ["bundle", "create", bundle, branch]);
      d.git(wt, ["bundle", "verify", bundle]);
    });

    // 6. push
    // A diverged rescue/<KEY> (git: "! [rejected] ... non-fast-forward") gets a dated name instead. Never --force.
    let pushed = `rescue/${a.ticket}`;
    act(`push ${branch} to ${pushed}`, () => {
      try {
        d.git(wt, ["push", "origin", `${branch}:refs/heads/${pushed}`]);
      } catch (e) {
        const text = e instanceof Error ? e.message : String(e);
        if (!/! \[rejected\]/.test(text)) throw e;
        const dated = `rescue/${a.ticket}-${stamp}`;
        steps.push(`${pushed} exists and has diverged; push ${branch} to ${dated} instead`);
        pushed = dated;
        d.git(wt, ["push", "origin", `${branch}:refs/heads/${pushed}`]);
      }
    });
    return { ok: true, steps, bundle, pushed: a.dryRun ? null : pushed };
  } catch (e) {
    return fail(`salvage failed (${steps[steps.length - 1] ?? "start"}): ${msg(e)}`);
  }
}

/**
 * The main checkout: the parent of a `.git` common dir. A bare repo is an error. For a separate git dir there is no pointer
 * back to the main checkout: from the main checkout itself use its top level; from a linked worktree use the git dir,
 * which is what git lists as the main worktree and where the worktree and branch commands work.
 */
export function resolveRepo(git: Git, cwd: string): string {
  const common = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim();
  if (basename(common) === ".git") return dirname(common);
  const bare = git(common, ["rev-parse", "--is-bare-repository"]).trim() === "true";
  if (bare) throw new Error("dg salvage needs a main checkout, not a bare repo; pass --repo");
  const gitDir = git(cwd, ["rev-parse", "--path-format=absolute", "--git-dir"]).trim();
  if (gitDir === common) return git(cwd, ["rev-parse", "--show-toplevel"]).trim();
  return common;
}
