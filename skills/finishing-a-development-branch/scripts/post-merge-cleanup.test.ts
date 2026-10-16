import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { cleanup } from "./post-merge-cleanup.ts";

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
    it("stops and lists real untracked files; pins are already gone, branch stays", () => {
      mkdirSync(join(worktree, ".impeccable"));
      writeFileSync(join(worktree, ".impeccable", "config.json"), "{}");
      writeFileSync(join(worktree, "notes.txt"), "mine");
      const r = cleanup({ repo, branch: BRANCH, worktree });
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/notes\.txt/);
      expect(r.message).not.toMatch(/\.impeccable\/config\.json/);
      expect(existsSync(worktree)).toBe(true);
      expect(branches()).not.toBe("");
    });
    it("stops on a tracked change", () => {
      writeFileSync(join(worktree, "b.txt"), "changed");
      const r = cleanup({ repo, branch: BRANCH, worktree });
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/b\.txt/);
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
});
