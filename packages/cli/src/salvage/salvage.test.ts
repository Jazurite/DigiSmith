import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realGit } from "../autonomous/gitx.ts";
import { resolveRepo, salvage, type SalvageDeps } from "./salvage.ts";

const sh = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
let root: string, origin: string, repo: string, wt: string, depot: string;
const mk = (over: Partial<SalvageDeps> = {}): SalvageDeps => ({
  git: realGit, repo, depotDir: depot, now: () => new Date("2026-10-22T03:04:05Z"),
  statSize: (p) => statSync(p).size, ...over,
});
const bundles = () => (existsSync(join(depot, "salvage")) ? readdirSync(join(depot, "salvage")) : []);
const rescue = () => sh(origin, "branch", "--list", "rescue/*");

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "salvage-"));
  origin = join(root, "origin.git"); repo = join(root, "repo"); wt = join(root, "wt"); depot = join(root, "depot");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  for (const [k, v] of [["user.email", "t@t"], ["user.name", "t"]]) sh(repo, "config", k, v);
  writeFileSync(join(repo, "a.txt"), "a\n"); sh(repo, "add", "."); sh(repo, "commit", "-qm", "init");
  sh(repo, "remote", "add", "origin", origin); sh(repo, "push", "-q", "origin", "main");
  sh(repo, "worktree", "add", "-q", "-b", "DGS-9__x", wt, "main");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("salvage", () => {
  it("clean and merged: nothing to salvage, no bundle", () => {
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(r).toMatchObject({ ok: true, bundle: null });
    expect(bundles()).toEqual([]);
  });
  it("dirty tree: WIP commit, verified bundle, rescue branch on origin", () => {
    writeFileSync(join(wt, "new.ts"), "x\n");
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(r.ok).toBe(true);
    expect(sh(wt, "log", "-1", "--format=%s")).toBe("wip(dgs-9): salvage before teardown");
    expect(bundles()).toEqual(["DGS-9-20261022T030405Z.bundle"]);
    sh(repo, "bundle", "verify", join(depot, "salvage", bundles()[0]));
    expect(rescue()).toContain("rescue/DGS-9");
  });
  it("clean but unmerged: no WIP commit, bundle and push still happen", () => {
    writeFileSync(join(wt, "n.ts"), "x\n"); sh(wt, "add", "."); sh(wt, "commit", "-qm", "feat: n");
    const before = sh(wt, "rev-parse", "HEAD");
    expect(salvage(mk(), { ticket: "DGS-9" }).ok).toBe(true);
    expect(sh(wt, "rev-parse", "HEAD")).toBe(before);
    expect(rescue()).toContain("rescue/DGS-9");
  });
  it.each([".env", "cert.pem", "id.key", "my-secret.txt", "api-token.json"])("a secret file %s stops everything", (name) => {
    writeFileSync(join(wt, name), "s\n");
    const before = sh(wt, "rev-parse", "HEAD");
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.message).toMatch(new RegExp(`^not salvaged: ${name.replace(/\./g, "\\.")} \\(matches .+\\); Jack decides$`));
    expect(sh(wt, "rev-parse", "HEAD")).toBe(before);
    expect(bundles()).toEqual([]);
    expect(rescue()).toBe("");
  });
  it("a committed design-token stylesheet and a dirty board tokens.json do not stop salvage", () => {
    writeFileSync(join(wt, "nightwatch-tokens.scss"), "a{}\n"); sh(wt, "add", "."); sh(wt, "commit", "-qm", "feat: tokens");
    mkdirSync(join(wt, ".digismith", "board", "DGS-9\u2014x"), { recursive: true });
    writeFileSync(join(wt, ".digismith", "board", "DGS-9\u2014x", "tokens.json"), "{}\n");
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(r.ok).toBe(true);
    expect(rescue()).toContain("rescue/DGS-9");
  });
  it("a committed api-token.txt stops everything, even when a later commit removes it", () => {
    writeFileSync(join(wt, "api-token.txt"), "s\n"); sh(wt, "add", "."); sh(wt, "commit", "-qm", "feat: add");
    sh(wt, "rm", "-q", "api-token.txt"); sh(wt, "commit", "-qm", "feat: remove");
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(!r.ok && r.message).toBe("not salvaged: api-token.txt (matches *token*); Jack decides");
    expect(bundles()).toEqual([]);
    expect(rescue()).toBe("");
  });
  it("a committed token yaml salvages, a committed secret yaml stops everything", () => {
    writeFileSync(join(wt, "token-config.yaml"), "a: 1\n"); sh(wt, "add", "."); sh(wt, "commit", "-qm", "feat: token yaml");
    expect(salvage(mk(), { ticket: "DGS-9" }).ok).toBe(true);
    mkdirSync(join(wt, "k8s")); writeFileSync(join(wt, "k8s", "db-secret.yaml"), "a: 1\n"); sh(wt, "add", "."); sh(wt, "commit", "-qm", "feat: secret yaml");
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(!r.ok && r.message).toBe("not salvaged: k8s/db-secret.yaml (matches *secret*); Jack decides");
  });
  it("a staged new .env stops everything", () => {
    writeFileSync(join(wt, ".env"), "s\n"); sh(wt, "add", ".env");
    const before = sh(wt, "rev-parse", "HEAD");
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(!r.ok && r.message).toBe("not salvaged: .env (matches .env*); Jack decides");
    expect(sh(wt, "rev-parse", "HEAD")).toBe(before);
    expect(bundles()).toEqual([]);
    expect(rescue()).toBe("");
  });
  it("a modified tracked file with a secret name stops everything", () => {
    writeFileSync(join(repo, "api-token.json"), "{}\n"); sh(repo, "add", "."); sh(repo, "commit", "-qm", "add token file");
    sh(wt, "merge", "-q", "main");
    writeFileSync(join(wt, "api-token.json"), "{\"a\":1}\n");
    const before = sh(wt, "rev-parse", "HEAD");
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(!r.ok && r.message).toBe("not salvaged: api-token.json (matches *token*); Jack decides");
    expect(sh(wt, "rev-parse", "HEAD")).toBe(before);
    expect(bundles()).toEqual([]);
    expect(rescue()).toBe("");
  });
  it("a modified ordinary tracked file does not stop and lands in the WIP commit", () => {
    writeFileSync(join(wt, "a.txt"), "changed\n");
    expect(salvage(mk(), { ticket: "DGS-9" }).ok).toBe(true);
    expect(sh(wt, "log", "-1", "--format=%s")).toBe("wip(dgs-9): salvage before teardown");
    expect(sh(wt, "show", "HEAD:a.txt")).toBe("changed");
    expect(rescue()).toContain("rescue/DGS-9");
  });
  it("a committed .env on a clean unmerged branch stops everything", () => {
    writeFileSync(join(wt, ".env"), "s\n"); sh(wt, "add", "-f", "."); sh(wt, "commit", "-qm", "oops");
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(!r.ok && r.message).toBe("not salvaged: .env (matches .env*); Jack decides");
    expect(bundles()).toEqual([]);
    expect(rescue()).toBe("");
  });
  it("a committed file over 5 MB stops everything", () => {
    writeFileSync(join(wt, "big.bin"), Buffer.alloc(5 * 1024 * 1024 + 1)); sh(wt, "add", "."); sh(wt, "commit", "-qm", "big");
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(!r.ok && r.message).toBe("not salvaged: big.bin (matches over 5 MB); Jack decides");
    expect(rescue()).toBe("");
  });
  it("a committed secret file deleted from the working tree is still found, with its size from git", () => {
    writeFileSync(join(wt, "my.pem"), "s\n"); sh(wt, "add", "."); sh(wt, "commit", "-qm", "pem");
    rmSync(join(wt, "my.pem"));
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(!r.ok && r.message).toBe("not salvaged: my.pem (matches *.pem); Jack decides");
  });
  it("a .env added in one commit and deleted in the next still stops everything", () => {
    writeFileSync(join(wt, ".env"), "s\n"); sh(wt, "add", "-f", "."); sh(wt, "commit", "-qm", "add");
    sh(wt, "rm", "-q", ".env"); sh(wt, "commit", "-qm", "remove");
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(!r.ok && r.message).toBe("not salvaged: .env (matches .env*); Jack decides");
    expect(bundles()).toEqual([]);
    expect(rescue()).toBe("");
  });
  it("a 6 MB file added then deleted still stops everything", () => {
    writeFileSync(join(wt, "big.bin"), Buffer.alloc(6 * 1024 * 1024)); sh(wt, "add", "."); sh(wt, "commit", "-qm", "add");
    sh(wt, "rm", "-q", "big.bin"); sh(wt, "commit", "-qm", "remove");
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(!r.ok && r.message).toBe("not salvaged: big.bin (matches over 5 MB); Jack decides");
    expect(rescue()).toBe("");
  });
  it("a file renamed to a secret name stops everything", () => {
    sh(wt, "mv", "a.txt", "api-token.json"); sh(wt, "commit", "-qm", "rename");
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(!r.ok && r.message).toBe("not salvaged: api-token.json (matches *token*); Jack decides");
  });
  it("a normal committed branch with a deleted file passes", () => {
    writeFileSync(join(wt, "x.ts"), "x\n"); sh(wt, "add", "."); sh(wt, "commit", "-qm", "x");
    sh(wt, "rm", "-q", "x.ts"); sh(wt, "commit", "-qm", "rm x");
    expect(salvage(mk(), { ticket: "DGS-9" }).ok).toBe(true);
    expect(rescue()).toContain("rescue/DGS-9");
  });
  it("a committed file that git cannot size stops everything (fails closed)", () => {
    writeFileSync(join(wt, "n.ts"), "x\n"); sh(wt, "add", "."); sh(wt, "commit", "-qm", "n");
    const pushes: string[][] = [];
    const git: typeof realGit = (cwd, args) => {
      if (args[0] === "cat-file") throw new Error("fatal: boom");
      if (args[0] === "push") pushes.push(args);
      return realGit(cwd, args);
    };
    const r = salvage(mk({ git }), { ticket: "DGS-9" });
    expect(!r.ok && r.message).toBe("not salvaged: cannot check n.ts");
    expect(pushes).toEqual([]);
    expect(bundles()).toEqual([]);
    expect(rescue()).toBe("");
  });
  it("a file over 5 MB stops everything", () => {
    writeFileSync(join(wt, "big.bin"), Buffer.alloc(5 * 1024 * 1024 + 1));
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(!r.ok && r.message).toBe("not salvaged: big.bin (matches over 5 MB); Jack decides");
    expect(rescue()).toBe("");
  });
  it("a rejected push is a failure and leaves no rescue branch", () => {
    writeFileSync(join(wt, "n.ts"), "x\n");
    mkdirSync(join(origin, "hooks"), { recursive: true });
    writeFileSync(join(origin, "hooks", "pre-receive"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/push/);
    expect(rescue()).toBe("");
  });
  it("a diverged rescue/KEY: say so, push to rescue/KEY-<UTC>, never force, old ref untouched", () => {
    // a rescue/DGS-9 on origin with a history that is not an ancestor of the branch
    sh(repo, "checkout", "-q", "--orphan", "other"); sh(repo, "rm", "-rqf", ".");
    writeFileSync(join(repo, "o.txt"), "o\n"); sh(repo, "add", "."); sh(repo, "commit", "-qm", "other history");
    const old = sh(repo, "rev-parse", "HEAD");
    sh(repo, "push", "-q", "origin", "other:refs/heads/rescue/DGS-9");
    sh(repo, "checkout", "-q", "-f", "main");
    writeFileSync(join(wt, "n.ts"), "x\n");
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(r.ok).toBe(true);
    expect(r.ok && r.pushed).toBe("rescue/DGS-9-20261022T030405Z");
    expect(r.steps.join("\n")).toMatch(/rescue\/DGS-9 exists and has diverged/);
    expect(sh(origin, "rev-parse", "refs/heads/rescue/DGS-9")).toBe(old);
    expect(sh(origin, "rev-parse", "refs/heads/rescue/DGS-9-20261022T030405Z")).toBe(sh(wt, "rev-parse", "HEAD"));
  });
  it("the dated rescue name shares the bundle's stamp even when the clock moves", () => {
    sh(repo, "checkout", "-q", "--orphan", "other"); sh(repo, "rm", "-rqf", ".");
    writeFileSync(join(repo, "o.txt"), "o\n"); sh(repo, "add", "."); sh(repo, "commit", "-qm", "other history");
    sh(repo, "push", "-q", "origin", "other:refs/heads/rescue/DGS-9");
    sh(repo, "checkout", "-q", "-f", "main");
    writeFileSync(join(wt, "n.ts"), "x\n");
    let t = Date.parse("2026-10-22T03:04:05Z");
    const r = salvage(mk({ now: () => new Date((t += 60000)) }), { ticket: "DGS-9" });
    expect(r.ok).toBe(true);
    const stamp = /DGS-9-(\w+)\.bundle$/.exec(bundles()[0])?.[1];
    expect(r.ok && r.pushed).toBe(`rescue/DGS-9-${stamp}`);
  });
  it("a plain push gives pushed = rescue/KEY", () => {
    writeFileSync(join(wt, "n.ts"), "x\n");
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(r.ok && r.pushed).toBe("rescue/DGS-9");
  });
  it("--worktree given as a symlinked path still finds the worktree", () => {
    const link = join(root, "wt-link");
    symlinkSync(wt, link);
    writeFileSync(join(wt, "n.ts"), "x\n");
    const r = salvage(mk(), { ticket: "DGS-9", worktree: link });
    expect(r.ok).toBe(true);
    expect(rescue()).toContain("rescue/DGS-9");
  });
  it("a key with a digit in its prefix is accepted, a bad key is refused", () => {
    expect(salvage(mk(), { ticket: "bad key" })).toMatchObject({ ok: false });
    sh(repo, "worktree", "add", "-q", "-b", "AB2-5__x", join(root, "wt3"), "main");
    writeFileSync(join(root, "wt3", "n.ts"), "x\n");
    expect(salvage(mk(), { ticket: "AB2-5" }).ok).toBe(true);
  });
  it("known caches are skipped: not in the WIP commit, not in the dirty check, and a step names them", () => {
    mkdirSync(join(wt, ".impeccable"));
    writeFileSync(join(wt, ".impeccable", "c.json"), "{}\n");
    writeFileSync(join(wt, "n.ts"), "x\n");
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(r.ok).toBe(true);
    expect(r.steps.join("\n")).toMatch(/skip known caches: \.impeccable\//);
    expect(sh(wt, "show", "--name-only", "--format=", "HEAD")).toBe("n.ts");
    expect(existsSync(join(wt, ".impeccable", "c.json"))).toBe(true);
  });
  it("a tree dirty with caches only and merged: nothing to salvage", () => {
    mkdirSync(join(wt, ".impeccable"));
    writeFileSync(join(wt, ".impeccable", "c.json"), "{}\n");
    expect(salvage(mk(), { ticket: "DGS-9" })).toMatchObject({ ok: true, bundle: null });
    expect(rescue()).toBe("");
  });
  it("two worktrees for the key: stop", () => {
    sh(repo, "worktree", "add", "-q", "-b", "DGS-9__y", join(root, "wt2"), "main");
    const r = salvage(mk(), { ticket: "DGS-9" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toBe("expected one worktree for DGS-9, found 2");
  });
  it("dry run changes nothing", () => {
    writeFileSync(join(wt, "new.ts"), "x\n");
    const before = sh(wt, "rev-parse", "HEAD");
    const r = salvage(mk(), { ticket: "DGS-9", dryRun: true });
    expect(r.ok && r.steps.every((s) => s.startsWith("would "))).toBe(true);
    expect(sh(wt, "rev-parse", "HEAD")).toBe(before);
    expect(bundles()).toEqual([]);
    expect(rescue()).toBe("");
  });
});

describe("resolveRepo", () => {
  const real = (p: string) => realpathSync(p);
  it("a normal repo gives its top level", () => expect(real(resolveRepo(realGit, repo))).toBe(real(repo)));
  it("a linked worktree gives the main checkout", () => expect(real(resolveRepo(realGit, wt))).toBe(real(repo)));
  it("a repo with a separate git dir gives its work tree", () => {
    const sep = join(root, "sep"), gd = join(root, "sep-gitdir");
    mkdirSync(sep);
    execFileSync("git", ["init", "-q", "-b", "main", "--separate-git-dir", gd, sep]);
    expect(real(resolveRepo(realGit, sep))).toBe(real(sep));
  });
  it("a linked worktree of a separate-git-dir repo gives the git dir (git keeps no pointer to the main checkout)", () => {
    const sep = join(root, "sep"), gd = join(root, "sep-gitdir"), lw = join(root, "sep-wt");
    mkdirSync(sep);
    execFileSync("git", ["init", "-q", "-b", "main", "--separate-git-dir", gd, sep]);
    for (const [k, v] of [["user.email", "t@t"], ["user.name", "t"]]) sh(sep, "config", k, v);
    writeFileSync(join(sep, "f"), "f\n"); sh(sep, "add", "."); sh(sep, "commit", "-qm", "i");
    sh(sep, "worktree", "add", "-q", "-b", "b", lw, "main");
    expect(real(resolveRepo(realGit, lw))).toBe(real(gd));
    expect(sh(resolveRepo(realGit, lw), "worktree", "list", "--porcelain")).toContain(real(lw));
  });
  it("a bare repo is a clear error", () => {
    expect(() => resolveRepo(realGit, origin)).toThrow("dg salvage needs a main checkout, not a bare repo; pass --repo");
  });
});
