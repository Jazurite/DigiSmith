import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { blockerProblem, mergedOnMain, scopeOf } from "./already-done.ts";
import { realGit } from "./gitx.ts";

let root: string;
let origin: string;
let repo: string;
let n = 0;

const g = (cwd: string, ...args: string[]): string => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const commit = (subject: string, body = ""): void => {
  writeFileSync(join(repo, "f.txt"), `${++n}\n`);
  g(repo, "add", "-A");
  g(repo, "commit", "-q", "-m", subject, ...(body ? ["-m", body] : []));
};
const pushMain = (): void => { g(repo, "push", "-q", "origin", "main"); g(repo, "fetch", "-q", "origin"); };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "already-done-"));
  origin = join(root, "origin.git");
  repo = join(root, "clone");
  g(root, "init", "-q", "--bare", "-b", "main", origin);
  g(root, "clone", "-q", origin, repo);
  g(repo, "config", "user.email", "t@example.com");
  g(repo, "config", "user.name", "T");
  g(repo, "checkout", "-q", "-b", "main");
  commit("init");
  pushMain();
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("scopeOf", () => {
  it("splits scopes and ignores non-scope text", () => {
    expect(scopeOf("feat(DGS-1, dgs-2/dgs-3): x")).toEqual(["dgs-1", "dgs-2", "dgs-3"]);
    expect(scopeOf("merge DGS-7 stuff")).toEqual([]);
    expect(scopeOf("chore(x): see (dgs-7)")).toEqual(["x"]);
  });
});

describe("mergedOnMain", () => {
  it("counts a main commit whose scope names the key, any case", () => {
    commit("feat(dgs-7): x");
    pushMain();
    expect(mergedOnMain(realGit, repo, "DGS-7")).toMatch(/^[0-9a-f]+$/);
  });
  it("counts an upper-case scope", () => {
    commit("fix(DGS-7): y");
    pushMain();
    expect(mergedOnMain(realGit, repo, "DGS-7")).not.toBeNull();
  });
  it("does not count a key in the body, an unscoped subject or a later paren", () => {
    commit("feat(other): x", "Refs DGS-7 and dgs-7");
    commit("merge DGS-7 stuff");
    commit("chore(x): see (dgs-7)");
    pushMain();
    expect(mergedOnMain(realGit, repo, "DGS-7")).toBeNull();
  });
  it("does not match a longer scope", () => {
    commit("feat(dgs-70): x");
    pushMain();
    expect(mergedOnMain(realGit, repo, "DGS-7")).toBeNull();
  });
  const keyedBranch = (name: string, subject: string): void => {
    g(repo, "checkout", "-q", "-b", name);
    commit(subject);
    g(repo, "push", "-q", "origin", name);
    g(repo, "checkout", "-q", "main");
  };
  it("counts a merged <KEY>__* branch whose commits name the key (merge subject has no key)", () => {
    keyedBranch("DGS-7__a", "wip(dgs-7): stuff");
    g(repo, "merge", "-q", "--no-ff", "-m", "merge the thing", "DGS-7__a");
    pushMain();
    expect(mergedOnMain(realGit, repo, "DGS-7", [])).toMatch(/^branch /);
  });
  it("counts a fast-forward-merged branch with key-scoped commits (log without rule a hit)", () => {
    keyedBranch("DGS-7__ff", "wip(dgs-7): stuff");
    g(repo, "merge", "-q", "--ff-only", "DGS-7__ff");
    pushMain();
    // rule (a) already matches the commit subject; prove rule (b) on its own with a log that has no hit
    expect(mergedOnMain(realGit, repo, "DGS-7", [])).toBe("branch DGS-7__ff");
  });
  it("counts a merged local-only branch", () => {
    g(repo, "checkout", "-q", "-b", "DGS-7__loc");
    commit("wip(dgs-7): stuff");
    g(repo, "checkout", "-q", "main");
    g(repo, "merge", "-q", "--no-ff", "-m", "merge the thing", "DGS-7__loc");
    pushMain();
    expect(mergedOnMain(realGit, repo, "DGS-7", [])).toBe("branch DGS-7__loc");
  });
  it("does not count a merged branch whose commits do not name the key in scope", () => {
    keyedBranch("DGS-7__a", "wip stuff for DGS-7");
    g(repo, "merge", "-q", "--no-ff", "-m", "merge the thing", "DGS-7__a");
    pushMain();
    expect(mergedOnMain(realGit, repo, "DGS-7")).toBeNull();
  });
  it("does not count an empty branch at the main tip", () => {
    g(repo, "branch", "DGS-7__empty");
    g(repo, "push", "-q", "origin", "DGS-7__empty");
    expect(mergedOnMain(realGit, repo, "DGS-7")).toBeNull();
  });
  it("does not count an unmerged branch", () => {
    g(repo, "checkout", "-q", "-b", "DGS-7__a");
    commit("wip stuff");
    g(repo, "push", "-q", "origin", "DGS-7__a");
    g(repo, "checkout", "-q", "main");
    expect(mergedOnMain(realGit, repo, "DGS-7")).toBeNull();
  });
});

describe("blockerProblem", () => {
  it("blocks on an unmerged local branch", () => {
    g(repo, "checkout", "-q", "-b", "DGS-7__a");
    commit("wip stuff");
    g(repo, "checkout", "-q", "main");
    expect(blockerProblem(realGit, repo, "DGS-7")).toBe("blocker-not-on-main: DGS-7");
  });
  it("blocks on an origin/ branch only", () => {
    g(repo, "checkout", "-q", "-b", "DGS-7__a");
    commit("wip stuff");
    g(repo, "push", "-q", "origin", "DGS-7__a");
    g(repo, "checkout", "-q", "main");
    g(repo, "branch", "-q", "-D", "DGS-7__a");
    expect(blockerProblem(realGit, repo, "DGS-7")).toBe("blocker-not-on-main: DGS-7");
  });
  it("blocks on a rescue branch alone", () => {
    g(repo, "checkout", "-q", "-b", "tmp");
    commit("wip stuff");
    g(repo, "push", "-q", "origin", "tmp:refs/heads/rescue/DGS-7");
    g(repo, "checkout", "-q", "main");
    g(repo, "branch", "-q", "-D", "tmp");
    g(repo, "fetch", "-q", "origin");
    expect(blockerProblem(realGit, repo, "DGS-7")).toBe("blocker-not-on-main: DGS-7");
  });
  it("passes on an empty branch at the main tip (pure ancestry)", () => {
    g(repo, "branch", "DGS-7__empty");
    expect(blockerProblem(realGit, repo, "DGS-7")).toBeNull();
  });
  it("passes when the branch merged with unscoped subjects", () => {
    g(repo, "checkout", "-q", "-b", "DGS-7__a");
    commit("wip stuff");
    g(repo, "checkout", "-q", "main");
    g(repo, "merge", "-q", "--no-ff", "-m", "merge the thing", "DGS-7__a");
    pushMain();
    expect(blockerProblem(realGit, repo, "DGS-7")).toBeNull();
  });
  it("passes when the branch is merged", () => {
    g(repo, "checkout", "-q", "-b", "DGS-7__a");
    commit("wip(dgs-7): stuff");
    g(repo, "checkout", "-q", "main");
    g(repo, "merge", "-q", "--no-ff", "-m", "merge the thing", "DGS-7__a");
    pushMain();
    expect(blockerProblem(realGit, repo, "DGS-7")).toBeNull();
  });
  it("an unmerged origin/rescue/KEY blocks even when a stale KEY__ branch is an ancestor", () => {
    g(repo, "branch", "DGS-7__a");
    g(repo, "checkout", "-q", "-b", "tmp");
    commit("wip stuff");
    g(repo, "push", "-q", "origin", "tmp:refs/heads/rescue/DGS-7");
    g(repo, "checkout", "-q", "main");
    g(repo, "branch", "-q", "-D", "tmp");
    g(repo, "fetch", "-q", "origin");
    expect(blockerProblem(realGit, repo, "DGS-7")).toBe("blocker-not-on-main: DGS-7");
  });
  it("a dated rescue branch alone blocks, local or origin", () => {
    g(repo, "checkout", "-q", "-b", "tmp");
    commit("wip stuff");
    g(repo, "push", "-q", "origin", "tmp:refs/heads/rescue/DGS-7-20261022T030405Z");
    g(repo, "checkout", "-q", "main");
    g(repo, "branch", "-q", "-D", "tmp");
    g(repo, "fetch", "-q", "origin");
    expect(blockerProblem(realGit, repo, "DGS-7")).toBe("blocker-not-on-main: DGS-7");
    g(repo, "branch", "rescue/DGS-8-20261022T030405Z", "origin/rescue/DGS-7-20261022T030405Z");
    expect(blockerProblem(realGit, repo, "DGS-8")).toBe("blocker-not-on-main: DGS-8");
  });
  it("a rescue branch that is an ancestor of origin/main does not block by itself", () => {
    g(repo, "branch", "rescue/DGS-7");
    expect(blockerProblem(realGit, repo, "DGS-7")).toBeNull();
  });
  it("a rescue branch of DGS-70 does not affect DGS-7", () => {
    g(repo, "checkout", "-q", "-b", "tmp");
    commit("wip stuff");
    g(repo, "branch", "rescue/DGS-70");
    g(repo, "checkout", "-q", "main");
    expect(blockerProblem(realGit, repo, "DGS-7")).toBeNull();
  });
  it("passes with no branch at all", () => {
    expect(blockerProblem(realGit, repo, "DGS-7")).toBeNull();
  });
});
