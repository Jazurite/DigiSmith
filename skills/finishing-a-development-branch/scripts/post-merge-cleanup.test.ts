import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, defaultSalvage } from "./post-merge-cleanup.ts";

type Salvage = (a: { ticket: string; worktree: string }) => { ok: boolean; message: string };
const failing: Salvage = () => ({ ok: false, message: "not salvaged: test" });
// Stands in for dg salvage: commits everything in the worktree like the real WIP commit.
const committing = (calls: { ticket: string; worktree: string }[]): Salvage => (a) => {
  calls.push(a);
  git(a.worktree, "add", "-A");
  git(a.worktree, "commit", "-qm", "wip");
  return { ok: true, message: "salvaged" };
};

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

const BRANCH = "DGS-1__demo";
let repo: string;
let worktree: string;

function setup(merge: boolean) {
  repo = realpathSync(mkdtempSync(join(tmpdir(), "pmc-")));
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "t@t");
  git(repo, "config", "user.name", "t");
  writeFileSync(join(repo, "a.txt"), "a");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "init");
  worktree = join(repo, ".worktrees", "w");
  git(repo, "worktree", "add", "-q", worktree, "-b", BRANCH);
  writeFileSync(join(worktree, "b.txt"), "b");
  git(worktree, "add", ".");
  git(worktree, "commit", "-qm", "work");
  if (merge) {
    const pre = git(repo, "rev-parse", "HEAD");
    git(repo, "merge", "-q", BRANCH);
    git(repo, "update-ref", `refs/digismith/post-finish/${BRANCH}/base`, pre);
    git(repo, "update-ref", `refs/digismith/post-finish/${BRANCH}/head`, "HEAD");
  }
}
const pins = () => git(repo, "for-each-ref", `refs/digismith/post-finish/${BRANCH}/`);
const branches = () => git(repo, "branch", "--list", BRANCH);

describe("cleanup", () => {
  describe("unmerged branch", () => {
    beforeEach(() => setup(false));
    it("stops and changes nothing", () => {
      const r = cleanup({ repo, branch: BRANCH, worktree });
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/not merged/);
      expect(existsSync(worktree)).toBe(true);
      expect(branches()).not.toBe("");
    });
  });

  describe("merged branch", () => {
    beforeEach(() => setup(true));
    it("removes pins, worktree and branch", () => {
      const r = cleanup({ repo, branch: BRANCH, worktree });
      expect(r.ok).toBe(true);
      expect(pins()).toBe("");
      expect(existsSync(worktree)).toBe(false);
      expect(branches()).toBe("");
    });
    it("removes a worktree that holds only known caches", () => {
      mkdirSync(join(worktree, ".impeccable"));
      writeFileSync(join(worktree, ".impeccable", "config.json"), "{}");
      const r = cleanup({ repo, branch: BRANCH, worktree });
      expect(r.ok).toBe(true);
      expect(existsSync(worktree)).toBe(false);
      expect(branches()).toBe("");
    });
    it("stops when salvage fails on real untracked files; pins are already gone, nothing removed", () => {
      mkdirSync(join(worktree, ".impeccable"));
      writeFileSync(join(worktree, ".impeccable", "config.json"), "{}");
      writeFileSync(join(worktree, "notes.md"), "mine");
      const r = cleanup({ repo, branch: BRANCH, worktree, salvage: () => ({ ok: false, message: "not salvaged: .env" }) });
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/^salvage failed, nothing removed/);
      expect(r.message).toMatch(/not salvaged: \.env/);
      expect(existsSync(worktree)).toBe(true);
      expect(branches()).not.toBe("");
    });
    it("stops on a tracked change when salvage fails", () => {
      writeFileSync(join(worktree, "b.txt"), "changed");
      const r = cleanup({ repo, branch: BRANCH, worktree, salvage: failing });
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/^salvage failed, nothing removed/);
      expect(existsSync(worktree)).toBe(true);
    });
    it("salvages a dirty tree, removes the worktree and keeps the branch with the rescue message", () => {
      writeFileSync(join(worktree, "notes.md"), "mine");
      const calls: { ticket: string; worktree: string }[] = [];
      const r = cleanup({ repo, branch: BRANCH, worktree, salvage: committing(calls) });
      expect(calls).toEqual([{ ticket: "DGS-1", worktree }]);
      expect(existsSync(worktree)).toBe(false);
      expect(branches()).not.toBe("");
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/^rescue\/DGS-1 holds the work; branch kept: /);
    });
    it("does not call salvage on a clean worktree", () => {
      const calls: { ticket: string; worktree: string }[] = [];
      const r = cleanup({ repo, branch: BRANCH, worktree, salvage: (a) => (calls.push(a), { ok: true, message: "" }) });
      expect(r.ok).toBe(true);
      expect(calls).toEqual([]);
    });
    it("does not call salvage on a caches-only worktree", () => {
      mkdirSync(join(worktree, ".impeccable"));
      writeFileSync(join(worktree, ".impeccable", "config.json"), "{}");
      const calls: { ticket: string; worktree: string }[] = [];
      const r = cleanup({ repo, branch: BRANCH, worktree, salvage: (a) => (calls.push(a), { ok: true, message: "" }) });
      expect(r.ok).toBe(true);
      expect(calls).toEqual([]);
    });
    it("on --dry-run with a dirty tree does not call salvage and lists would salvage", () => {
      writeFileSync(join(worktree, "notes.md"), "mine");
      const calls: { ticket: string; worktree: string }[] = [];
      const r = cleanup({ repo, branch: BRANCH, worktree, dryRun: true, salvage: (a) => (calls.push(a), { ok: true, message: "" }) });
      expect(r.ok).toBe(true);
      expect(calls).toEqual([]);
      expect(r.steps.some((x) => x.startsWith("would salvage"))).toBe(true);
      expect(existsSync(worktree)).toBe(true);
    });
    it("treats cache files with spaces and non-ASCII names as caches", () => {
      mkdirSync(join(worktree, ".impeccable"));
      writeFileSync(join(worktree, ".impeccable", "a b.json"), "{}");
      writeFileSync(join(worktree, ".impeccable", "é file.json"), "{}");
      expect(cleanup({ repo, branch: BRANCH, worktree }).ok).toBe(true);
      expect(existsSync(worktree)).toBe(false);
    });
    it("is a clean no-op when run twice", () => {
      expect(cleanup({ repo, branch: BRANCH, worktree }).ok).toBe(true);
      const r = cleanup({ repo, branch: BRANCH, worktree });
      expect(r.ok).toBe(true);
      expect(r.message).toMatch(/already cleaned/);
    });
    it("checks the merge against --base", () => {
      git(repo, "branch", "other", "main~1");
      const r = cleanup({ repo, branch: BRANCH, worktree, base: "other" });
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/not merged into other/);
    });
    it("accepts missing pins", () => {
      git(repo, "update-ref", "-d", `refs/digismith/post-finish/${BRANCH}/base`);
      git(repo, "update-ref", "-d", `refs/digismith/post-finish/${BRANCH}/head`);
      expect(cleanup({ repo, branch: BRANCH, worktree }).ok).toBe(true);
    });
    it("changes nothing on --dry-run", () => {
      const r = cleanup({ repo, branch: BRANCH, worktree, dryRun: true });
      expect(r.ok).toBe(true);
      expect(r.steps.length).toBeGreaterThan(0);
      expect(pins()).not.toBe("");
      expect(existsSync(worktree)).toBe(true);
      expect(branches()).not.toBe("");
    });
    it("re-runs after the worktree is already gone", () => {
      git(repo, "worktree", "remove", worktree);
      const r = cleanup({ repo, branch: BRANCH, worktree });
      expect(r.ok).toBe(true);
      expect(branches()).toBe("");
    });
  });

  describe("worktree removal and salvage guards", () => {
    beforeEach(() => setup(true));
    it("stops with the rescue branch and bundle when removal fails after an ok salvage", () => {
      writeFileSync(join(worktree, "notes.md"), "mine");
      const salvage: Salvage = (a) => {
        committing([])(a);
        git(repo, "worktree", "lock", a.worktree);
        return { ok: true, message: "salvaged: /depot/bundle-1" };
      };
      const r = cleanup({ repo, branch: BRANCH, worktree, salvage });
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/removal failed after salvage/);
      expect(r.message).toMatch(/rescue\/DGS-1/);
      expect(r.message).toMatch(/bundle \/depot\/bundle-1/);
      expect(r.message).toMatch(/nothing more was removed/);
      expect(existsSync(worktree)).toBe(true);
      expect(branches()).not.toBe("");
    });
    it("stops when salvage says ok but the tree is still dirty", () => {
      writeFileSync(join(worktree, "notes.md"), "mine");
      const r = cleanup({ repo, branch: BRANCH, worktree, salvage: () => ({ ok: true, message: "salvaged" }) });
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/^salvage reported ok but the tree is still dirty; nothing removed/);
      expect(existsSync(join(worktree, "notes.md"))).toBe(true);
      expect(branches()).not.toBe("");
    });
  });

  describe("defaultSalvage", () => {
    const a = { ticket: "DGS-1", worktree: "/w" };
    it("dg missing gives ok:false with a message", () => {
      const r = defaultSalvage(a, () => { throw Object.assign(new Error("spawnSync dg ENOENT"), { code: "ENOENT" }); });
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/ENOENT/);
    });
    it("non-zero exit gives ok:false with the first stderr line", () => {
      const r = defaultSalvage(a, () => { throw Object.assign(new Error("failed"), { stderr: "not salvaged: .env\nmore\n" }); });
      expect(r).toEqual({ ok: false, message: "not salvaged: .env" });
    });
    it("zero exit gives ok:true and passes the bundle line through", () => {
      let seen: string[] = [];
      const r = defaultSalvage(a, (cmd, args) => { seen = [cmd, ...args]; return "x\nsalvaged: /depot/b\n"; });
      expect(r).toEqual({ ok: true, message: "salvaged: /depot/b" });
      expect(seen).toEqual(["dg", "salvage", "--ticket", "DGS-1", "--worktree", "/w"]);
      expect(defaultSalvage(a, () => "").message).toBe("salvaged");
    });
  });

  describe("a key with a digit in its prefix", () => {
    it("is taken from the branch and passed to salvage", () => {
      setup(true);
      git(repo, "worktree", "remove", worktree);
      git(repo, "branch", "-m", BRANCH, "AB2-5__x");
      git(repo, "worktree", "add", "-q", worktree, "AB2-5__x");
      writeFileSync(join(worktree, "notes.md"), "mine");
      let seen = "";
      const r = cleanup({ repo, branch: "AB2-5__x", worktree, salvage: (x) => { seen = x.ticket; return { ok: false, message: "stop here" }; } });
      expect(seen).toBe("AB2-5");
      expect(r.message).toBe("salvage failed, nothing removed: stop here");
    });
  });

  describe("branch without a ticket key", () => {
    it("stops when the worktree needs salvage", () => {
      setup(true);
      git(repo, "worktree", "remove", worktree);
      git(repo, "branch", "-m", BRANCH, "plain");
      git(repo, "worktree", "add", "-q", worktree, "plain");
      writeFileSync(join(worktree, "notes.md"), "mine");
      const r = cleanup({ repo, branch: "plain", worktree, salvage: failing });
      expect(r.ok).toBe(false);
      expect(r.message).toBe("no ticket key in branch plain; cannot salvage; nothing was changed");
      expect(existsSync(worktree)).toBe(true);
    });
  });
});
